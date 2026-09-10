// OpenCode Zen Responses API client for Round 2 boss AI.
// Model: muse-spark-1.3-contributor-free (verified upstream ID for Muse Spark 1.3 Free)
// Reasoning is captured strictly server-side for reasoning_traces and never streamed to players.
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import type { ChatMessage, StreamYield, ToolDef } from "./groq.js";

const MODEL = "muse-spark-1.3-contributor-free";
const ZEN_RESPONSES_URL = "https://opencode.ai/zen/v1/responses";

export async function* streamZenChat(
  messages: ChatMessage[],
  tools: ToolDef[],
): AsyncGenerator<StreamYield & { reasoning?: string }> {
  const sessionId = randomUUID();
  const input = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const formattedTools = tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const res = await fetch(ZEN_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.zenApiKey}`,
      "Content-Type": "application/json",
      "x-opencode-session": sessionId,
      "X-Session-ID": sessionId,
      "User-Agent": "opencode/1.0.0",
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      tools: formattedTools,
      stream: true,
    }),
  });

  if (!res.ok || res.body === null) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`OpenCode Zen API error ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let reasoning = "";
  const emittedCalls = new Set<string>();

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
      const raw = trimmed.slice(5).trim();
      if (raw === "" || raw === "[DONE]") {
        continue;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = typeof payload["type"] === "string" ? payload["type"] : "";

      // 1. Text deltas for player dialogue (never contains reasoning)
      if (type === "response.output_text.delta" && typeof payload["delta"] === "string") {
        yield { kind: "delta", text: payload["delta"] };
      }

      // 2. Reasoning item tracking (captured server-side for reasoning_traces)
      if (type === "response.output_item.done") {
        const item = payload["item"] as Record<string, unknown> | undefined;
        if (item?.["type"] === "reasoning") {
          reasoning += JSON.stringify(item) + "\n";
        } else if (item?.["type"] === "function_call") {
          const callId = String(item["call_id"] ?? item["id"] ?? randomUUID());
          if (!emittedCalls.has(callId)) {
            emittedCalls.add(callId);
            const name = String(item["name"] ?? "");
            let args: unknown = {};
            try {
              args = JSON.parse(String(item["arguments"] ?? "{}")) as unknown;
            } catch {
              args = {};
            }
            yield { kind: "tool", call: { id: callId, name, args } };
          }
        }
      }

      // 3. Incremental function call completion event
      if (type === "response.function_call_arguments.done") {
        const itemId = String(payload["item_id"] ?? randomUUID());
        if (!emittedCalls.has(itemId)) {
          emittedCalls.add(itemId);
          const name = String(payload["name"] ?? "");
          let args: unknown = {};
          try {
            args = JSON.parse(String(payload["arguments"] ?? "{}")) as unknown;
          } catch {
            args = {};
          }
          yield { kind: "tool", call: { id: itemId, name, args } };
        }
      }
    }
  }

  yield { kind: "done", finish: "stop", reasoning };
}
