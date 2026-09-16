// Codex turn streaming adapter: ChatMessage/ToolDef -> App Server -> StreamYield.
// Side-effect free: tool calls are recorded + neutrally acked; the existing
// R1/R2 handlers remain authoritative for all game mutations.
import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "../../db/database.js";
import type { ChatMessage, StreamYield, ToolCall, ToolDef } from "../groq.js";
import { tokenTracker } from "../tokenTracker.js";
import { CODEX_MODEL, CodexError, type CodexEffort, type CodexErrorKind } from "./protocol.js";
import { CodexAppServer, sharedAppServer } from "./appServer.js";
import { splitHistory } from "./history.js";
import { toDynamicTools } from "./tools.js";
import { cachedModelAvailable, refreshUsage } from "./usage.js";

export type CodexPhase = "r1" | "r2";

export interface CodexTurnOptions {
  phase: CodexPhase;
  messages: ChatMessage[];
  tools: ToolDef[];
  db?: DatabaseAdapter | undefined;
  server?: CodexAppServer | undefined;
  teamId?: string | undefined;
  botId?: string | undefined;
}

interface PendingTool {
  id: string;
  name: string;
  args: unknown;
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function codexEnabled(): boolean {
  return (process.env["CODEX_ENABLED"] ?? "true").toLowerCase() !== "false";
}

// Simple semaphore for CODEX_MAX_CONCURRENCY (default 11: one per team).
let activeTurns = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<() => void> {
  const max = numEnv("CODEX_MAX_CONCURRENCY", 11);
  if (activeTurns < max) {
    activeTurns += 1;
    return release;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeTurns += 1;
  return release;
}

function release(): void {
  activeTurns -= 1;
  const next = waiters.shift();
  if (next) next();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function effortFor(phase: CodexPhase): CodexEffort {
  return phase === "r2" ? "high" : "low";
}

function sanitizeLogId(v: string | undefined): string {
  if (!v) return "?";
  return v.slice(0, 24).replace(/[^a-zA-Z0-9:_-]/g, "?");
}

async function withPreStartRetries<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const transient = err instanceof CodexError && err.retryableTransient;
      if (!transient || attempt >= 2) throw err;
      attempt += 1;
      const backoff = Math.min(1500, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 150);
      await sleep(backoff);
    }
  }
}

async function* runCodexTurn(opts: CodexTurnOptions): AsyncGenerator<StreamYield & { reasoning?: string }> {
  const server = opts.server ?? sharedAppServer();
  const phase = opts.phase;
  const effort = effortFor(phase);
  const split = splitHistory(opts.messages);
  const dynamicTools = toDynamicTools(opts.tools);
  const allowedNames = new Set(opts.tools.map((t) => t.name));

  const firstActivityMs = numEnv("CODEX_FIRST_ACTIVITY_TIMEOUT_MS", 45_000);
  const turnTimeoutMs = numEnv("CODEX_TURN_TIMEOUT_MS", 90_000);

  // Model gate: use cached catalog when present; query once when unknown.
  if (!cachedModelAvailable()) {
    try {
      await refreshUsage(server);
    } catch {
      // fall through to availability check
    }
    if (!cachedModelAvailable()) {
      throw new CodexError("model_unavailable", `Codex model unavailable: ${CODEX_MODEL}`);
    }
  }

  const releaseSlot = await acquireSlot();
  let threadId: string | undefined;
  let turnId: string | undefined;
  let toolKey: string | undefined;
  let offThread: (() => void) | undefined;
  const pendingTools: PendingTool[] = [];
  let started = false;
  let deltaCount = 0;
  let completionChars = 0;
  const turnStartTime = Date.now();
  const team = sanitizeLogId(opts.teamId);
  const bot = sanitizeLogId(opts.botId);

  const fail = (kind: CodexErrorKind, msg: string): CodexError => {
    return new CodexError(kind, `[codex] turn failed before output team=${team} bot=${bot} error=${kind} ${msg}`.slice(0, 220));
  };

  try {
    await withPreStartRetries(async () => {
      await server.ensureStarted();
    });

    // 1. Fresh isolated thread per request (ephemeral preferred).
    let threadRes: unknown;
    try {
      threadRes = await server.call(
        "thread/start",
        {
          model: CODEX_MODEL,
          ephemeral: true,
          developerInstructions: split.developerInstructions || null,
          baseInstructions: null,
          cwd: process.env["CODEX_RUNTIME_DIR"]?.trim() || null,
          sandbox: null,
          approvalPolicy: "never",
          dynamicTools,
        },
        server.rpcTimeoutMs,
      );
    } catch (err) {
      throw err instanceof CodexError ? err : fail("transport_closed", "thread/start failed");
    }
    const threadRec = (typeof threadRes === "object" && threadRes !== null ? (threadRes as Record<string, unknown>) : {}) as Record<string, unknown>;
    const tid = (threadRec["thread"] && typeof threadRec["thread"] === "object" && threadRec["thread"] !== null ? (threadRec["thread"] as Record<string, unknown>)["id"] : null) ?? threadRec["threadId"] ?? threadRec["id"];
    if (typeof tid !== "string" || tid === "") {
      // Fallback: non-ephemeral thread (some servers restrict inject on ephemeral).
      const retry = (await server.call("thread/start", {
        model: CODEX_MODEL,
        ephemeral: false,
        developerInstructions: split.developerInstructions || null,
        cwd: process.env["CODEX_RUNTIME_DIR"]?.trim() || null,
        approvalPolicy: "never",
        dynamicTools,
      })) as unknown;
      const retryRec = (typeof retry === "object" && retry !== null ? (retry as Record<string, unknown>) : {}) as Record<string, unknown>;
      const retryId = (retryRec["thread"] && typeof retryRec["thread"] === "object" && retryRec["thread"] !== null ? (retryRec["thread"] as Record<string, unknown>)["id"] : null) ?? retryRec["threadId"] ?? retryRec["id"];
      if (typeof retryId !== "string" || retryId === "") {
        console.error("[codexChat] thread/start missing id, response was:", JSON.stringify(retryRec));
        throw fail("protocol_error", "thread/start missing id");
      }
      threadId = retryId;
    } else {
      threadId = tid;
    }

    // 2. Inject canonical history (skip when empty).
    if (split.historyItems.length > 0 && threadId) {
      try {
        await server.call("thread/inject_items", { threadId, items: split.historyItems }, server.rpcTimeoutMs);
      } catch (err) {
        // Ephemeral-thread inject limitation: recreate as persistent thread once.
        if (err instanceof CodexError && err.kind === "protocol_error") {
          const retry = (await server.call("thread/start", {
            model: CODEX_MODEL,
            ephemeral: false,
            developerInstructions: split.developerInstructions || null,
            cwd: process.env["CODEX_RUNTIME_DIR"]?.trim() || null,
            approvalPolicy: "never",
            dynamicTools,
          })) as unknown;
          const retryRec = (typeof retry === "object" && retry !== null ? (retry as Record<string, unknown>) : {}) as Record<string, unknown>;
          const retryId = (retryRec["thread"] && typeof retryRec["thread"] === "object" && retryRec["thread"] !== null ? (retryRec["thread"] as Record<string, unknown>)["id"] : null) ?? retryRec["threadId"] ?? retryRec["id"];
          if (typeof retryId !== "string" || retryId === "") throw fail("protocol_error", "thread retry missing id");
          threadId = retryId;
          await server.call("thread/inject_items", { threadId, items: split.historyItems }, server.rpcTimeoutMs);
        } else {
          throw err;
        }
      }
    }

    // 3. Subscribe + register deferred tool handler BEFORE turn/start.
    const deltas: string[] = [];
    let turnDone: { status: string; error?: string } | undefined;
    let notifyTurn: () => void = () => undefined;
    const turnSettled = new Promise<void>((resolve) => {
      notifyTurn = resolve;
    });
    const currentThreadId = threadId as string;
    const seenDeltas = new Set<string>();
    const onTurnEvent = (ev: { method: string; params: Record<string, unknown> }): void => {
      if (ev.method === "item/agentMessage/delta") {
        const delta = typeof ev.params["delta"] === "string" ? (ev.params["delta"] as string) : "";
        const itemId = typeof ev.params["itemId"] === "string" ? (ev.params["itemId"] as string) : "";
        if (delta !== "") {
          // Dedupe only when Codex supplies an item id. Without one, repeated
          // chunks are legitimate content (spaces and short words repeat often).
          if (itemId !== "") {
            const key = `${itemId}::${delta}`;
            if (seenDeltas.has(key)) return;
            if (seenDeltas.size > 500) seenDeltas.clear();
            seenDeltas.add(key);
          }
          started = true;
          deltaCount += 1;
          completionChars += delta.length;
          tokenTracker.recordTokenDelta(Math.max(1, Math.ceil(delta.length / 4)));
          deltas.push(delta);
        }
      } else if (ev.method === "turn/completed") {
        const turn = (ev.params["turn"] ?? ev.params) as Record<string, unknown>;
        const status = typeof turn["status"] === "string" ? (turn["status"] as string) : "completed";
        const errRec = (typeof turn["error"] === "object" && turn["error"] !== null ? (turn["error"] as Record<string, unknown>) : undefined);
        const errMsg = typeof errRec?.["message"] === "string" ? (errRec["message"] as string) : undefined;
        turnDone = errMsg === undefined ? { status } : { status, error: errMsg };
        notifyTurn();
      }
    };
    offThread = server.subscribeThread(currentThreadId, onTurnEvent);

    toolKey = currentThreadId;
    server.setToolHandler(toolKey, async ({ turnId: tId, callId, tool, args }) => {
      if (turnId !== undefined && tId !== turnId) {
        // Unknown turn on this thread; still ack neutrally without recording.
        return { ackText: "Tool request recorded for host-side validation." };
      }
      if (!allowedNames.has(tool)) {
        throw new Error(`unknown tool: ${tool.slice(0, 64)}`);
      }
      if (args !== undefined && (typeof args !== "object" || args === null) && typeof args !== "string") {
        throw new Error("invalid tool arguments");
      }
      let parsed: unknown = args;
      if (typeof args === "string") {
        try {
          parsed = JSON.parse(args) as unknown;
        } catch {
          parsed = {};
        }
      }
      started = true;
      pendingTools.push({ id: callId || randomUUID(), name: tool, args: parsed ?? {} });
      return { ackText: "Tool request recorded for host-side validation." };
    });

    // 4. Start the turn: current user input ONLY (history already injected).
    const inputText = split.currentInputText;
    let turnRes: unknown;
    try {
      turnRes = await withPreStartRetries(async () => {
        if (started) {
          // Never retry once output began; single attempt semantics below.
          throw new CodexError("turn_failed", "retry after start refused");
        }
        return server.call(
          "turn/start",
          {
            threadId: currentThreadId,
            input: [{ type: "text", text: inputText, text_elements: [] }],
            model: CODEX_MODEL,
            effort,
            cwd: process.env["CODEX_RUNTIME_DIR"]?.trim() || null,
            sandboxPolicy: { type: "readOnly", networkAccess: false },
            approvalPolicy: "never",
          },
          server.rpcTimeoutMs,
        );
      });
    } catch (err) {
      throw err instanceof CodexError ? err : fail("transport_closed", "turn/start failed");
    }
    const turnRec = (typeof turnRes === "object" && turnRes !== null ? (turnRes as Record<string, unknown>) : {}) as Record<string, unknown>;
    const started2 = turnRec["turn"] as Record<string, unknown> | undefined;
    const tId = (started2?.["id"] ?? turnRec["turnId"] ?? turnRec["id"]) as unknown;
    if (typeof tId === "string" && tId !== "") {
      turnId = tId;
      toolKey = `${currentThreadId}:${turnId}`;
      const prev = pendingTools.splice(0, pendingTools.length);
      server.clearToolHandler(currentThreadId);
      server.setToolHandler(toolKey, async ({ callId, tool, args }) => {
        if (!allowedNames.has(tool)) throw new Error(`unknown tool: ${tool.slice(0, 64)}`);
        let parsed: unknown = args;
        if (typeof args === "string") {
          try {
            parsed = JSON.parse(args) as unknown;
          } catch {
            parsed = {};
          }
        }
        started = true;
        pendingTools.push({ id: callId || randomUUID(), name: tool, args: parsed ?? {} });
        return { ackText: "Tool request recorded for host-side validation." };
      });
      // Re-add pre-start tools collected before turnId was known.
      for (const p of prev) pendingTools.push(p);
    }

    // 5. Stream deltas as they arrive until terminal event or timeout.
    let emitted = 0;
    const deadline = turnStartTime + turnTimeoutMs;
    let firstActivityAt: number | undefined;
    for (;;) {
      if (turnDone) break;
      const now = Date.now();
      if (!started && now - turnStartTime > firstActivityMs) {
        try {
          if (turnId) await server.call("turn/interrupt", { threadId: currentThreadId, turnId }, 10_000);
        } catch {
          // best effort
        }
        throw fail("timeout_before_start", "first activity timeout");
      }
      if (now > deadline) {
        if (!started) {
          try {
            if (turnId) await server.call("turn/interrupt", { threadId: currentThreadId, turnId }, 10_000);
          } catch {
            // best effort
          }
          throw fail("timeout_before_start", "turn timeout before output");
        }
        throw new CodexError("timeout_midstream", `[codex] turn timed out midstream team=${team} bot=${bot}`);
      }
      // Emit any queued deltas.
      while (emitted < deltas.length) {
        const text = deltas[emitted++] as string;
        if (firstActivityAt === undefined) firstActivityAt = Date.now();
        yield { kind: "delta", text } as StreamYield;
      }
      if (turnDone) break;
      const remaining = Math.min(250, Math.max(25, deadline - Date.now()));
      await Promise.race([turnSettled, sleep(remaining)]);
      // Re-check settlement without busy spin.
      if (!turnDone) {
        // Short poll continuation: check if turnDone arrived while sleeping.
        continue;
      }
    }
    while (emitted < deltas.length) {
      const text = deltas[emitted++] as string;
      yield { kind: "delta", text } as StreamYield;
    }

    const status = turnDone?.status ?? "failed";
    if (status !== "completed") {
      // Pending tools MUST NOT be awarded on failed/truncated turns.
      pendingTools.length = 0;
      if (!started) {
        if (status === "interrupted") throw fail("turn_incomplete", turnDone?.error ?? "interrupted");
        throw fail("turn_failed", turnDone?.error ?? "failed");
      }
      throw new CodexError(status === "interrupted" ? "turn_incomplete" : "turn_failed", `[codex] turn ${status} midstream team=${team} bot=${bot}`);
    }

    const durationMs = Date.now() - turnStartTime;
    const promptEstimate = opts.messages.reduce((acc, m) => acc + Math.max(1, Math.ceil(m.content.length / 3.8)), 0);
    const completionEstimate = Math.max(1, Math.ceil(completionChars / 4));
    tokenTracker.recordStreamUsage(promptEstimate, completionEstimate, durationMs, "codex", CODEX_MODEL);

    const calls: ToolCall[] = pendingTools.map((p) => ({ id: p.id, name: p.name, args: p.args }));
    pendingTools.length = 0;
    for (const c of calls) {
      yield { kind: "tool", call: c } as StreamYield;
    }
    yield { kind: "done", finish: "stop" } as StreamYield;
  } finally {
    if (offThread) offThread();
    if (toolKey) server.clearToolHandler(toolKey);
    if (threadId) {
      const tid = threadId;
      // Best-effort ephemeral cleanup; never blocks gameplay.
      void (async () => {
        try {
          await server.callRaw("thread/archive", { threadId: tid }, 5_000);
        } catch {
          // ephemeral threads vanish on their own; ignore
        }
      })();
    }
    releaseSlot();
    void deltaCount;
  }
}

export async function* streamCodexChat(opts: CodexTurnOptions): AsyncGenerator<StreamYield & { reasoning?: string }> {
  if (!codexEnabled()) {
    throw new CodexError("process_unavailable", "Codex disabled via CODEX_ENABLED=false");
  }
  if (isFinite(numEnv("CODEX_MAX_CONCURRENCY", 11)) && activeTurns >= numEnv("CODEX_MAX_CONCURRENCY", 11) + waiters.length + 1) {
    // Queue naturally via acquireSlot; no busy loop.
  }
  for await (const item of runCodexTurn(opts)) {
    yield item;
  }
}

/** For tests: active turn count. */
export function activeTurnCountForTests(): number {
  return activeTurns;
}
