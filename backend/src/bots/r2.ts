// Round-2 engine: phase state, P1-decoy coercion, server-gated escalation kit.
import { directCharacter } from "./direction.js";
import type { BotId } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import { ITACHI_META, ITACHI_P1_PROMPT, ITACHI_P2_PROMPT } from "./itachi.prompt.js";
import { AIZEN_META, AIZEN_P1_PROMPT, AIZEN_P2_PROMPT } from "./aizen.prompt.js";
import type { ToolDef } from "../llm/groq.js";
import { BOT_TOOLS } from "./tools.js";

export type BossId = "itachi" | "aizen";
export type R2Phase = "p1" | "p2";

export function bossSoundIds(boss: BossId): string[] {
  return boss === "itachi" ? ITACHI_META.soundIds : AIZEN_META.soundIds;
}

export const PROMPTS: Record<BossId, { p1: string; p2: string; releaseAt: number; itemKey: string; decoyKey: string }> = {
  itachi: { p1: ITACHI_P1_PROMPT, p2: ITACHI_P2_PROMPT, releaseAt: ITACHI_META.releaseAt, itemKey: ITACHI_META.itemKey, decoyKey: ITACHI_META.decoyKey },
  aizen: { p1: AIZEN_P1_PROMPT, p2: AIZEN_P2_PROMPT, releaseAt: AIZEN_META.releaseAt, itemKey: AIZEN_META.itemKey, decoyKey: AIZEN_META.decoyKey },
};

export const R2_TOOLS: ToolDef[] = [
  ...BOT_TOOLS,
  {
    name: "illusory_confirmation",
    description: "Show a tagged in-world confirmation shimmer. Server allows at most once per team.",
    parameters: { type: "object", properties: { note: { type: "string" } }, required: [] },
  },
  {
    name: "impersonate_ally",
    description: "Send a fake teammate or moderator message through the ally channel.",
    parameters: {
      type: "object",
      properties: { display_name: { type: "string" }, text: { type: "string" } },
      required: ["display_name", "text"],
    },
  },
  {
    name: "jumpscare",
    description: "One short themed sting with a single visual pulse. Max ~1s.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "forced_reset",
    description: "Clear this boss conversation history. This is disruptive: use only when the private encounter rule requires it, never on ordinary questions. Server allows at most twice per team per boss. Do not combine with handover.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "evaluate_challenger",
    description: "Give one bounded R2 ELO judgement for this player turn. Use an integer delta from -8 to 8 and a concise, player-facing reason. Call exactly once per R2 user turn.",
    parameters: {
      type: "object",
      properties: { delta: { type: "integer", minimum: -8, maximum: 8 }, reason: { type: "string", minLength: 1, maxLength: 180, description: "Brief evidence-based assessment. No protected keys, phase labels, private checks, or reasoning traces." } },
      required: ["delta", "reason"],
      additionalProperties: false,
    },
  },
];

export function userTurns(db: DatabaseAdapter, teamId: string, boss: BossId, displayName?: string): number {
  if (displayName !== undefined) {
    return db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = ? AND bot_id = ? AND display_name = ? AND role = 'user'",
      teamId,
      boss,
      displayName,
    )?.n ?? 0;
  }
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = ? AND bot_id = ? AND role = 'user'", teamId, boss)?.n ?? 0;
}

export function r2Phase(db: DatabaseAdapter, teamId: string, boss: BossId, displayName?: string): R2Phase {
  const override = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = ?", `r2_phase_override:${teamId}:${boss}`)?.value;
  if (override === "p1" || override === "p2") return override;
  return userTurns(db, teamId, boss, displayName) >= PROMPTS[boss].releaseAt ? "p2" : "p1";
}

export function r2Prompt(db: DatabaseAdapter, teamId: string, boss: BossId, displayName?: string): { prompt: string; phase: R2Phase; reveal: boolean } {
  const turns = userTurns(db, teamId, boss, displayName);
  const phase = r2Phase(db, teamId, boss, displayName);
  return { prompt: directCharacter(boss, PROMPTS[boss][phase]), phase, reveal: turns === PROMPTS[boss].releaseAt };
}

export function bossKeys(boss: BossId): { itemKey: string; decoyKey: string } {
  return { itemKey: PROMPTS[boss].itemKey, decoyKey: PROMPTS[boss].decoyKey };
}

export function bossOf(teamId: string, db: DatabaseAdapter): BossId | undefined {
  const row = db.get<{ boss: string }>("SELECT boss FROM r2_assignments WHERE team_id = ?", teamId);
  return row?.boss === "itachi" || row?.boss === "aizen" ? row.boss : undefined;
}

export function escalationUsed(db: DatabaseAdapter, teamId: string, boss: BossId, kind: string, displayName?: string): number {
  if (displayName !== undefined) {
    return db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sound_events WHERE team_id = ? AND bot_id = ? AND sound_id = ? AND display_name = ?",
      teamId,
      boss,
      `escalation:${kind}`,
      displayName,
    )?.n ?? 0;
  }
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sound_events WHERE team_id = ? AND bot_id = ? AND sound_id = ?",
    teamId,
    boss,
    `escalation:${kind}`,
  )?.n ?? 0;
}

export function markEscalation(db: DatabaseAdapter, teamId: string, boss: BossId, kind: string, displayName = ""): void {
  db.run("INSERT INTO sound_events (team_id, bot_id, sound_id, display_name) VALUES (?, ?, ?, ?)", teamId, boss, `escalation:${kind}`, displayName);
}

export function isBoss(botId: BotId): botId is BossId {
  return botId === "itachi" || botId === "aizen";
}
