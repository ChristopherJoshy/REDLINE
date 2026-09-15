import type { FastifyInstance } from "fastify";
import type { BotId } from "../contracts/events.js";
import type { RoundNumber } from "../contracts/rounds.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { Bus } from "../ws/bus.js";
import { env } from "../env.js";
import { adminOk } from "../auth/codes.js";
import { sessionOf } from "./teams.js";
import { extendRound, roundSnapshot, roundState, startRound, stopRound } from "../rounds/state.js";

export const ROUND1_SIZE = 8;
function admin(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const h = req.headers["x-admin-code"];
  return adminOk(Array.isArray(h) ? h[0] : h, env.adminCode);
}
export function round1Open(db: DatabaseAdapter): boolean { return roundState(db, 1).status === "active"; }
export function vaultOpen(db: DatabaseAdapter): boolean {
  return db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'vault_open'")?.value === "1";
}
export function round2Status(db: DatabaseAdapter): "off" | "countdown" | "active" {
  const status = roundState(db, 2).status;
  return status === "countdown" || status === "active" ? status : "off";
}
export function round2Duration(db: DatabaseAdapter): number { return roundState(db, 2).durationSecs; }
export function round2TimeLeft(db: DatabaseAdapter): number {
  const state = roundState(db, 2);
  const end = state.status === "countdown" ? state.startsAt : state.status === "active" ? state.endsAt : null;
  return end ? Math.max(0, Math.ceil((Date.parse(end) - Date.now()) / 1000)) : 0;
}
export function isQualified(db: DatabaseAdapter, teamId: string): boolean {
  return db.get<{ is_qualified: number }>("SELECT is_qualified FROM teams WHERE id = ?", teamId)?.is_qualified === 1;
}
export function solvedCount(db: DatabaseAdapter, teamId: string): number {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM team_inventory WHERE team_id = ? AND status = 'verified' AND bot_id NOT IN ('itachi', 'aizen')", teamId)?.n ?? 0;
}

export function registerGateRoutes(app: FastifyInstance, db: DatabaseAdapter, bus: Bus): void {
  app.get("/api/gates", async (req, reply) => {
    const session = sessionOf(req);
    if (!session) return reply.code(401).send({ error: "no session" });
    return { ...roundSnapshot(db), round1Open: round1Open(db), vaultOpen: vaultOpen(db),
      qualified: vaultOpen(db) && isQualified(db, session.teamId),
      solved: solvedCount(db, session.teamId), round1Size: ROUND1_SIZE,
      round2Status: round2Status(db), round2TimeLeft: round2TimeLeft(db) };
  });
  app.get("/api/admin/rounds", async (req, reply) => {
    if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
    return roundSnapshot(db);
  });

  for (const round of [1, 2] as const) {
    app.post(`/api/admin/start-round${round}`, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      const body = (req.body ?? {}) as { durationSecs?: unknown; endsAt?: unknown };
      const now = Date.now();
      const duration = typeof body.endsAt === "string" ? Math.floor((Date.parse(body.endsAt) - now - 30_000) / 1000) : body.durationSecs;
      if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 86400) {
        return reply.code(400).send({ error: "Choose a duration from 1 second to 24 hours, or an end time after the 30-second countdown." });
      }
      try {
        const state = db.transaction(() => {
          const started = startRound(db, round, duration, now);
          if (round === 2) {
            db.run("INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) SELECT id, 600 - elo, elo, 600, 'round2_start_reset' FROM teams");
            db.run("UPDATE teams SET elo = 600");
            db.run("INSERT INTO game_state (key, value) VALUES ('vault_open', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
          }
          return started;
        });
        if (round === 2 && state.startsAt) bus.broadcastAll(bus.frame("round2_countdown", { endsAt: state.startsAt }));
        return { ok: true, ...roundSnapshot(db), countdownEndsAt: state.startsAt, duration };
      } catch (error) {
        return reply.code(409).send({ error: error instanceof Error ? error.message : "Could not start round." });
      }
    });
    app.post(`/api/admin/extend-round${round}`, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      const body = (req.body ?? {}) as { addSecs?: unknown };
      if (typeof body.addSecs !== "number") return reply.code(400).send({ error: "addSecs is required." });
      const addSecs = body.addSecs;
      try {
        const state = db.transaction(() => extendRound(db, round, addSecs));
        if (round === 2 && state.endsAt) bus.broadcastAll(bus.frame("round2_extend", { addedSecs: addSecs, newEndsAt: state.endsAt }));
        return { ok: true, ...roundSnapshot(db) };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not extend round." });
      }
    });
  }
  function registerStop(path: string, round: RoundNumber): void {
    app.post(path, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      stopRound(db, round);
      if (round === 2) bus.broadcastAll(bus.frame("round2_end", { reason: "admin_stop" }));
      return { ok: true, ...roundSnapshot(db) };
    });
  }
  registerStop("/api/admin/end-round1", 1);
  registerStop("/api/admin/stop-round2", 2);
  app.post("/api/admin/open-vault", async (req, reply) => {
    if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
    if (round2Status(db) === "off") return reply.code(409).send({ error: "Start Round 2 to open the vault." });
    db.run("INSERT INTO game_state (key, value) VALUES ('vault_open', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    return { ok: true };
  });
  app.post("/api/round2/enter", async (req, reply) => {
    const session = sessionOf(req);
    if (!session) return reply.code(401).send({ error: "no session" });
    if (round2Status(db) !== "active" || !vaultOpen(db) || !isQualified(db, session.teamId)) return reply.code(403).send({ error: "vault sealed or not qualified" });
    const existing = db.get<{ boss: string }>("SELECT boss FROM r2_assignments WHERE team_id = ?", session.teamId);
    if (existing) return { boss: existing.boss as BotId };
    const boss: BotId = Math.random() < 0.5 ? "itachi" : "aizen";
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES (?, ?)", session.teamId, boss);
    return { boss };
  });
}
