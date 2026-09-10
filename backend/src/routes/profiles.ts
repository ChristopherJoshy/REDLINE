// Cover profiles: create-once, modify-after. One row per (team, member);
// the whole team can read every row (team-synced covers).
import type { FastifyInstance } from "fastify";
import type { DatabaseAdapter } from "../db/database.js";
import { sessionOf } from "./teams.js";
import { getCover, type CoverProfile } from "../bots/coverLens.js";

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().replace(/\s+/g, " ");
  if (t === "" || t.length > max) return undefined;
  return t;
}

function opt(v: unknown, max: number): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim().replace(/\s+/g, " ");
  if (t.length > max) return undefined;
  return t;
}

export function registerProfileRoutes(app: FastifyInstance, db: DatabaseAdapter): void {
  // Own cover, or 404 when none filed yet (client gates chat on this).
  app.get("/api/profile", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const row = getCover(db, session.teamId, session.displayName);
    if (row === undefined) {
      return reply.code(404).send({ error: "no profile" });
    }
    return { profile: row };
  });

  // Whole-team covers (sync view for teammates).
  app.get("/api/profiles", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const rows = db.all<CoverProfile>(
      "SELECT * FROM cover_profiles WHERE team_id = ? ORDER BY display_name",
      session.teamId,
    );
    return { profiles: rows };
  });

  // Create ONCE — after that, only PATCH may change it.
  app.post("/api/profile", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    if (getCover(db, session.teamId, session.displayName) !== undefined) {
      return reply.code(409).send({ error: "profile exists — modify it" });
    }
    const body = (req.body ?? {}) as { alias?: unknown; role?: unknown; affiliation?: unknown; detail?: unknown };
    const alias = str(body.alias, 40);
    if (alias === undefined) {
      return reply.code(400).send({ error: "alias required (1-40 chars)" });
    }
    const role = body.role === undefined ? "" : opt(body.role, 80);
    const affiliation = body.affiliation === undefined ? "" : opt(body.affiliation, 80);
    const detail = body.detail === undefined ? "" : opt(body.detail, 280);
    if (role === undefined || affiliation === undefined || detail === undefined) {
      return reply.code(400).send({ error: "field too long (role/affiliation ≤80, detail ≤280)" });
    }
    db.run(
      "INSERT INTO cover_profiles (team_id, display_name, alias, role, affiliation, detail) VALUES (?, ?, ?, ?, ?, ?)",
      session.teamId,
      session.displayName,
      alias,
      role,
      affiliation,
      detail,
    );
    const row = getCover(db, session.teamId, session.displayName);
    return { profile: row };
  });

  // Modify only — 404 when nothing was ever created.
  app.patch("/api/profile", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const prev = getCover(db, session.teamId, session.displayName);
    if (prev === undefined) {
      return reply.code(404).send({ error: "create a profile first" });
    }
    const body = (req.body ?? {}) as { alias?: unknown; role?: unknown; affiliation?: unknown; detail?: unknown };
    const alias = body.alias === undefined ? prev.alias : str(body.alias, 40);
    const role = body.role === undefined ? prev.role : opt(body.role, 80);
    const affiliation = body.affiliation === undefined ? prev.affiliation : opt(body.affiliation, 80);
    const detail = body.detail === undefined ? prev.detail : opt(body.detail, 280);
    if (alias === undefined || role === undefined || affiliation === undefined || detail === undefined) {
      return reply.code(400).send({ error: "bad field (alias 1-40, role/affiliation ≤80, detail ≤280)" });
    }
    db.run(
      "UPDATE cover_profiles SET alias = ?, role = ?, affiliation = ?, detail = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE team_id = ? AND display_name = ?",
      alias,
      role,
      affiliation,
      detail,
      session.teamId,
      session.displayName,
    );
    return { profile: getCover(db, session.teamId, session.displayName) };
  });
}
