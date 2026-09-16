// Primary provider policy: Codex GPT-5.6 Luna first, existing stack as fallback.
// R1: Codex(low) -> existing streamChat (Groq rotation -> Zen).
// R2: Codex(medium) -> existing streamZenChat.
// Fallback ONLY before meaningful output (first delta or first tool request).
import type { DatabaseAdapter } from "../db/database.js";
import type { ChatMessage, StreamYield, ToolDef } from "./groq.js";
import { streamChat } from "./groq.js";
import { streamZenChat } from "./zen.js";
import { CodexError, canFallbackBeforeStart } from "./codex/protocol.js";
import { CodexAppServer } from "./codex/appServer.js";
import { streamCodexChat } from "./codex/codexChat.js";
import { isCodexLimitExhausted } from "./codex/usage.js";

export interface PrimaryCounters {
  codexAttempts: number;
  codexSuccess: number;
  codexPrestartFailure: number;
  codexFallbackR1: number;
  codexFallbackR2: number;
  codexMidstreamFailure: number;
  codexLastError?: string | undefined;
  codexLastSuccessAt?: number | undefined;
}

export const primaryCounters: PrimaryCounters = {
  codexAttempts: 0,
  codexSuccess: 0,
  codexPrestartFailure: 0,
  codexFallbackR1: 0,
  codexFallbackR2: 0,
  codexMidstreamFailure: 0,
};

// Conservative circuit breaker: skip Codex while a hard gate is latched.
let breakerUntil = 0;
let breakerReason = "";

function breakerActive(): boolean {
  return Date.now() < breakerUntil;
}

export function codexBreakerForTests(): { until: number; reason: string } {
  return { until: breakerUntil, reason: breakerReason };
}

export function resetPrimaryForTests(): void {
  primaryCounters.codexAttempts = 0;
  primaryCounters.codexSuccess = 0;
  primaryCounters.codexPrestartFailure = 0;
  primaryCounters.codexFallbackR1 = 0;
  primaryCounters.codexFallbackR2 = 0;
  primaryCounters.codexMidstreamFailure = 0;
  primaryCounters.codexLastError = undefined;
  primaryCounters.codexLastSuccessAt = undefined;
  breakerUntil = 0;
  breakerReason = "";
}

function latchBreaker(ms: number, reason: string): void {
  breakerUntil = Date.now() + ms;
  breakerReason = reason;
}

export function clearCodexBreaker(): void {
  breakerUntil = 0;
  breakerReason = "";
}

function shouldSkipCodex(): string | undefined {
  if ((process.env["CODEX_ENABLED"] ?? "true").toLowerCase() === "false") return "disabled";
  if (breakerActive()) return `breaker:${breakerReason}`;
  if (isCodexLimitExhausted()) return "rate-exhausted";
  return undefined;
}

export async function* withCodexPrimary(
  phase: "r1" | "r2",
  messages: ChatMessage[],
  tools: ToolDef[],
  db: DatabaseAdapter | undefined,
  fallback: () => AsyncGenerator<StreamYield>,
  teamId?: string,
  botId?: string,
  server?: CodexAppServer,
): AsyncGenerator<StreamYield> {
  const skip = shouldSkipCodex();
  if (skip !== undefined) {
    if (phase === "r1") primaryCounters.codexFallbackR1 += 1;
    else primaryCounters.codexFallbackR2 += 1;
    yield* fallback();
    return;
  }
  primaryCounters.codexAttempts += 1;
  let started = false;
  try {
    for await (const chunk of streamCodexChat({ phase, messages, tools, db, teamId, botId, ...(server ? { server } : {}) })) {
      if (chunk.kind === "delta" || chunk.kind === "tool") started = true;
      yield chunk as StreamYield;
    }
    primaryCounters.codexSuccess += 1;
    primaryCounters.codexLastSuccessAt = Date.now();
  } catch (err) {
    const isCodexError = err && typeof err === "object" && "kind" in err;
    const kind = isCodexError ? (err as any).kind : "unknown";
    primaryCounters.codexLastError = `${kind}: ${err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160)}`;
    
    // Fallback if we haven't started streaming and it's a known transient/protocol error
    if (!started && isCodexError && canFallbackBeforeStart(kind)) {
      primaryCounters.codexPrestartFailure += 1;
      if (phase === "r1") primaryCounters.codexFallbackR1 += 1;
      else primaryCounters.codexFallbackR2 += 1;
      // Latch short breakers for hard gates so we don't burn every request.
      if (kind === "not_authenticated" || kind === "binary_missing") latchBreaker(60_000, kind);
      else if (kind === "model_unavailable" || kind === "turn_failed") latchBreaker(120_000, kind);
      else if (kind === "rate_limited") latchBreaker(60_000, kind);
      yield* fallback();
      return;
    }
    if (started) primaryCounters.codexMidstreamFailure += 1;
    else primaryCounters.codexPrestartFailure += 1;
    throw err;
  }
}

export function streamPrimaryR1(
  messages: ChatMessage[],
  tools: ToolDef[],
  db?: DatabaseAdapter,
  teamId?: string,
  botId?: string,
  server?: CodexAppServer,
): AsyncGenerator<StreamYield> {
  return withCodexPrimary("r1", messages, tools, db, () => streamChat(messages, tools, db), teamId, botId, server);
}

export function streamPrimaryR2(
  messages: ChatMessage[],
  tools: ToolDef[],
  db?: DatabaseAdapter,
  teamId?: string,
  botId?: string,
  server?: CodexAppServer,
): AsyncGenerator<StreamYield & { reasoning?: string }> {
  const gen = withCodexPrimary("r2", messages, tools, db, () => streamZenChat(messages, tools, db) as AsyncGenerator<StreamYield>, teamId, botId, server);
  return gen as AsyncGenerator<StreamYield & { reasoning?: string }>;
}
