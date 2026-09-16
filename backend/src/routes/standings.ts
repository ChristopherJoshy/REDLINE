import type { FastifyInstance } from "fastify";
import type { BotId } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import { ROUND1_BOTS } from "../bots/registry.js";
import { bossOf } from "../bots/r2.js";
import { round2Status } from "./gates.js";
import { sessionOf } from "./teams.js";

interface TeamRow {
  id: string;
  name: string;
  elo: number;
  solved: number;
  lastSolve: string | null;
}

function orderedTeams(db: DatabaseAdapter, round: 1 | 2): Array<TeamRow & { rank: number }> {
  const solved = round === 2
    ? "(SELECT COUNT(*) FROM team_inventory i JOIN r2_assignments a ON a.team_id = i.team_id AND a.boss = i.bot_id WHERE i.team_id = t.id AND i.status = 'verified')"
    : "(SELECT COUNT(*) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified' AND i.bot_id IN ('wick','spidey','escanor','stark','joker','light','levi','deadpool'))";
  const filter = round === 2 ? "AND t.round2_eligible = 1" : "";
  const rows = db.all<TeamRow>(
    `SELECT t.id, t.name, t.elo, ${solved} AS solved,
      (SELECT MAX(c.verified_at) FROM bot_completions c WHERE c.team_id = t.id AND c.round = ?) AS lastSolve
     FROM teams t
     WHERE t.is_archived = 0 ${filter}`,
    round,
  );
  return rows
    .sort((a, b) => b.elo - a.elo || (a.lastSolve ?? "9999").localeCompare(b.lastSolve ?? "9999") || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function firstDefeats(db: DatabaseAdapter): Array<{
  botId: BotId;
  completionRank: number | null;
  teamName: string | null;
  playerName: string | null;
  completedAt: string | null;
}> {
  return ROUND1_BOTS.map((botId) => {
    const row = db.get<{ completion_rank: number; team_name: string; completed_by: string; verified_at: string }>(
      `SELECT c.completion_rank, t.name AS team_name, c.completed_by, c.verified_at
       FROM bot_completions c JOIN teams t ON t.id = c.team_id
       WHERE c.bot_id = ? ORDER BY c.completion_rank ASC LIMIT 1`,
      botId,
    );
    return row === undefined
      ? { botId, completionRank: null, teamName: null, playerName: null, completedAt: null }
      : { botId, completionRank: row.completion_rank, teamName: row.team_name, playerName: row.completed_by, completedAt: row.verified_at };
  });
}

function round2Contributions(db: DatabaseAdapter, teamId: string): {
  boss: "itachi" | "aizen" | null;
  totalTurns: number;
  players: Array<{ displayName: string; turns: number; sharePercent: number; filedItem: boolean }>;
} {
  const assigned = bossOf(teamId, db);
  if (assigned === undefined) return { boss: null, totalTurns: 0, players: [] };
  const startsAt = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = 'round2_schedule'")?.value;
  let startIso: string | null = null;
  if (startsAt !== undefined) {
    try {
      const parsed = JSON.parse(startsAt) as { startsAt?: unknown };
      if (typeof parsed.startsAt === "string") startIso = parsed.startsAt;
    } catch {
      startIso = null;
    }
  }
  const members = db.all<{ display_name: string }>("SELECT display_name FROM team_members WHERE team_id = ? ORDER BY rowid", teamId);
  const raw = members.map((member) => {
    const turns = startIso === null
      ? db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = ? AND bot_id = ? AND role = 'user' AND display_name = ?", teamId, assigned, member.display_name)?.n ?? 0
      : db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = ? AND bot_id = ? AND role = 'user' AND display_name = ? AND created_at >= ?", teamId, assigned, member.display_name, startIso)?.n ?? 0;
    const filedItem = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM bot_completions WHERE team_id = ? AND round = 2 AND completed_by = ?", teamId, member.display_name)?.n ?? 0;
    return { displayName: member.display_name, turns, filedItem: filedItem > 0 };
  });
  const totalTurns = raw.reduce((sum, row) => sum + row.turns, 0);
  return {
    boss: assigned,
    totalTurns,
    players: raw.map((row) => ({ ...row, sharePercent: totalTurns === 0 ? 0 : Math.round((row.turns / totalTurns) * 100) })),
  };
}

export function registerStandingsRoutes(app: FastifyInstance, db: DatabaseAdapter): void {
  app.get("/api/standings", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) return reply.code(401).send({ error: "no session" });
    const round: 1 | 2 = bossOf(session.teamId, db) !== undefined || round2Status(db) !== "off" ? 2 : 1;
    const leaderboard = orderedTeams(db, round);
    const current = leaderboard.find((row) => row.id === session.teamId) ?? null;
    return {
      round,
      current: current === null ? null : { rank: current.rank, teamName: current.name, elo: current.elo, solved: current.solved },
      leaderboard: leaderboard.slice(0, 8).map((row) => ({ rank: row.rank, teamName: row.name, elo: row.elo, solved: row.solved })),
      firstDefeats: firstDefeats(db),
      round2: round === 2 ? round2Contributions(db, session.teamId) : null,
    };
  });
}
