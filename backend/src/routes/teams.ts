import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabaseAdapter } from "../db/database.js";
import { env } from "../env.js";
import {
  adminOk,
  displayCode,
  generateJoinCode,
  hashJoinCode,
  hintFor,
  makeSessionToken,
  normalizeCode,
  parseCookies,
  verifySessionToken,
} from "../auth/codes.js";

interface TeamRow {
  id: string;
  name: string;
}

interface MemberRow {
  display_name: string;
}

const SESSION_COOKIE = "redline_session";

export function sessionOf(req: { headers: Record<string, string | string[] | undefined> }): {
  teamId: string;
  displayName: string;
} | undefined {
  // 1. Check custom header x-session-token
  const xToken = req.headers["x-session-token"];
  const headerToken = Array.isArray(xToken) ? xToken[0] : xToken;
  if (typeof headerToken === "string" && headerToken.trim() !== "") {
    const verified = verifySessionToken(headerToken.trim(), env.joinCodePepper);
    if (verified) return verified;
  }

  // 2. Check Authorization Bearer header
  const auth = req.headers["authorization"];
  const authHeader = Array.isArray(auth) ? auth[0] : auth;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken !== "") {
      const verified = verifySessionToken(bearerToken, env.joinCodePepper);
      if (verified) return verified;
    }
  }

  // 3. Fallback to cookie
  const raw = req.headers["cookie"];
  const header = Array.isArray(raw) ? raw.join("; ") : raw;
  const token = parseCookies(header)[SESSION_COOKIE];
  if (token === undefined) {
    return undefined;
  }
  return verifySessionToken(token, env.joinCodePepper);
}

export function registerTeamRoutes(app: FastifyInstance, db: DatabaseAdapter): void {
  // Admin: create team + members. Code shown ONCE here, never stored.
  app.post("/api/admin/teams", async (req, reply) => {
    const header = req.headers["x-admin-code"];
    if (!adminOk(Array.isArray(header) ? header[0] : header, env.adminCode)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { name?: unknown; members?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const members = Array.isArray(body.members)
      ? body.members.filter((m): m is string => typeof m === "string").map((m) => m.trim()).filter((m) => m !== "")
      : [];
    if (name === "" || members.length < 2 || members.length > 3) {
      return reply.code(400).send({ error: "need a team name and 2-3 members" });
    }
    const code = generateJoinCode();
    const id = randomUUID();
    try {
      db.transaction(() => {
        db.run(
          "INSERT INTO teams (id, name, join_code_hash, hint, join_code) VALUES (?, ?, ?, ?, ?)",
          id,
          name,
          hashJoinCode(code, env.joinCodePepper),
          hintFor(code),
          displayCode(code),
        );
        const seen = new Set<string>();
        for (const displayName of members) {
          if (seen.has(displayName)) {
            continue;
          }
          seen.add(displayName);
          db.run("INSERT INTO team_members (team_id, display_name) VALUES (?, ?)", id, displayName);
        }
      });
    } catch {
      return reply.code(409).send({ error: "team name taken, retry" });
    }
    return { id, name, code: displayCode(code), hint: hintFor(code) };
  });

  // Player: enter code -> reveals ONLY this team's member names. No game info.
  app.post("/api/join", async (req, reply) => {
    const body = (req.body ?? {}) as { code?: unknown };
    const normalized = typeof body.code === "string" ? normalizeCode(body.code) : "";
    if (normalized.length !== 8) {
      return reply.code(401).send({ error: "invalid code" });
    }
    const team = db.get<TeamRow>("SELECT id, name FROM teams WHERE join_code_hash = ?", hashJoinCode(normalized, env.joinCodePepper));
    if (team === undefined) {
      return reply.code(401).send({ error: "invalid code" });
    }
    const members = db
      .all<MemberRow>("SELECT display_name FROM team_members WHERE team_id = ? ORDER BY rowid", team.id)
      .map((m) => m.display_name);
    return { teamId: team.id, teamName: team.name, members };
  });

  // Player: pick identity -> session binds (team_id, display_name).
  app.post("/api/identify", async (req, reply) => {
    const body = (req.body ?? {}) as { teamId?: unknown; displayName?: unknown };
    const teamId = typeof body.teamId === "string" ? body.teamId : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (teamId === "" || displayName === "") {
      return reply.code(400).send({ error: "pick who you are" });
    }
    const member = db.get<MemberRow>(
      "SELECT display_name FROM team_members WHERE team_id = ? AND display_name = ?",
      teamId,
      displayName,
    );
    if (member === undefined) {
      return reply.code(404).send({ error: "unknown identity" });
    }
    const token = makeSessionToken(teamId, displayName, env.joinCodePepper);
    const team = db.get<{ name: string; elo: number }>("SELECT name, elo FROM teams WHERE id = ?", teamId);
    void reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure`,
    );
    return {
      teamId,
      displayName,
      teamName: team?.name ?? "",
      elo: team?.elo ?? 1200,
      token,
    };
  });

  // Admin: reset team by id -> removes team, members, and related game data.
  app.delete("/api/admin/teams/:id", async (req, reply) => {
    const header = req.headers["x-admin-code"];
    if (!adminOk(Array.isArray(header) ? header[0] : header, env.adminCode)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const params = req.params as { id?: string };
    const teamId = typeof params.id === "string" ? params.id.trim() : "";
    if (teamId === "") {
      return reply.code(400).send({ error: "teamId required" });
    }
    const team = db.get<{ id: string }>("SELECT id FROM teams WHERE id = ?", teamId);
    if (team === undefined) {
      return reply.code(404).send({ error: "team not found" });
    }
    db.transaction(() => {
      db.run("DELETE FROM cover_profiles WHERE team_id = ?", teamId);
      db.run("DELETE FROM team_inventory WHERE team_id = ?", teamId);
      db.run("DELETE FROM merchant_clues WHERE team_id = ?", teamId);
      db.run("DELETE FROM chat_logs WHERE team_id = ?", teamId);
      db.run("DELETE FROM elo_log WHERE team_id = ?", teamId);
      db.run("DELETE FROM reasoning_traces WHERE team_id = ?", teamId);
      db.run("DELETE FROM sound_events WHERE team_id = ?", teamId);
      db.run("DELETE FROM fullscreen_attempts WHERE team_id = ?", teamId);
      db.run("DELETE FROM r2_assignments WHERE team_id = ?", teamId);
      db.run("DELETE FROM r2_scores WHERE team_id = ?", teamId);
      db.run("DELETE FROM deterrence_log WHERE team_id = ?", teamId);
      db.run("DELETE FROM team_members WHERE team_id = ?", teamId);
      db.run("DELETE FROM teams WHERE id = ?", teamId);
    });
    return { ok: true, teamId };
  });


  app.get("/api/me", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const member = db.get<MemberRow>(
      "SELECT display_name FROM team_members WHERE team_id = ? AND display_name = ?",
      session.teamId,
      session.displayName,
    );
    if (member === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const team = db.get<{ name: string; elo: number }>("SELECT name, elo FROM teams WHERE id = ?", session.teamId);
    return {
      teamId: session.teamId,
      displayName: session.displayName,
      teamName: team?.name ?? "",
      elo: team?.elo ?? 1200,
    };
  });

  app.post("/api/logout", async (_req, reply) => {
    void reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=None; Secure`,
    );
    return { ok: true };
  });
}

