// Groq OpenAI-compatible chat completions with streaming + tool calls.
// Reasoning NEVER leaves this module except into reasoning_traces rows.
import type { DatabaseAdapter } from "../db/database.js";
import { runWithRotation } from "./keyPool.js";
import { tokenTracker } from "./tokenTracker.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type StreamYield =
  | { kind: "delta"; text: string }
  | { kind: "tool"; call: ToolCall }
  | { kind: "done"; finish: string };

const MODEL = "qwen/qwen3.8-27b";

async function* streamChatWithKey(
  apiKey: string,
  messages: ChatMessage[],
  tools: ToolDef[],
): AsyncGenerator<StreamYield> {
  const startTime = Date.now();
  let estimatedCompletion = 0;
  let exactUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!res.ok || res.body === null) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}: ${errorBody.slice(0, 150)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let finish = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        continue;
      }
      let chunk: {
        choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      try {
        chunk = JSON.parse(payload) as typeof chunk;
      } catch {
        continue;
      }
      if (chunk.usage && typeof chunk.usage.total_tokens === "number") {
        exactUsage = chunk.usage;
      }
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason !== undefined && choice.finish_reason !== null) {
        finish = choice.finish_reason;
      }
      const delta = choice?.delta;
      if (typeof delta?.content === "string" && delta.content !== "") {
        const count = Math.max(1, Math.ceil(delta.content.length / 4));
        estimatedCompletion += count;
        tokenTracker.recordTokenDelta(count);
        yield { kind: "delta", text: delta.content };
      }
      for (const tc of delta?.tool_calls ?? []) {
        const slot = calls.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id !== undefined) {
          slot.id = tc.id;
        }
        if (tc.function?.name !== undefined) {
          slot.name = tc.function.name;
        }
        if (tc.function?.arguments !== undefined) {
          slot.args += tc.function.arguments;
        }
        calls.set(tc.index, slot);
      }
    }
  }
  if (!finish || finish === "length" || finish === "content_filter") {
    throw new Error("Groq response did not complete successfully");
  }
  const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, slot] of ordered) {
    let args: unknown = {};
    try {
      args = JSON.parse(slot.args === "" ? "{}" : slot.args) as unknown;
    } catch {
      args = {};
    }
    yield { kind: "tool", call: { id: slot.id, name: slot.name, args } };
  }

  const durationMs = Date.now() - startTime;
  if (exactUsage) {
    tokenTracker.recordStreamUsage(
      exactUsage.prompt_tokens ?? 0,
      exactUsage.completion_tokens ?? estimatedCompletion,
      durationMs,
    );
  } else {
    const estimatedPrompt = messages.reduce((acc, m) => acc + Math.max(1, Math.ceil(m.content.length / 3.8)), 0);
    tokenTracker.recordStreamUsage(estimatedPrompt, estimatedCompletion, durationMs);
  }

  yield { kind: "done", finish };
}

import { streamZenChat } from "./zen.js";

export async function* streamChat(
  messages: ChatMessage[],
  tools: ToolDef[],
  db?: DatabaseAdapter,
): AsyncGenerator<StreamYield> {
  let started = false;
  try {
    for await (const chunk of runWithRotation("groq", (key) => streamChatWithKey(key, messages, tools), db)) {
      started = true;
      yield chunk;
    }
  } catch (groqErr) {
    if (started) throw groqErr;
    console.warn("[StreamChat] Groq provider failed or exhausted, attempting OpenCode Zen (Muse Spark 1.3 Free) fallback...", groqErr);
    try {
      for await (const chunk of streamZenChat(messages, tools, db)) {
        if (chunk.kind === "delta" || chunk.kind === "tool") {
          yield chunk;
        } else if (chunk.kind === "done") {
          yield { kind: "done", finish: chunk.finish };
        }
      }
    } catch (zenErr) {
      console.error("[StreamChat] Zen fallback also failed:", zenErr);
      throw groqErr;
    }
  }
}
