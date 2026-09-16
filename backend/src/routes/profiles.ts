// Cover profiles: create-once, modify-after. One row per (team, member, bot);
// the whole team can read every row (team-synced covers).
import type { FastifyInstance } from "fastify";
import type { DatabaseAdapter } from "../db/database.js";
import { sessionOf } from "./teams.js";
import { getCover, type CoverProfile } from "../bots/coverLens.js";

const MAX_ALIAS = 40;
const MAX_FIELD = 80;
const MAX_DETAIL = 280;
const VALID_BOTS = new Set(["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool", "itachi", "aizen"]);

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

function validBot(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (!VALID_BOTS.has(v)) return undefined;
  return v;
}

export function registerProfileRoutes(app: FastifyInstance, db: DatabaseAdapter): void {
  // Own cover for a specific bot, or null when none filed yet.
  app.get("/api/profile", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const botId = validBot((req.query as Record<string, unknown>).bot_id);
    if (botId === undefined) {
      return reply.code(400).send({ error: "bot_id required" });
    }
    const row = getCover(db, session.teamId, session.displayName, botId);
    return { profile: row ?? null };
  });

  // Whole-team covers (sync view for teammates).
  app.get("/api/profiles", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const rows = db.all<CoverProfile>(
      "SELECT * FROM cover_profiles WHERE team_id = ? ORDER BY display_name, bot_id",
      session.teamId,
    );
    return { profiles: rows };
  });

  // Create ONCE per bot — after that, only PATCH may change it.
  app.post("/api/profile", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { alias?: unknown; role?: unknown; affiliation?: unknown; detail?: unknown; bot_id?: unknown };
    const botId = validBot(body.bot_id);
    if (botId === undefined) {
      return reply.code(400).send({ error: "bot_id required (valid bot id)" });
    }
    if (getCover(db, session.teamId, session.displayName, botId) !== undefined) {
      return reply.code(409).send({ error: "profile exists — modify it" });
    }
    const alias = str(body.alias, MAX_ALIAS);
    if (alias === undefined) {
      return reply.code(400).send({ error: `alias required (1-${MAX_ALIAS} chars)` });
    }
    const role = body.role === undefined ? "" : opt(body.role, MAX_FIELD);
    const affiliation = body.affiliation === undefined ? "" : opt(body.affiliation, MAX_FIELD);
    const detail = body.detail === undefined ? "" : opt(body.detail, MAX_DETAIL);
    if (role === undefined || affiliation === undefined || detail === undefined) {
      return reply.code(400).send({ error: `field too long (role/affiliation ≤${MAX_FIELD}, detail ≤${MAX_DETAIL})` });
    }
    db.run(
      "INSERT INTO cover_profiles (team_id, display_name, bot_id, alias, role, affiliation, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
      session.teamId,
      session.displayName,
      botId,
      alias,
      role,
      affiliation,
      detail,
    );
    const row = getCover(db, session.teamId, session.displayName, botId);
    return { profile: row };
  });

  // Modify only — 404 when nothing was ever created.
  app.patch("/api/profile", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { alias?: unknown; role?: unknown; affiliation?: unknown; detail?: unknown; bot_id?: unknown };
    const botId = validBot(body.bot_id);
    if (botId === undefined) {
      return reply.code(400).send({ error: "bot_id required (valid bot id)" });
    }
    const prev = getCover(db, session.teamId, session.displayName, botId);
    if (prev === undefined) {
      return reply.code(404).send({ error: "create a profile first" });
    }
    const alias = body.alias === undefined ? prev.alias : str(body.alias, MAX_ALIAS);
    const role = body.role === undefined ? prev.role : opt(body.role, MAX_FIELD);
    const affiliation = body.affiliation === undefined ? prev.affiliation : opt(body.affiliation, MAX_FIELD);
    const detail = body.detail === undefined ? prev.detail : opt(body.detail, MAX_DETAIL);
    if (alias === undefined || role === undefined || affiliation === undefined || detail === undefined) {
      return reply.code(400).send({ error: `bad field (alias 1-${MAX_ALIAS}, role/affiliation ≤${MAX_FIELD}, detail ≤${MAX_DETAIL})` });
    }
    db.run(
      "UPDATE cover_profiles SET alias = ?, role = ?, affiliation = ?, detail = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE team_id = ? AND display_name = ? AND bot_id = ?",
      alias,
      role,
      affiliation,
      detail,
      session.teamId,
      session.displayName,
      botId,
    );
    return { profile: getCover(db, session.teamId, session.displayName, botId) };
  });
}

