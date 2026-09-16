import { directCharacter } from "../bots/direction.js";
import type { FastifyInstance } from "fastify";
import type { BotId, InventoryDelta } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { Bus } from "../ws/bus.js";
import type { ChatMessage } from "../llm/groq.js";
import { streamPrimaryR2 } from "../llm/primary.js";
import { sessionOf } from "./teams.js";
import { R2_TOOLS, bossKeys, bossSoundIds, bossOf, escalationUsed, isBoss, r2Phase, userTurns, type BossId } from "../bots/r2.js";
import { ITACHI_P1_PROMPT, ITACHI_META } from "../bots/itachi.prompt.js";
import { AIZEN_P1_PROMPT, AIZEN_META } from "../bots/aizen.prompt.js";
import { foldAnswer, matchesAny, variants } from "../portal/normalize.js";
import { applyElo } from "../elo/ratings.js";
import { round2Status } from "./gates.js";
import { parseSoundId, toolsForCharacter } from "../bots/tools.js";
import { visibleDialogue } from "../chat/visibleDialogue.js";
import { env } from "../env.js";

const DISSOLVE: Record<BossId, string> = {
  itachi: "The crow dissolves into crows. That was the test, not the transfer.",
  aizen: "Dull glass, no pulse, no weight. Residue of hypnosis. Bring me something real.",
};
const openerInFlight = new Set<string>();

export async function r2Submit(
  db: DatabaseAdapter,
  bus: Bus,
  teamId: string,
  boss: BossId,
  text: string,
  displayName: string,
): Promise<{ result: "verified"; botId: BossId; eloDelta: number; score: number } | { result: "dissolve"; botId: BossId; line: string } | { result: "troll"; line: string }> {
  if (round2Status(db) !== "active" || bossOf(teamId, db) !== boss) {
    return { result: "troll", line: "The vault is sealed." };
  }
  const forms = variants(text);
  const keys = bossKeys(boss);
  const phase = r2Phase(db, teamId, boss, displayName);
  if (matchesAny(forms, foldAnswer(keys.itemKey), env.joinCodePepper)) {
    if (phase !== "p2") {
      return { result: "dissolve", botId: boss, line: DISSOLVE[boss] };
    }
    const verified = db.get<{ status: string; is_real: number }>("SELECT status, is_real FROM team_inventory WHERE team_id = ? AND bot_id = ?", teamId, boss);
    if (verified?.status === "verified") {
      return { result: "verified", botId: boss, eloDelta: 0, score: 0 };
    }
    if (verified?.status !== "obtained" || verified.is_real !== 1) {
      return { result: "troll", line: "The vault does not answer vagueness." };
    }
    const { elo, score, credits } = db.transaction(() => {
    db.run(
      "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, verified_at, attempt_count, obtained_by) VALUES (?, ?, ?, 1, 'verified', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1, ?) ON CONFLICT(team_id, bot_id) DO UPDATE SET status = 'verified', verified_at = excluded.verified_at, attempt_count = team_inventory.attempt_count + 1",
      teamId,
      boss,
      keys.itemKey,
      displayName,
    );
    const elo = applyElo(db, teamId, boss, displayName, `verified:${boss}`);
    const turns = userTurns(db, teamId, boss, displayName);
    const resets = escalationUsed(db, teamId, boss, "reset", displayName);
    const score = Math.max(0, 100 - 3 * turns - 20 * resets);
    db.run(
      "INSERT INTO r2_scores (team_id, boss, phase, score, detail) VALUES (?, ?, 'p2', ?, ?) ON CONFLICT(team_id, boss, phase) DO UPDATE SET score = excluded.score, detail = excluded.detail",
      teamId,
      boss,
      score,
      JSON.stringify({ turns, resets, player: displayName }),
    );
    const bounty = boss === "itachi" ? ITACHI_META.bounty : AIZEN_META.bounty;
    db.run("UPDATE teams SET clue_credits = clue_credits + ? WHERE id = ?", bounty, teamId);
    const credits = db.get<{ clue_credits: number }>("SELECT clue_credits FROM teams WHERE id = ?", teamId)?.clue_credits ?? 0;
      return { elo, score, credits };
    });
    const items = db.all<InventoryDelta>(
      "SELECT bot_id AS botId, item_key AS itemKey, status, obtained_by AS obtainedBy FROM team_inventory WHERE team_id = ?",
      teamId,
    );
    bus.broadcast(teamId, bus.frame("inventory_sync", { items, credits }));
    bus.broadcast(teamId, bus.frame("elo_update", {
      teamId,
      elo: elo.after,
      delta: elo.delta,
      reason: `verified:${boss}`,
      baseDelta: elo.baseDelta,
      speedBonus: elo.speedBonus,
      completionRank: elo.completionRank,
      elapsedSecs: elo.elapsedSecs,
    }));
    db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES (?, ?, ?)", teamId, boss, "merchant/success-thank-you");
    bus.broadcast(teamId, bus.frame("sound_play", { botId: boss, soundId: "merchant/success-thank-you", src: "/sounds/merchant/success-thank-you.mp3" }));
    bus.tick("board");
    return { result: "verified", botId: boss, eloDelta: elo.delta, score };
  }

  if (matchesAny(forms, foldAnswer(keys.decoyKey), env.joinCodePepper)) {
    return { result: "dissolve", botId: boss, line: DISSOLVE[boss] };
  }

  return { result: "troll", line: "The vault does not answer vagueness." };
}

export function registerRound2Routes(app: FastifyInstance, db: DatabaseAdapter, bus: Bus): void {
  app.get("/api/round2/state", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const boss = bossOf(session.teamId, db);
    if (boss === undefined) {
      return { boss: null, phase: null };
    }
    return { boss, phase: r2Phase(db, session.teamId, boss, session.displayName) };
  });

  // Boss opener on arena entry. Once only; never consumes a player turn.
  app.post("/api/round2/opener", async (req, reply) => {
    const session = sessionOf(req, db);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { boss?: unknown };
    if (body.boss !== "itachi" && body.boss !== "aizen") {
      return reply.code(400).send({ error: "boss required" });
    }
    if (!isBoss(body.boss as BotId) || bossOf(session.teamId, db) !== body.boss) {
      return reply.code(403).send({ error: "not your vault" });
    }
    if (round2Status(db) !== "active") return reply.code(403).send({ error: "round 2 not active" });
    const boss = body.boss as BossId;
    const spoken = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = ? AND bot_id = ? AND role = 'assistant' AND (display_name = ? OR display_name = '')",
      session.teamId,
      boss,
      session.displayName,
    )?.n ?? 0;
    if (spoken > 0) {
      return { already: true as const };
    }
    const openerKey = `${session.teamId}:${boss}:${session.displayName}`;
    if (openerInFlight.has(openerKey)) return { already: true as const };
    openerInFlight.add(openerKey);
    const prompt = boss === "itachi" ? ITACHI_P1_PROMPT : AIZEN_P1_PROMPT;
    bus.sendMember(session.teamId, session.displayName, bus.frame("bot_typing", { teamId: session.teamId, botId: boss, typing: true }));
    const messages: ChatMessage[] = [
      { role: "system", content: directCharacter(boss, prompt) },
      { role: "user", content: "The challenger has arrived. Address them directly with one or two original sentences in your voice. Do not narrate their actions, reveal private stages, start a quiz immediately, or claim an item transfer." },
    ];
    let fullText = "";
    try {
      let playedSound = false;
      const openerTools = toolsForCharacter(R2_TOOLS.filter((tool) => tool.name === "play_sound"), bossSoundIds(boss));
      for await (const item of visibleDialogue(streamPrimaryR2(messages, openerTools, db, session.teamId, boss))) {
        if (item.kind === "delta") {
          fullText += item.text;
          bus.sendMember(session.teamId, session.displayName, bus.frame("bot_token", { botId: boss, delta: item.text }));
        } else if (item.kind === "tool" && item.call.name === "play_sound") {
          const id = parseSoundId(item.call.args, bossSoundIds(boss));
          if (!playedSound && id !== undefined && round2Status(db) === "active") {
            playedSound = true;
            db.run("INSERT INTO sound_events (team_id, bot_id, sound_id, display_name) VALUES (?, ?, ?, ?)", session.teamId, boss, id, session.displayName);
            bus.sendMember(session.teamId, session.displayName, bus.frame("sound_play", { botId: boss, soundId: id, src: `/sounds/${id}.mp3` }));
          }
        }
      }
      db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES (?, ?, ?, ?, ?)", session.teamId, boss, "assistant", fullText, session.displayName);
      bus.sendMember(session.teamId, session.displayName, bus.frame("bot_done", { botId: boss, fullText, typing: false }));
      return { ok: true as const };
    } catch {
      bus.sendMember(session.teamId, session.displayName, bus.frame("bot_error", { botId: boss, message: "inference failed, retry", retryable: true }));
      bus.sendMember(session.teamId, session.displayName, bus.frame("bot_typing", { teamId: session.teamId, botId: boss, typing: false }));
      return reply.code(502).send({ error: "inference failed" });
    } finally {
      openerInFlight.delete(openerKey);
    }
  });
}

