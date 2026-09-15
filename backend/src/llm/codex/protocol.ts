// Codex App Server JSON-RPC protocol helpers.
// Shapes verified against installed codex-cli 0.146.1
// (`codex app-server generate-ts --out <tmp>` + `--experimental` schema).
// This file holds no game logic and performs no I/O.

export const CODEX_MODEL = "gpt-5.6-luna";

export type CodexEffort = "low" | "medium";

export type RpcId = number | string;

export interface RpcRequest {
  id: RpcId;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id?: RpcId;
  result?: unknown;
  error?: { code?: number | string; message?: string; data?: unknown };
}

export interface RpcNotification {
  method: string;
  params?: unknown;
}

export interface ServerIncomingRequest {
  id: RpcId;
  method: string;
  params?: unknown;
}

export type CodexErrorKind =
  | "binary_missing"
  | "process_unavailable"
  | "not_authenticated"
  | "model_unavailable"
  | "rate_limited"
  | "overloaded"
  | "timeout_before_start"
  | "timeout_midstream"
  | "transport_closed"
  | "protocol_error"
  | "turn_failed"
  | "turn_incomplete"
  | "unknown";

export class CodexError extends Error {
  readonly kind: CodexErrorKind;
  readonly retryableTransient: boolean;
  constructor(kind: CodexErrorKind, message: string, retryableTransient = false) {
    super(message);
    // Keep instanceof working when compiled below ES2015.
    Object.setPrototypeOf(this, CodexError.prototype);
    this.name = "CodexError";
    this.kind = kind;
    this.retryableTransient = retryableTransient;
  }
}

/** True when a pre-output failure may fall back to Groq/Zen. */
export function canFallbackBeforeStart(kind: CodexErrorKind): boolean {
  return (
    kind === "binary_missing" ||
    kind === "process_unavailable" ||
    kind === "not_authenticated" ||
    kind === "model_unavailable" ||
    kind === "rate_limited" ||
    kind === "overloaded" ||
    kind === "timeout_before_start" ||
    kind === "transport_closed"
  );
}

/** True for transient busy states worth 1-2 short retries before fallback. */
export function isTransientOverloaded(kind: CodexErrorKind): boolean {
  return kind === "overloaded";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Record<string, unknown>;
}

/** Classify a raw JSON-RPC line into response / server-request / notification. */
export type ParsedLine =
  | { kind: "response"; id: RpcId; result?: unknown | undefined; error?: { code?: string | number | undefined; message?: string | undefined; data?: unknown | undefined } | undefined }
  | { kind: "server_request"; id: RpcId; method: string; params?: unknown | undefined }
  | { kind: "notification"; method: string; params?: unknown | undefined }
  | { kind: "invalid"; raw: string };

export function parseJsonRpcLine(line: string): ParsedLine {
  let msg: unknown;
  try {
    msg = JSON.parse(line) as unknown;
  } catch {
    return { kind: "invalid", raw: line.slice(0, 200) };
  }
  const rec = asRecord(msg);
  if (!rec) return { kind: "invalid", raw: line.slice(0, 200) };
  const id = rec["id"] as RpcId | undefined;
  const method = typeof rec["method"] === "string" ? rec["method"] : undefined;
  const hasResult = Object.prototype.hasOwnProperty.call(rec, "result");
  const hasError = Object.prototype.hasOwnProperty.call(rec, "error");
  if (id !== undefined && (hasResult || hasError)) {
    const errRec = asRecord(rec["error"]);
    const errCode = errRec?.["code"];
    const errMessage = errRec?.["message"];
    const errData = errRec?.["data"];
    if (hasError) {
      return {
        kind: "response" as const,
        id,
        error: {
          ...(typeof errCode === "number" || typeof errCode === "string" ? { code: errCode } : {}),
          message: typeof errMessage === "string" ? errMessage : "codex rpc error",
          ...(errData !== undefined ? { data: errData } : {}),
        },
      };
    }
    return { kind: "response" as const, id, result: rec["result"] };
  }
  if (id !== undefined && method !== undefined) {
    return { kind: "server_request", id, method, params: rec["params"] };
  }
  if (method !== undefined) {
    return { kind: "notification", method, params: rec["params"] };
  }
  return { kind: "invalid", raw: line.slice(0, 200) };
}

/** Map a JSON-RPC error payload to a CodexErrorKind without fragile substring matching on prose. */
export function classifyRpcError(err: { code?: number | string; message?: string; data?: unknown }): CodexErrorKind {
  const data = asRecord(err.data);
  const dataKind = typeof data?.["kind"] === "string" ? (data["kind"] as string) : "";
  const code = err.code;
  if (dataKind === "not_authenticated" || dataKind === "not_logged_in" || dataKind === "unauthenticated") {
    return "not_authenticated";
  }
  if (dataKind === "model_unavailable" || dataKind === "unknown_model") return "model_unavailable";
  if (dataKind === "rate_limited" || dataKind === "rate_limit_reached") return "rate_limited";
  if (dataKind === "overloaded" || dataKind === "server_busy" || dataKind === "try_again") return "overloaded";
  if (code === -32602 || dataKind === "invalid_params") return "protocol_error";
  const msg = (err.message ?? "").toLowerCase();
  if (msg.includes("not logged in") || msg.includes("not authenticated") || msg.includes("unauthorized") || msg.includes("401")) {
    return "not_authenticated";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("quota")) return "rate_limited";
  if (msg.includes("overloaded") || msg.includes("server busy") || msg.includes("try again") || msg.includes("503")) {
    return "overloaded";
  }
  if (msg.includes("model") && (msg.includes("unknown") || msg.includes("unavailable") || msg.includes("not found"))) {
    return "model_unavailable";
  }
  return "unknown";
}

export function classifyTurnError(status: string, detail?: string): CodexErrorKind {
  if (status === "failed") return "turn_failed";
  if (status === "interrupted") return "turn_incomplete";
  const d = (detail ?? "").toLowerCase();
  if (d.includes("rate limit")) return "rate_limited";
  if (d.includes("overload") || d.includes("busy")) return "overloaded";
  return status === "completed" ? "unknown" : "turn_failed";
}
