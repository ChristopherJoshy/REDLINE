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
import { heartbeatPresence, memberNonce, mintSessionNonce, revokeSession } from "../presence.js";
import type { Bus } from "../ws/bus.js";

interface TeamRow {
  id: string;
  name: string;
}

interface MemberRow {
  display_name: string;
}

const SESSION_COOKIE = "redline_session";

export function sessionOf(
  req: { headers: Record<string, string | string[] | undefined> },
  db?: DatabaseAdapter,
): {
  teamId: string;
  displayName: string;
} | undefined {
  function checkNonce(verified: { teamId: string; displayName: string; nonce: string } | undefined): {
    teamId: string;
    displayName: string;
  } | undefined {
    if (!verified) return undefined;
    // Force-logout / logout bumps the member nonce: stale tokens die here.
    // Members without a row (legacy) keep working.
    if (db) {
      const current = memberNonce(db, verified.teamId, verified.displayName);
      if (current !== undefined && current !== verified.nonce) return undefined;
    }
    return { teamId: verified.teamId, displayName: verified.displayName };
  }
  // 1. Check custom header x-session-token
  const xToken = req.headers["x-session-token"];
  const headerToken = Array.isArray(xToken) ? xToken[0] : xToken;
  if (typeof headerToken === "string" && headerToken.trim() !== "") {
    const verified = checkNonce(verifySessionToken(headerToken.trim(), env.joinCodePepper));
    if (verified) return verified;
  }

  // 2. Check Authorization Bearer header
  const auth = req.headers["authorization"];
  const authHeader = Array.isArray(auth) ? auth[0] : auth;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken !== "") {
      const verified = checkNonce(verifySessionToken(bearerToken, env.joinCodePepper));
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
  return checkNonce(verifySessionToken(token, env.joinCodePepper));
}

/** In-memory seat lock: teamId → Set of display_names currently in-session */
const seatLocks = new Map<string, Set<string>>();

function lockSeat(teamId: string, displayName: string): void {
  if (!seatLocks.has(teamId)) seatLocks.set(teamId, new Set());
  seatLocks.get(teamId)!.add(displayName);
}

export function releaseSeat(teamId: string, displayName: string): void {
  seatLocks.get(teamId)?.delete(displayName);
}

function isSeatTaken(teamId: string, displayName: string, db: DatabaseAdapter): boolean {
  const locked = seatLocks.get(teamId)?.has(displayName) ?? false;
  if (!locked) return false;
  const member = db.get<{ presence: string }>(
    "SELECT presence FROM team_members WHERE team_id = ? AND display_name = ?",
    teamId,
    displayName,
  );
  if (member === undefined || member.presence === "offline") {
    releaseSeat(teamId, displayName);
    return false;
  }
  return true;
}

function activeSeats(teamId: string, db: DatabaseAdapter): string[] {
  const seats = Array.from(seatLocks.get(teamId) ?? []);
  for (const displayName of seats) {
    isSeatTaken(teamId, displayName, db);
  }
  return Array.from(seatLocks.get(teamId) ?? []);
}

export function registerTeamRoutes(app: FastifyInstance, db: DatabaseAdapter, bus?: Bus): void {
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
    // Check if this seat is already locked by another session
    if (isSeatTaken(teamId, displayName, db)) {
      return reply.code(409).send({ error: "That seat is already taken by another player." });
    }
    lockSeat(teamId, displayName);
    // Fresh nonce per login: re-login always works, kicked tokens stay dead.
    const nonce = mintSessionNonce(db, teamId, displayName);
    heartbeatPresence(db, teamId, displayName, "online");
    const token = makeSessionToken(teamId, displayName, env.joinCodePepper, nonce);
    const team = db.get<{ name: string; elo: number }>("SELECT name, elo FROM teams WHERE id = ?", teamId);
    void reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure`,
    );
    if (bus) bus.tick("board");
    return {
      teamId,
      displayName,
      teamName: team?.name ?? "",
      elo: team?.elo ?? 1200,
      token,
    };
  });

  // Presence heartbeat: keeps logged-in players visible while waiting screens
  // are rendered without the gameplay WebSocket.
  app.post("/api/presence", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { status?: unknown };
    const status = body.status === "away" ? "away" : "online";
    lockSeat(session.teamId, session.displayName);
    heartbeatPresence(db, session.teamId, session.displayName, status);
    return { ok: true, status };
  });

  // Get active (locked) members for a team — used by the Enter screen.
  app.get("/api/team/active", async (req, reply) => {
    const { teamId } = (req.query as Record<string, unknown>);
    if (typeof teamId !== "string" || teamId.trim() === "") {
      return reply.code(400).send({ error: "teamId required" });
    }
    return { active: activeSeats(teamId.trim(), db) };
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
      db.run("DELETE FROM bot_completions WHERE team_id = ?", teamId);
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
      db.run("DELETE FROM security_logs WHERE team_id = ?", teamId);
      db.run("DELETE FROM r2_memories WHERE team_id = ?", teamId);
      db.run("DELETE FROM r2_assessments WHERE team_id = ?", teamId);
      db.run("DELETE FROM team_members WHERE team_id = ?", teamId);
      db.run("DELETE FROM teams WHERE id = ?", teamId);
    });
    seatLocks.delete(teamId);
    return { ok: true, teamId };
  });


  app.get("/api/me", async (req, reply) => {
    const session = sessionOf(req, db);
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
    // Re-lock seat on page refresh — this won't block concurrent sessions
    // because the token already proves identity; we just restore the lock state.
    lockSeat(session.teamId, session.displayName);
    const team = db.get<{ name: string; elo: number }>("SELECT name, elo FROM teams WHERE id = ?", session.teamId);
    return {
      teamId: session.teamId,
      displayName: session.displayName,
      teamName: team?.name ?? "",
      elo: team?.elo ?? 1200,
    };
  });

  app.post("/api/logout", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session !== undefined) {
      releaseSeat(session.teamId, session.displayName);
      // Kill the token server-side and mark offline so the roster is truthful.
      // Re-login mints a fresh nonce and resumes the game via hello sync.
      revokeSession(db, session.teamId, session.displayName);
      if (bus) bus.tick("board");
    }
    void reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=None; Secure`,
    );
    return { ok: true };
  });
}

