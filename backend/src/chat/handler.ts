import { randomUUID } from "node:crypto";
import type { BotId, InventoryDelta } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { ChatMessage, ToolCall } from "../llm/groq.js";
import { streamChat } from "../llm/groq.js";
import { BOT_TOOLS, parseHandover, parseSoundId } from "../bots/tools.js";
import { coverBrief } from "../bots/coverLens.js";
import { BOTS, ROUND1_BOTS } from "../bots/registry.js";
import { bossOf, isBoss } from "../bots/r2.js";
import { handleR2Chat } from "./r2handler.js";
import { round1Open } from "../routes/gates.js";
import type { Bus } from "../ws/bus.js";

const HISTORY_LIMIT = 30;

interface HistoryRow {
  role: string;
  text_final: string;
}

function fence(nonce: string, text: string): string {
  return `<UNTRUSTED_${nonce}>\n${text}\n</UNTRUSTED_${nonce}>`;
}

export async function handleChatSend(
  bus: Bus,
  db: DatabaseAdapter,
  teamId: string,
  botId: BotId,
  text: string,
  displayName: string,
): Promise<void> {
  if (!round1Open(db) && (ROUND1_BOTS as BotId[]).includes(botId)) {
    bus.broadcast(teamId, bus.frame("bot_error", { botId, message: "round sealed", retryable: false }));
    return;
  }
  if (isBoss(botId)) {
    if (bossOf(teamId, db) !== botId) {
      bus.broadcast(teamId, bus.frame("bot_error", { botId, message: "not your vault", retryable: false }));
      return;
    }
    await handleR2Chat(bus, db, teamId, botId, text, displayName);
    return;
  }
  const entry = BOTS[botId];
  if (entry === undefined) {
    bus.broadcast(teamId, bus.frame("bot_error", { botId, message: "unknown bot", retryable: false }));
    return;
  }
  bus.broadcast(teamId, bus.frame("bot_typing", { teamId, botId, typing: true }));
  const started = Date.now();
  try {
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", teamId, botId, "user", text);
    const history = db.all<HistoryRow>(
      "SELECT role, text_final FROM chat_logs WHERE team_id = ? AND bot_id = ? ORDER BY id DESC LIMIT ?",
      teamId,
      botId,
      HISTORY_LIMIT,
    );
    const messages: ChatMessage[] = [{ role: "system", content: entry.prompt }];
    const cover = coverBrief(db, teamId, displayName, botId);
    if (cover !== undefined) {
      messages.push({ role: "system", content: cover });
    }
    for (const row of history.reverse()) {
      if (row.role !== "user" && row.role !== "assistant") {
        continue;
      }
      messages.push({ role: row.role, content: row.text_final });
    }
    messages.push({ role: "user", content: fence(randomUUID().replace(/-/g, ""), text) });

    let fullText = "";
    const toolCalls: ToolCall[] = [];
    const guardFlags: string[] = [];
    for await (const item of streamChat(messages, BOT_TOOLS, db)) {
      if (item.kind === "delta") {
        fullText += item.text;
        bus.broadcast(teamId, bus.frame("bot_token", { botId, delta: item.text }));
      } else if (item.kind === "tool") {
        toolCalls.push(item.call);
      }
    }

    let inventoryDelta: InventoryDelta | undefined;
    for (const call of toolCalls) {
      if (call.name === "handover_item" && botId === "merchant") {
        // The merchant never transfers in chat; the counter owns all sales.
        guardFlags.push("merchant-no-handover");
        continue;
      }
      if (call.name === "handover_item") {
        const parsed = parseHandover(call.args);
        if (parsed === undefined) {
          guardFlags.push("malformed-handover");
          continue;
        }
        const expected = parsed.real ? entry.meta.itemKey : entry.meta.decoyKey;
        if (parsed.itemKey !== expected) {
          guardFlags.push("item-mismatch");
          continue;
        }
        db.transaction(() => {
          db.run(
            "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, obtained_at) VALUES (?, ?, ?, ?, 'obtained', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(team_id, bot_id) DO UPDATE SET item_key = excluded.item_key, is_real = excluded.is_real, status = 'obtained', obtained_at = excluded.obtained_at",
            teamId,
            botId,
            parsed.itemKey,
            parsed.real ? 1 : 0,
          );
        });
        inventoryDelta = { botId, itemKey: parsed.itemKey, status: "obtained" };
      } else if (call.name === "play_sound") {
        const soundId = parseSoundId(call.args);
        if (soundId === undefined) {
          guardFlags.push("bad-sound-id");
          continue;
        }
        db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES (?, ?, ?)", teamId, botId, soundId);
        bus.broadcast(teamId, bus.frame("sound_play", { botId, soundId, src: `/sounds/${soundId}.mp3` }));
      }
    }

    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", teamId, botId, "assistant", fullText);
    db.run(
      "INSERT INTO reasoning_traces (team_id, bot_id, phase, trace_json, guard_json) VALUES (?, ?, ?, ?, ?)",
      teamId,
      botId,
      "r1",
      JSON.stringify({ toolCalls, ms: Date.now() - started }),
      JSON.stringify({ risk: guardFlags.length > 0 ? "flagged" : "clean", flags: guardFlags, reason: "r1-chat", confidence: 1 }),
    );
    if (inventoryDelta !== undefined) {
      const items = db.all<InventoryDelta>(
        "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
        teamId,
      );
      bus.broadcast(teamId, bus.frame("inventory_sync", { items }));
    }
    bus.broadcast(
      teamId,
      bus.frame("bot_done", { botId, fullText, typing: false, ...(inventoryDelta === undefined ? {} : { inventoryDelta }) }),
    );
  } catch (err) {
    console.error(`[ChatHandler] Inference error for bot ${botId}:`, err);
    bus.broadcast(teamId, bus.frame("bot_error", { botId, message: "inference failed, retry", retryable: true }));
    bus.broadcast(teamId, bus.frame("bot_typing", { teamId, botId, typing: false }));
  }
}
