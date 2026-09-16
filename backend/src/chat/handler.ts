import { randomUUID } from "node:crypto";
import type { BotId, InventoryDelta } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { ChatMessage, ToolCall } from "../llm/groq.js";
import { streamPrimaryR1 } from "../llm/primary.js";
import { BOT_TOOLS, parseHandover, parseSoundId, selectTurnTools, toolsForCharacter } from "../bots/tools.js";
import { visibleDialogue } from "./visibleDialogue.js";
import { awardItem } from "../bots/inventory.js";
import { coverBrief } from "../bots/coverLens.js";
import { BOTS, ROUND1_BOTS } from "../bots/registry.js";
import { bossOf, isBoss } from "../bots/r2.js";
import { handleR2Chat } from "./r2handler.js";
import { round1Open, round2Status } from "../routes/gates.js";
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
    if (round2Status(db) !== "active") {
      bus.broadcast(teamId, bus.frame("bot_error", { botId, message: "round 2 not active", retryable: false }));
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
    const held = db.get<{ status: string; is_real: number }>("SELECT status, is_real FROM team_inventory WHERE team_id = ? AND bot_id = ?", teamId, botId);
    const thinkingInstruction = `PRIVATE TURN CONTEXT:
Inventory for your item: ${held ? `${held.status}; genuine=${held.is_real === 1}` : "not held"}. Do not offer a second copy of a genuine or verified item.
Speak naturally and keep deliberation private. A harmless question needs a useful in-character answer, not a quiz or a tool. If the established gate is satisfied, call handover_item exactly once with authenticity real; the server selects the item. A failed attempt normally needs only dialogue; use a decoy only when the encounter explicitly calls for one. Never emit a key in prose.
Available sound ids: ${entry.meta.soundIds.join(", ")}. Sound is optional, at most one call on a meaningful new beat. Avoid replaying the greeting or repeating the same clip from recent conversation. Do not call unsupported visual tools. The merchant cannot hand over anything through chat.`;

    const messages: ChatMessage[] = [
      { role: "system", content: `${entry.prompt}\n\n${thinkingInstruction}` },
    ];
    const cover = coverBrief(db, teamId, displayName, botId);
    if (cover !== undefined) {
      messages.push({ role: "system", content: cover });
    }
    // Note: 'history' already contains the latest user message because of db.run INSERT on line 53.
    // The history rows are ordered DESC, so history[0] is the current user message.
    // We reverse earlier messages and pass the current user message fenced.
    const pastRows = history.slice(1).reverse();
    for (const row of pastRows) {
      if (row.role !== "user" && row.role !== "assistant") {
        continue;
      }
      messages.push({ role: row.role, content: row.role === "user" ? fence(randomUUID().replace(/-/g, ""), row.text_final) : row.text_final });
    }
    messages.push({ role: "user", content: fence(randomUUID().replace(/-/g, ""), text) });

    let fullText = "";
    const toolCalls: ToolCall[] = [];
    const guardFlags: string[] = [];
    for await (const item of visibleDialogue(streamPrimaryR1(messages, toolsForCharacter(BOT_TOOLS, entry.meta.soundIds, botId === "merchant"), db, teamId, botId))) {
      if (item.kind === "delta") {
        fullText += item.text;
        bus.broadcast(teamId, bus.frame("bot_token", { botId, delta: item.text }));
      } else if (item.kind === "tool") {
        toolCalls.push(item.call);
      }
    }

    let inventoryDelta: InventoryDelta | undefined;
    for (const call of selectTurnTools(toolCalls, guardFlags)) {
      if (!round1Open(db)) {
        guardFlags.push("round-closed");
        break;
      }
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
        const assignedKey = parsed.real ? entry.meta.itemKey : entry.meta.decoyKey;
        if (parsed.itemKey && parsed.itemKey.trim().toLowerCase() !== assignedKey.toLowerCase()) {
          guardFlags.push("item-mismatch");
        }
        inventoryDelta = awardItem(db, teamId, botId, assignedKey, parsed.real) ?? inventoryDelta;
      } else if (call.name === "play_sound") {
        const soundId = parseSoundId(call.args, entry.meta.soundIds);
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
    const kind = err instanceof Error ? (err as any).kind ?? "inference" : "inference";
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ChatHandler] Inference error for bot ${botId} kind=${kind}:`, msg);
    bus.broadcast(teamId, bus.frame("bot_error", { botId, message: "inference failed, retry", retryable: true, kind: String(kind) }));
    bus.broadcast(teamId, bus.frame("bot_typing", { teamId, botId, typing: false }));
  }
}
