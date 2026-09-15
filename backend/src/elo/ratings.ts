// FIDE ELO: R' = R + K*(S - E), E = 1/(1+10^((Ropp-R)/400)).
// Teams start 600. K=32, K=40 provisional for the first ~10 matches.
import type { BotId } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import { roundState } from "../rounds/state.js";

export const START_RATING = 600;
const K = 32;
const K_PROVISIONAL = 40;
const PROVISIONAL_MATCHES = 10;
const SPEED_BONUSES = [12, 9, 7, 5, 3, 2, 1] as const;

export interface EloResult {
  before: number;
  after: number;
  delta: number;
  baseDelta: number;
  speedBonus: number;
  completionRank: number;
  elapsedSecs: number;
}

export const BOT_RATINGS: Record<BotId, number> = {
  wick: 950,
  spidey: 800,
  escanor: 900,
  stark: 1000,
  joker: 1150,
  light: 1200,
  levi: 1100,
  deadpool: 850,
  itachi: 1500,
  aizen: 1700,
  merchant: 600,
};

export function expectedScore(team: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - team) / 400));
}

export function applyElo(db: DatabaseAdapter, teamId: string, botId: BotId, reason: string, now = Date.now()): EloResult {
  const team = db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = ?", teamId);
  if (team === undefined) {
    throw new Error("unknown team");
  }
  const matches = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM elo_log WHERE team_id = ?", teamId)?.n ?? 0;
  const k = matches < PROVISIONAL_MATCHES ? K_PROVISIONAL : K;
  const before = team.elo;
  const baseDelta = Math.round(k * (1 - expectedScore(before, BOT_RATINGS[botId])));
  const previousCompletions = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM team_inventory WHERE bot_id = ? AND team_id != ? AND status = 'verified'",
    botId,
    teamId,
  )?.n ?? 0;
  const completionRank = previousCompletions + 1;
  const speedBonus = SPEED_BONUSES[completionRank - 1] ?? 0;
  const round = botId === "itachi" || botId === "aizen" ? 2 : 1;
  const startsAt = roundState(db, round, now).startsAt;
  const elapsedSecs = startsAt === null ? 0 : Math.max(0, Math.floor((now - Date.parse(startsAt)) / 1000));
  const delta = baseDelta + speedBonus;
  const after = before + delta;
  const auditReason = `${reason};rank=${completionRank};elapsed=${elapsedSecs};base=${baseDelta};speed=${speedBonus}`;
  db.transaction(() => {
    db.run("UPDATE teams SET elo = ? WHERE id = ?", after, teamId);
    db.run("INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) VALUES (?, ?, ?, ?, ?)", teamId, delta, before, after, auditReason);
  });
  return { before, after, delta, baseDelta, speedBonus, completionRank, elapsedSecs };
}
