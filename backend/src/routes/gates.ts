import type { FastifyInstance } from "fastify";
import type { BotId } from "../contracts/events.js";
import type { RoundNumber } from "../contracts/rounds.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { Bus } from "../ws/bus.js";
import { env } from "../env.js";
import { adminOk } from "../auth/codes.js";
import { sessionOf } from "./teams.js";
import { extendRound, roundSnapshot, roundState, startRound, stopRound, pauseRound, resumeRound, reduceRound } from "../rounds/state.js";

export const ROUND1_SIZE = 8;
function admin(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const h = req.headers["x-admin-code"];
  return adminOk(Array.isArray(h) ? h[0] : h, env.adminCode);
}
export function round1Open(db: DatabaseAdapter): boolean { return roundState(db, 1).status === "active"; }
export function vaultOpen(db: DatabaseAdapter): boolean {
  return db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'vault_open'")?.value === "1";
}
export function round2Status(db: DatabaseAdapter): "off" | "countdown" | "active" | "paused" {
  const status = roundState(db, 2).status;
  return status === "countdown" || status === "active" || status === "paused" ? status : "off";
}
export function round2Duration(db: DatabaseAdapter): number { return roundState(db, 2).durationSecs; }
export function round2TimeLeft(db: DatabaseAdapter): number {
  const state = roundState(db, 2);
  const end = state.status === "countdown" ? state.startsAt : state.status === "active" || state.status === "paused" ? state.endsAt : null;
  return end ? Math.max(0, Math.ceil((Date.parse(end) - Date.now()) / 1000)) : 0;
}
export function round1TimeLeft(db: DatabaseAdapter): number {
  const state = roundState(db, 1);
  const end = state.status === "countdown" ? state.startsAt : state.status === "active" || state.status === "paused" ? state.endsAt : null;
  return end ? Math.max(0, Math.ceil((Date.parse(end) - Date.now()) / 1000)) : 0;
}
export function isQualified(db: DatabaseAdapter, teamId: string): boolean {
  const row = db.get<{ is_qualified: number; round2_eligible: number }>("SELECT is_qualified, round2_eligible FROM teams WHERE id = ?", teamId);
  return (row?.is_qualified === 1) || (row?.round2_eligible === 1);
}
export function isRound2Eligible(db: DatabaseAdapter, teamId: string): boolean {
  const row = db.get<{ is_qualified: number; round2_eligible: number }>("SELECT is_qualified, round2_eligible FROM teams WHERE id = ?", teamId);
  return (row?.round2_eligible === 1) || (row?.is_qualified === 1);
}
export function solvedCount(db: DatabaseAdapter, teamId: string): number {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM team_inventory WHERE team_id = ? AND status = 'verified' AND bot_id NOT IN ('itachi', 'aizen')", teamId)?.n ?? 0;
}

export function registerGateRoutes(app: FastifyInstance, db: DatabaseAdapter, bus: Bus): void {
  app.get("/api/gates", async (req, reply) => {
    const session = sessionOf(req);
    const isAdmin = admin(req);
    if (!session && !isAdmin) return reply.code(401).send({ error: "unauthorized" });
    return { ...roundSnapshot(db), round1Open: round1Open(db), vaultOpen: vaultOpen(db),
      qualified: session ? (vaultOpen(db) && isQualified(db, session.teamId)) : false,
      solved: session ? solvedCount(db, session.teamId) : 0, round1Size: ROUND1_SIZE,
      round2Status: round2Status(db), round2TimeLeft: round2TimeLeft(db),
      round1TimeLeft: round1TimeLeft(db) };
  });
  app.get("/api/admin/rounds", async (req, reply) => {
    if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
    return roundSnapshot(db);
  });

  app.get("/api/admin/round2/control", async (req, reply) => {
    if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
    const unassigned = db.all<{ id: string }>("SELECT id FROM teams WHERE round2_eligible = 1 AND id NOT IN (SELECT team_id FROM r2_assignments)");
    if (unassigned.length > 0) {
      let itachiCount = db.get<{ count: number }>("SELECT COUNT(*) as count FROM r2_assignments WHERE boss = 'itachi'")?.count ?? 0;
      let aizenCount = db.get<{ count: number }>("SELECT COUNT(*) as count FROM r2_assignments WHERE boss = 'aizen'")?.count ?? 0;
      
      for (let i = unassigned.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unassigned[i], unassigned[j]] = [unassigned[j]!, unassigned[i]!];
      }
      
      for (const t of unassigned) {
        const boss = itachiCount <= aizenCount ? "itachi" : "aizen";
        if (boss === "itachi") itachiCount++;
        else aizenCount++;
        db.run("INSERT INTO r2_assignments (team_id, boss) VALUES (?, ?)", t.id, boss);
      }
    }
    const teams = db.all<{ id: string; name: string; boss: string | null; phaseOverride: string | null }>(
      `SELECT t.id, t.name, a.boss,
        (SELECT value FROM game_state WHERE key = 'r2_phase_override:' || t.id || ':' || a.boss) AS phaseOverride
       FROM teams t LEFT JOIN r2_assignments a ON a.team_id = t.id WHERE t.round2_eligible = 1 ORDER BY t.name`,
    );
    return { teams };
  });

  app.post("/api/admin/round2/assignment", async (req, reply) => {
    if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { teamId?: unknown; boss?: unknown; reset?: unknown; reason?: unknown };
    if (typeof body.teamId !== "string" || (body.boss !== "itachi" && body.boss !== "aizen")) return reply.code(400).send({ error: "teamId and boss are required" });
    const team = db.get<{ id: string }>("SELECT id FROM teams WHERE id = ?", body.teamId);
    if (!team) return reply.code(404).send({ error: "team not found" });
    const existing = db.get<{ boss: string }>("SELECT boss FROM r2_assignments WHERE team_id = ?", body.teamId);
    if (existing && existing.boss !== body.boss && body.reset !== true) return reply.code(409).send({ error: "Changing a boss requires reset=true." });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 240) : "admin assignment";
    db.transaction(() => {
      db.run("INSERT INTO r2_assignments (team_id, boss) VALUES (?, ?) ON CONFLICT(team_id) DO UPDATE SET boss = excluded.boss", body.teamId as string, body.boss as string);
      if (existing && existing.boss !== body.boss) {
        db.run("DELETE FROM chat_logs WHERE team_id = ? AND bot_id IN ('itachi','aizen')", body.teamId as string);
        db.run("DELETE FROM team_inventory WHERE team_id = ? AND bot_id IN ('itachi','aizen')", body.teamId as string);
        db.run("DELETE FROM r2_scores WHERE team_id = ?", body.teamId as string);
      }
      db.run("INSERT INTO admin_audit (action, target_id, reason, detail) VALUES (?, ?, ?, ?)", "round2_assignment", body.teamId as string, reason, JSON.stringify({ boss: body.boss, reset: body.reset === true }));
    });
    return { ok: true, teamId: body.teamId, boss: body.boss };
  });

  app.post("/api/admin/round2/phase", async (req, reply) => {
    if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { teamId?: unknown; boss?: unknown; phase?: unknown; reason?: unknown };
    if (typeof body.teamId !== "string" || (body.boss !== "itachi" && body.boss !== "aizen") || !["auto", "p1", "p2"].includes(String(body.phase))) return reply.code(400).send({ error: "teamId, boss, and phase (auto|p1|p2) are required" });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 240) : "admin phase control";
    db.run("INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", `r2_phase_override:${body.teamId}:${body.boss}`, body.phase as string);
    db.run("INSERT INTO admin_audit (action, target_id, reason, detail) VALUES (?, ?, ?, ?)", "round2_phase", body.teamId as string, reason, JSON.stringify({ boss: body.boss, phase: body.phase }));
    return { ok: true, phase: body.phase };
  });

  for (const round of [1, 2] as const) {
    app.post(`/api/admin/start-round${round}`, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      const body = (req.body ?? {}) as { durationSecs?: unknown; endsAt?: unknown; selectedTeamIds?: string[] };
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
            db.run("UPDATE teams SET elo = 600, round2_eligible = 0");
            
            // Set eligible teams
            if (Array.isArray(body.selectedTeamIds) && body.selectedTeamIds.length > 0) {
              const placeholders = body.selectedTeamIds.map(() => "?").join(",");
              db.run(`UPDATE teams SET round2_eligible = 1, is_qualified = 1 WHERE id IN (${placeholders})`, ...body.selectedTeamIds);
            } else {
              db.run("UPDATE teams SET round2_eligible = 1, is_qualified = 1 WHERE is_qualified = 1");
            }
            
            // Auto-assign random boss (Itachi or Aizen) for advancing teams
            const advancing = db.all<{ id: string }>("SELECT id FROM teams WHERE round2_eligible = 1");
            for (const t of advancing) {
              const existing = db.get<{ boss: string }>("SELECT boss FROM r2_assignments WHERE team_id = ?", t.id);
              if (!existing) {
                const boss: BotId = Math.random() < 0.5 ? "itachi" : "aizen";
                db.run("INSERT INTO r2_assignments (team_id, boss) VALUES (?, ?)", t.id, boss);
              }
            }

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
      try {
        const state = db.transaction(() => extendRound(db, round, body.addSecs as number));
        if (round === 2 && state.endsAt) bus.broadcastAll(bus.frame("round2_extend", { addedSecs: body.addSecs, newEndsAt: state.endsAt }));
        return { ok: true, ...roundSnapshot(db) };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not extend round." });
      }
    });
    
    app.post(`/api/admin/reduce-round${round}`, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      const body = (req.body ?? {}) as { reduceSecs?: unknown };
      if (typeof body.reduceSecs !== "number") return reply.code(400).send({ error: "reduceSecs is required." });
      try {
        const state = db.transaction(() => reduceRound(db, round, body.reduceSecs as number));
        // We could emit a round2_extend with negative secs, but clients polling /api/gates will catch up anyway.
        return { ok: true, ...roundSnapshot(db) };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not reduce round." });
      }
    });

    app.post(`/api/admin/pause-round${round}`, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      try {
        db.transaction(() => pauseRound(db, round));
        return { ok: true, ...roundSnapshot(db) };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not pause round." });
      }
    });

    app.post(`/api/admin/resume-round${round}`, async (req, reply) => {
      if (!admin(req)) return reply.code(401).send({ error: "unauthorized" });
      try {
        db.transaction(() => resumeRound(db, round));
        return { ok: true, ...roundSnapshot(db) };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not resume round." });
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
    if (!isRound2Eligible(db, session.teamId) && !isQualified(db, session.teamId)) {
      return reply.code(403).send({ error: "not_selected" });
    }
    if (round2Status(db) !== "active") {
      return reply.code(403).send({ error: "Round 2 is not active yet." });
    }
    // Ensure vault is marked open once round 2 is active
    db.run("INSERT INTO game_state (key, value) VALUES ('vault_open', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");

    const existing = db.get<{ boss: string }>("SELECT boss FROM r2_assignments WHERE team_id = ?", session.teamId);
    if (existing) return { boss: existing.boss as BotId, newlyAssigned: false };
    const boss: BotId = Math.random() < 0.5 ? "itachi" : "aizen";
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES (?, ?)", session.teamId, boss);
    return { boss, newlyAssigned: true };
  });
}
