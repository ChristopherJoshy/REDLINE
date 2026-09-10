import type { FastifyInstance } from "fastify";
import type { BotId } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
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

export function registerGateRoutes(app: FastifyInstance, db: DatabaseAdapter): void {
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
    };
  });

  app.post("/api/admin/end-round1", async (req, reply) => {
    if (!admin(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    db.run("INSERT INTO game_state (key, value) VALUES ('round1_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'");
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

  // Idempotent Round-2 entry: validates top-5 + permission, assigns one boss.
  app.post("/api/round2/enter", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    if (!vaultOpen(db) || !top5(db).includes(session.teamId)) {
      return reply.code(403).send({ error: "vault sealed" });
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
