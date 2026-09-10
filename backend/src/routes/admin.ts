import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { DatabaseAdapter } from "../db/database.js";
import { env } from "../env.js";
import { adminOk } from "../auth/codes.js";
import { sessionOf } from "./teams.js";

const EXPORT_TABLES = ["elo_log", "chat_logs", "team_inventory"] as const;

function adminHeader(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const h = req.headers["x-admin-code"];
  return Array.isArray(h) ? h[0] : h;
}

interface BoardRow {
  name: string;
  elo: number;
  solved: number;
  rewinds: number;
  lastSolve: string | null;
}

export function registerAdminRoutes(app: FastifyInstance, db: DatabaseAdapter, root: string): void {
  function guard(req: { headers: Record<string, string | string[] | undefined> }): boolean {
    return adminOk(adminHeader(req), env.adminCode);
  }

  // Rewind: −1 ELO immediately, bot context genuinely truncated to phase start.
  app.post("/api/rewind", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { botId?: unknown };
    if (typeof body.botId !== "string") {
      return reply.code(400).send({ error: "bot required" });
    }
    const team = db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = ?", session.teamId);
    if (team === undefined) {
      return reply.code(404).send({ error: "unknown team" });
    }
    const after = team.elo - 1;
    db.transaction(() => {
      db.run("DELETE FROM chat_logs WHERE team_id = ? AND bot_id = ?", session.teamId, body.botId as string);
      db.run("UPDATE teams SET elo = ? WHERE id = ?", after, session.teamId);
      db.run("INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) VALUES (?, -1, ?, ?, ?)", session.teamId, team.elo, after, `rewind:${body.botId as string}`);
    });
    return { ok: true, elo: after };
  });

  app.get("/api/admin/board", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const rows = db.all<BoardRow>(
      `SELECT t.name, t.elo,
        (SELECT COUNT(*) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified') AS solved,
        (SELECT COUNT(*) FROM elo_log l WHERE l.team_id = t.id AND l.reason LIKE 'rewind:%') AS rewinds,
        (SELECT MAX(i.verified_at) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified') AS lastSolve
       FROM teams t ORDER BY t.elo DESC, lastSolve ASC`,
    );
    return { rows };
  });

  app.get("/api/admin/export.json", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return {
      teams: db.all("SELECT id, name, elo, created_at FROM teams"),
      members: db.all("SELECT team_id, display_name, role, joined_at FROM team_members"),
      inventory: db.all("SELECT * FROM team_inventory"),
      elo_log: db.all("SELECT * FROM elo_log"),
    };
  });

  app.get("/api/admin/export.csv", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const query = req.query as { table?: unknown };
    if (typeof query.table !== "string" || !(EXPORT_TABLES as readonly string[]).includes(query.table)) {
      return reply.code(400).send({ error: "table must be elo_log|chat_logs|team_inventory" });
    }
    const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${query.table}`);
    const cols = rows.length > 0 ? Object.keys(rows[0] as object) : [];
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    void reply.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="${query.table}.csv"`);
    return csv;
  });

  app.post("/api/admin/backup", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const dir = join(root, "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = join(dir, `redline-${stamp}.db`);
    await db.backup(dest);
    return { file: dest };
  });
}
