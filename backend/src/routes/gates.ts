import type { FastifyInstance } from "fastify";
import type { BotId } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { Bus } from "../ws/bus.js";
import { env } from "../env.js";
import { adminOk } from "../auth/codes.js";
import { sessionOf } from "./teams.js";

export const ROUND1_SIZE = 8;

function admin(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const h = req.headers["x-admin-code"];
  return adminOk(Array.isArray(h) ? h[0] : h, env.adminCode);
}

export function round1Open(db: DatabaseAdapter): boolean {
  return db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'round1_open'")?.value !== "0";
}

export function vaultOpen(db: DatabaseAdapter): boolean {
  return db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'vault_open'")?.value === "1";
}

export function round2Status(db: DatabaseAdapter): "off" | "countdown" | "active" {
  const v = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'round2_status'")?.value;
  if (v === "countdown" || v === "active") return v;
  return "off";
}

export function round2Timer(db: DatabaseAdapter): string | null {
  return db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'round2_timer'")?.value ?? null;
}

export function round2Duration(db: DatabaseAdapter): number {
  const v = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'round2_duration'")?.value;
  return v ? parseInt(v, 10) || 1800 : 1800;
}

export function round2TimeLeft(db: DatabaseAdapter): number {
  const status = round2Status(db);
  if (status === "off") return 0;
  const timer = round2Timer(db);
  if (!timer) return 0;
  const endMs = new Date(timer).getTime();
  const leftMs = endMs - Date.now();
  return Math.max(0, Math.ceil(leftMs / 1000));
}

export function setRound2State(
  db: DatabaseAdapter,
  status: "off" | "countdown" | "active",
  timer: string | null,
): void {
  db.run("INSERT INTO game_state (key, value) VALUES ('round2_status', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", status);
  if (timer !== null) {
    db.run("INSERT INTO game_state (key, value) VALUES ('round2_timer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", timer);
  }
}

export function top5(db: DatabaseAdapter): string[] {
  try {
    const raw = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'top5'")?.value ?? "[]";
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function solvedCount(db: DatabaseAdapter, teamId: string): number {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM team_inventory WHERE team_id = ? AND status = 'verified'", teamId)?.n ?? 0;
}

export function registerGateRoutes(app: FastifyInstance, db: DatabaseAdapter, bus: Bus): void {
  app.get("/api/gates", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const qualified = vaultOpen(db) && top5(db).includes(session.teamId);
    return {
      round1Open: round1Open(db),
      vaultOpen: vaultOpen(db),
      qualified,
      solved: solvedCount(db, session.teamId),
      round1Size: ROUND1_SIZE,
      round2Status: round2Status(db),
      round2TimeLeft: round2TimeLeft(db),
    };
  });

  app.post("/api/admin/end-round1", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    db.run("INSERT INTO game_state (key, value) VALUES ('round1_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'");
    // Also stop round 2 if it was running
    const r2 = round2Status(db);
    if (r2 !== "off") {
      setRound2State(db, "off", null);
      bus.broadcastAll(bus.frame("round2_end", { reason: "admin_stop" }));
    }
    return { ok: true };
  });

  app.post("/api/admin/compute-top5", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const rows = db.all<{ id: string }>(
      `SELECT t.id FROM teams t ORDER BY t.elo DESC,
        (SELECT MAX(i.verified_at) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified') ASC LIMIT 5`,
    );
    const ids = rows.map((r) => r.id);
    db.run("INSERT INTO game_state (key, value) VALUES ('top5', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(ids));
    return { top5: ids };
  });

  app.post("/api/admin/open-vault", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    db.run("INSERT INTO game_state (key, value) VALUES ('vault_open', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    return { ok: true };
  });

  // Start Round 2: freeze R1, compute top5, open vault, begin 30s countdown
  app.post("/api/admin/start-round2", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { durationSecs?: unknown };
    const duration = typeof body.durationSecs === "number" && body.durationSecs > 0 ? body.durationSecs : 1800;
    db.run("INSERT INTO game_state (key, value) VALUES ('round1_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'");
    const rows = db.all<{ id: string }>(
      `SELECT t.id FROM teams t ORDER BY t.elo DESC,
        (SELECT MAX(i.verified_at) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified') ASC LIMIT 5`,
    );
    const ids = rows.map((r) => r.id);
    db.run("INSERT INTO game_state (key, value) VALUES ('top5', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(ids));
    db.run("INSERT INTO game_state (key, value) VALUES ('vault_open', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    db.run("INSERT INTO game_state (key, value) VALUES ('round2_duration', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(duration));
    const endsAt = new Date(Date.now() + 30_000).toISOString();
    setRound2State(db, "countdown", endsAt);
    bus.broadcastAll(bus.frame("round2_countdown", { endsAt }));
    return { ok: true, countdownEndsAt: endsAt, duration };
  });

  // Stop Round 2 immediately
  app.post("/api/admin/stop-round2", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    setRound2State(db, "off", null);
    bus.broadcastAll(bus.frame("round2_end", { reason: "admin_stop" }));
    return { ok: true };
  });

  // Extend Round 2 by N seconds
  app.post("/api/admin/extend-round2", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { addSecs?: unknown };
    const addSecs = typeof body.addSecs === "number" && body.addSecs > 0 ? body.addSecs : 300;
    const curTimer = round2Timer(db);
    if (!curTimer || round2Status(db) === "off") {
      return reply.code(400).send({ error: "round 2 not active" });
    }
    const newEnd = new Date(new Date(curTimer).getTime() + addSecs * 1000).toISOString();
    db.run("INSERT INTO game_state (key, value) VALUES ('round2_timer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", newEnd);
    bus.broadcastAll(bus.frame("round2_extend", { addedSecs: addSecs, newEndsAt: newEnd }));
    return { ok: true, newEndsAt: newEnd, addedSecs: addSecs };
  });

  // Idempotent Round-2 entry: validates top-5 + permission, assigns one boss.
  app.post("/api/round2/enter", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    if (!vaultOpen(db) || !top5(db).includes(session.teamId)) {
      return reply.code(403).send({ error: "vault sealed" });
    }
    if (round2Status(db) === "off") {
      return reply.code(403).send({ error: "round 2 not active" });
    }
    const existing = db.get<{ boss: string }>("SELECT boss FROM r2_assignments WHERE team_id = ?", session.teamId);
    if (existing !== undefined) {
      return { boss: existing.boss as BotId };
    }
    const boss: BotId = Math.random() < 0.5 ? "itachi" : "aizen";
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES (?, ?)", session.teamId, boss);
    return { boss };
  });
}
