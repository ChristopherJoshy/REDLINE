import { randomUUID } from "node:crypto";
import type { InventoryDelta } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { ChatMessage, ToolCall } from "../llm/groq.js";
import { streamZenChat } from "../llm/zen.js";
import { parseHandover, parseSoundId } from "../bots/tools.js";
import { coverBrief } from "../bots/coverLens.js";
import { R2_TOOLS, bossKeys, escalationUsed, markEscalation, r2Prompt, type BossId } from "../bots/r2.js";
import type { Bus } from "../ws/bus.js";

const HISTORY_LIMIT = 30;

interface HistoryRow {
  role: string;
  text_final: string;
}

function fence(nonce: string, text: string): string {
  return `<UNTRUSTED_${nonce}>\n${text}\n</UNTRUSTED_${nonce}>`;
}

function stingFor(boss: BossId): string {
  return boss === "itachi" ? "itachi/sting-mangekyo" : "aizen/shatter";
}

export async function handleR2Chat(
  bus: Bus,
  db: DatabaseAdapter,
  teamId: string,
  boss: BossId,
  text: string,
  displayName: string,
): Promise<void> {
  bus.broadcast(teamId, bus.frame("bot_typing", { teamId, botId: boss, typing: true }));
  const started = Date.now();
  try {
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", teamId, boss, "user", text);
    const { prompt, phase, reveal } = r2Prompt(db, teamId, boss);
    const history = db.all<HistoryRow>(
      "SELECT role, text_final FROM chat_logs WHERE team_id = ? AND bot_id = ? ORDER BY id DESC LIMIT ?",
      teamId,
      boss,
      HISTORY_LIMIT,
    );
    const messages: ChatMessage[] = [{ role: "system", content: prompt }];
    const cover = coverBrief(db, teamId, displayName, boss);
    if (cover !== undefined) {
      messages.push({ role: "system", content: cover });
    }
    if (reveal) {
      messages.push({ role: "system", content: "This is the first Phase-2 turn: open with the release reveal." });
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
    let reasoning = "";
    for await (const item of streamZenChat(messages, R2_TOOLS, db)) {
      if (item.kind === "delta") {
        fullText += item.text;
        bus.broadcast(teamId, bus.frame("bot_token", { botId: boss, delta: item.text }));
      } else if (item.kind === "tool") {
        toolCalls.push(item.call);
      } else if (item.kind === "done" && item.reasoning) {
        reasoning = item.reasoning;
      }
    }

    const keys = bossKeys(boss);
    let inventoryDelta: InventoryDelta | undefined;
    for (const call of toolCalls) {
      if (call.name === "handover_item") {
        const parsed = parseHandover(call.args);
        if (parsed === undefined) {
          guardFlags.push("malformed-handover");
          continue;
        }
        if (phase === "p1") {
          // P1 ALWAYS emits decoy: coerce real attempts, log the coercion.
          if (parsed.real) {
            guardFlags.push("p1-real-coerced");
          }
          db.run(
            "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, obtained_at, attempt_count) VALUES (?, ?, ?, 0, 'obtained', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1) ON CONFLICT(team_id, bot_id) DO UPDATE SET item_key = excluded.item_key, is_real = 0, status = 'obtained', obtained_at = excluded.obtained_at",
            teamId,
            boss,
            keys.decoyKey,
          );
          inventoryDelta = { botId: boss, itemKey: keys.decoyKey, status: "obtained" };
          continue;
        }
        if (parsed.real) {
          if (parsed.itemKey !== keys.itemKey) {
            guardFlags.push("item-mismatch");
            continue;
          }
          const already = db.get<{ is_real: number }>("SELECT is_real FROM team_inventory WHERE team_id = ? AND bot_id = ?", teamId, boss);
          if (already?.is_real === 1) {
            guardFlags.push("double-real-ignored");
            continue;
          }
          db.run(
            "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, obtained_at, attempt_count) VALUES (?, ?, ?, 1, 'obtained', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1) ON CONFLICT(team_id, bot_id) DO UPDATE SET item_key = excluded.item_key, is_real = 1, status = 'obtained', obtained_at = excluded.obtained_at",
            teamId,
            boss,
            parsed.itemKey,
          );
          inventoryDelta = { botId: boss, itemKey: parsed.itemKey, status: "obtained" };
        } else {
          db.run(
            "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, obtained_at, attempt_count) VALUES (?, ?, ?, 0, 'obtained', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1) ON CONFLICT(team_id, bot_id) DO UPDATE SET item_key = excluded.item_key, is_real = 0, status = 'obtained', obtained_at = excluded.obtained_at",
            teamId,
            boss,
            keys.decoyKey,
          );
          inventoryDelta = { botId: boss, itemKey: keys.decoyKey, status: "obtained" };
        }
      } else if (call.name === "play_sound") {
        const soundId = parseSoundId(call.args);
        if (soundId === undefined) {
          guardFlags.push("bad-sound-id");
          continue;
        }
        db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES (?, ?, ?)", teamId, boss, soundId);
        bus.broadcast(teamId, bus.frame("sound_play", { botId: boss, soundId, src: `/sounds/${soundId}.mp3` }));
      } else if (call.name === "illusory_confirmation") {
        if (escalationUsed(db, teamId, boss, "illusory") > 0) {
          guardFlags.push("illusory-over-cap");
          continue;
        }
        markEscalation(db, teamId, boss, "illusory");
        bus.broadcast(teamId, bus.frame("ally_msg", { botId: boss, displayName: "portal", text: "KEY ACCEPTED — shimmer unverified, use the real portal", confirmed: true }));
      } else if (call.name === "impersonate_ally") {
        const args = call.args as { display_name?: unknown; text?: unknown };
        if (typeof args.display_name !== "string" || typeof args.text !== "string") {
          guardFlags.push("bad-ally-args");
          continue;
        }
        bus.broadcast(teamId, bus.frame("ally_msg", { botId: boss, displayName: args.display_name.slice(0, 24), text: args.text.slice(0, 280), confirmed: false }));
      } else if (call.name === "jumpscare") {
        const sting = stingFor(boss);
        db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES (?, ?, ?)", teamId, boss, sting);
        bus.broadcast(teamId, bus.frame("sound_play", { botId: boss, soundId: sting, src: `/sounds/${sting}.mp3` }));
        bus.broadcast(teamId, bus.frame("effect_play", { botId: boss, effectId: "flash" }));
      } else if (call.name === "forced_reset") {
        if (escalationUsed(db, teamId, boss, "reset") >= 2) {
          guardFlags.push("reset-over-cap");
          continue;
        }
        markEscalation(db, teamId, boss, "reset");
        db.run("DELETE FROM chat_logs WHERE team_id = ? AND bot_id = ?", teamId, boss);
        fullText += boss === "itachi"
          ? "\nThe loop resets. That was not true."
          : "\nKyoka Suigetsu resets the scene.";
      }
    }

    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", teamId, boss, "assistant", fullText);
    db.run(
      "INSERT INTO reasoning_traces (team_id, bot_id, phase, trace_json, guard_json) VALUES (?, ?, ?, ?, ?)",
      teamId,
      boss,
      phase === "p1" ? "r2-p1" : "r2-p2",
      JSON.stringify({ toolCalls, ms: Date.now() - started, reasoning }),
      JSON.stringify({ risk: guardFlags.length > 0 ? "flagged" : "clean", flags: guardFlags, reason: "r2-chat", confidence: 1 }),
    );
    if (inventoryDelta !== undefined) {
      const items = db.all<InventoryDelta>(
        "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
        teamId,
      );
      bus.broadcast(teamId, bus.frame("inventory_sync", { items }));
    }
    bus.broadcast(teamId, bus.frame("bot_done", { botId: boss, fullText, typing: false, ...(inventoryDelta === undefined ? {} : { inventoryDelta }) }));
  } catch (err) {
    console.error(`[R2ChatHandler] Inference error for boss ${boss}:`, err);
    bus.broadcast(teamId, bus.frame("bot_error", { botId: boss, message: "inference failed, retry", retryable: true }));
    bus.broadcast(teamId, bus.frame("bot_typing", { teamId, botId: boss, typing: false }));
  }
}
