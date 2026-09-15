// ChatMessage -> Codex thread/turn history split.
// SQLite chat_logs remain canonical; Codex threads are ephemeral per request.
// System rows become developer instructions; latest user turn goes via turn/start
// (never duplicated via inject); tool-role rows degrade to delimited text.
import type { ChatMessage } from "../groq.js";

export interface ResponseItem {
  type: string;
  role?: string;
  content?: Array<{ type: string; text?: string }>;
  [key: string]: unknown;
}

export interface SplitHistory {
  developerInstructions: string;
  historyItems: ResponseItem[];
  currentInputText: string;
}

export function splitHistory(messages: ChatMessage[]): SplitHistory {
  const systems: string[] = [];
  const convo: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      if (m.content.trim() !== "") systems.push(m.content);
    } else {
      convo.push(m);
    }
  }
  // Last user message is the live turn; everything before it is injectable history.
  let currentIdx = -1;
  for (let i = convo.length - 1; i >= 0; i--) {
    if (convo[i]?.role === "user") {
      currentIdx = i;
      break;
    }
  }
  const historyRows = currentIdx === -1 ? convo : convo.slice(0, currentIdx);
  const currentInputText = currentIdx === -1 ? "" : (convo[currentIdx]?.content ?? "");

  const historyItems: ResponseItem[] = [];
  for (const row of historyRows) {
    if (row.role === "user") {
      historyItems.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: row.content }],
      });
    } else if (row.role === "assistant") {
      historyItems.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: row.content }],
      });
    } else {
      // "tool" role (or anything else): preserve as delimited text context so we
      // never fabricate orphan function_call/output pairs.
      historyItems.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: `[history:${row.role}] ${row.content}` }],
      });
    }
  }

  return {
    developerInstructions: systems.join("\n\n"),
    historyItems,
    currentInputText,
  };
}
