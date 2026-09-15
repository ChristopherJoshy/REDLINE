// Long-lived Codex App Server manager (one per backend instance).
// Transport: `codex app-server --listen stdio://` over JSONL stdin/stdout.
// Concurrency: multiplexed via pendingRpc map + per-thread/turn listeners.
// No game logic here; no player content in logs.
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface as Readline } from "node:readline";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CodexError,
  canFallbackBeforeStart,
  classifyRpcError,
  parseJsonRpcLine,
  type CodexErrorKind,
  type RpcId,
} from "./protocol.js";

export type SpawnFn = (
  bin: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; cwd: string },
) => ChildProcess;

export interface AppServerHealth {
  state: "healthy" | "starting" | "binary_missing" | "process_failed" | "idle";
  pid?: number;
  version?: string;
  lastError?: string;
  lastErrorKind?: CodexErrorKind;
  startedAt?: number;
  restartCount: number;
}

export interface TurnEvent {
  method: string;
  params: Record<string, unknown>;
}

type PendingRpc = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ToolHandler = (params: {
  threadId: string;
  turnId: string;
  callId: string;
  tool: string;
  args: unknown;
}) => Promise<{ ackText: string }>;

const PROJECT_VERSION = "0.1.0";

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function discoverBin(explicit?: string): string | undefined {
  if (explicit && explicit.trim() !== "") return explicit.trim();
  if (process.env["CODEX_BIN"] && process.env["CODEX_BIN"].trim() !== "") {
    return process.env["CODEX_BIN"].trim();
  }
  return "codex";
}

function runtimeDir(): string {
  const configured = process.env["CODEX_RUNTIME_DIR"]?.trim();
  if (configured) {
    mkdirSync(configured, { recursive: true });
    return configured;
  }
  const dir = join(tmpdir(), "redline-codex-runtime");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function codexHomeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const home = process.env["CODEX_HOME"]?.trim();
  if (home) {
    env["CODEX_HOME"] = home;
    try {
      mkdirSync(home, { recursive: true });
    } catch {
      // best effort; App Server will surface real errors
    }
  }
  return env;
}

export class CodexAppServer {
  private proc: ChildProcess | null = null;
  private rl: Readline | null = null;
  private nextId = 1;
  private pending = new Map<RpcId, PendingRpc>();
  private turnListeners = new Map<string, Set<(ev: TurnEvent) => void>>();
  private toolHandlers = new Map<string, ToolHandler>();
  private usageListeners = new Set<(params: unknown) => void>();
  private loginListeners = new Set<(params: unknown) => void>();
  private starting: Promise<void> | null = null;
  private initialized = false;
  private restartCount = 0;
  private lastError?: string;
  private lastErrorKind?: CodexErrorKind;
  private startedAt?: number;
  private closed = false;
  private readonly spawnFn: SpawnFn;
  private readonly bin: string | undefined;
  private readonly cwd: string;

  constructor(spawnFn?: SpawnFn, binOverride?: string) {
    this.spawnFn = spawnFn ?? ((b, a, o) => spawn(b, a, { env: o.env, cwd: o.cwd, stdio: ["pipe", "pipe", "pipe"] }));
    this.bin = discoverBin(binOverride);
    this.cwd = runtimeDir();
  }

  health(): AppServerHealth {
    if (this.bin === undefined) return { state: "binary_missing", restartCount: this.restartCount };
    if (this.proc === null) {
      const out: AppServerHealth = {
        state: this.lastErrorKind ? "process_failed" : "idle",
        restartCount: this.restartCount,
      };
      if (this.lastError !== undefined) out.lastError = this.lastError;
      if (this.lastErrorKind !== undefined) out.lastErrorKind = this.lastErrorKind;
      return out;
    }
    if (!this.initialized) {
      const out: AppServerHealth = { state: "starting", restartCount: this.restartCount };
      if (this.proc.pid !== undefined) out.pid = this.proc.pid;
      return out;
    }
    const out: AppServerHealth = {
      state: "healthy",
      restartCount: this.restartCount,
    };
    if (this.proc.pid !== undefined) out.pid = this.proc.pid;
    if (this.startedAt !== undefined) out.startedAt = this.startedAt;
    if (this.lastError !== undefined) out.lastError = this.lastError;
    if (this.lastErrorKind !== undefined) out.lastErrorKind = this.lastErrorKind;
    return out;
  }

  get rpcTimeoutMs(): number {
    return numEnv("CODEX_RPC_TIMEOUT_MS", 30_000);
  }

  onUsage(fn: (params: unknown) => void): () => void {
    this.usageListeners.add(fn);
    return () => {
      this.usageListeners.delete(fn);
    };
  }

  onLoginEvent(fn: (params: unknown) => void): () => void {
    this.loginListeners.add(fn);
    return () => {
      this.loginListeners.delete(fn);
    };
  }

  /** Subscribe to all turn-scoped notifications for a thread (and its turns). */
  subscribeThread(threadId: string, fn: (ev: TurnEvent) => void): () => void {
    let set = this.turnListeners.get(threadId);
    if (!set) {
      set = new Set();
      this.turnListeners.set(threadId, set);
    }
    set.add(fn);
    return () => {
      const s = this.turnListeners.get(threadId);
      if (s) {
        s.delete(fn);
        if (s.size === 0) this.turnListeners.delete(threadId);
      }
    };
  }

  subscribeTurn(turnId: string, fn: (ev: TurnEvent) => void): () => void {
    return this.subscribeThread(`turn:${turnId}`, fn);
  }

  setToolHandler(key: string, fn: ToolHandler): void {
    this.toolHandlers.set(key, fn);
  }

  clearToolHandler(key: string): void {
    this.toolHandlers.delete(key);
  }

  async ensureStarted(): Promise<void> {
    if (this.bin === undefined) {
      throw new CodexError("binary_missing", "Codex CLI not found (CODEX_BIN / PATH)");
    }
    if (this.proc !== null && this.initialized) return;
    if (this.starting !== null) {
      await this.starting;
      return;
    }
    this.starting = this.startLocked();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async startLocked(): Promise<void> {
    const bin = this.bin as string;
    await new Promise<void>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = this.spawnFn(bin, ["app-server", "--listen", "stdio://"], { env: codexHomeEnv(), cwd: this.cwd });
      } catch (err) {
        this.recordFailure("process_unavailable", err);
        reject(new CodexError("process_unavailable", `Codex spawn failed: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }
      if (!child.stdin || !child.stdout) {
        this.recordFailure("process_unavailable", "missing stdio pipes");
        reject(new CodexError("process_unavailable", "Codex process missing stdio pipes"));
        return;
      }
      this.proc = child;
      this.initialized = false;
      const rl = createInterface({ input: child.stdout });
      this.rl = rl;
      rl.on("line", (line) => this.onLine(line));
      child.stderr?.on("data", () => {
        // Intentionally not logged verbosely; transport diagnostics only on failure.
      });
      child.on("exit", (code, signal) => {
        const detail = `exit code=${String(code)} signal=${String(signal)}`;
        this.handleExit(detail);
      });
      child.on("error", (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENOENT")) {
          this.handleExit("spawn ENOENT (binary missing)");
          reject(new CodexError("binary_missing", "Codex CLI binary not found"));
        } else {
          this.handleExit(msg);
          reject(new CodexError("process_unavailable", `Codex process error: ${msg}`));
        }
      });
      const handshakeTimeout = setTimeout(() => {
        this.handleExit("handshake timeout");
        reject(new CodexError("process_unavailable", "Codex handshake timed out"));
      }, this.rpcTimeoutMs);
      handshakeTimeout.unref?.();
      void this.handshake().then(
        () => {
          clearTimeout(handshakeTimeout);
          this.initialized = true;
          this.startedAt = Date.now();
          resolve();
        },
        (err) => {
          clearTimeout(handshakeTimeout);
          this.handleExit(err instanceof Error ? err.message : String(err));
          reject(err instanceof Error ? err : new CodexError("process_unavailable", String(err)));
        },
      );
    }).catch((err) => {
      this.restartCount += 1;
      throw err;
    });
  }

  private async handshake(): Promise<void> {
    await this.callRaw(
      "initialize",
      {
        clientInfo: { name: "event-bot-server", title: "Event Bot Server", version: PROJECT_VERSION },
        capabilities: { experimentalApi: true },
      },
      this.rpcTimeoutMs,
    );
    this.notify("initialized", {});
  }

  private recordFailure(kind: CodexErrorKind, detail: unknown): void {
    this.lastErrorKind = kind;
    this.lastError = detail instanceof Error ? detail.message.slice(0, 200) : String(detail).slice(0, 200);
  }

  private handleExit(detail: string): void {
    this.recordFailure("process_unavailable", detail);
    this.initialized = false;
    if (this.rl) {
      try {
        this.rl.close();
      } catch {
        // ignore
      }
      this.rl = null;
    }
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try {
        proc.kill();
      } catch {
        // already dead
      }
    }
    const err = new CodexError("transport_closed", `Codex App Server exited: ${detail.slice(0, 160)}`);
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
    // Turn listeners observe closure via pending rejection + timeout guards in codexChat.
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed === "") return;
    const parsed = parseJsonRpcLine(trimmed);
    if (parsed.kind === "response") {
      const pending = this.pending.get(parsed.id);
      if (!pending) return; // stale/late response after timeout; ignore
      this.pending.delete(parsed.id);
      clearTimeout(pending.timer);
      if (parsed.error) {
        const kind = classifyRpcError({
          ...(parsed.error.code !== undefined ? { code: parsed.error.code } : {}),
          ...(parsed.error.message !== undefined ? { message: parsed.error.message } : {}),
          ...(parsed.error.data !== undefined ? { data: parsed.error.data } : {}),
        });
        pending.reject(new CodexError(kind, `codex ${kind}: ${(parsed.error.message ?? "").slice(0, 160)}`, kind === "overloaded"));
      } else {
        pending.resolve(parsed.result);
      }
      return;
    }
    if (parsed.kind === "server_request") {
      void this.onServerRequest(parsed.id, parsed.method, parsed.params);
      return;
    }
    if (parsed.kind === "notification") {
      this.onNotification(parsed.method, parsed.params);
      return;
    }
    // Malformed line: safe diagnostic, do not kill unrelated turns.
  }

  private onNotification(method: string, params: unknown): void {
    if (method === "account/rateLimits/updated") {
      for (const fn of this.usageListeners) {
        try {
          fn(params);
        } catch {
          // listener errors must not break transport
        }
      }
      return;
    }
    if (method === "account/login/completed" || method === "account/updated") {
      for (const fn of this.loginListeners) {
        try {
          fn(params);
        } catch {
          // ignore
        }
      }
      return;
    }
    const rec = (typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {}) as Record<string, unknown>;
    const threadId = typeof rec["threadId"] === "string" ? (rec["threadId"] as string) : undefined;
    const turnId = typeof rec["turnId"] === "string" ? (rec["turnId"] as string) : undefined;
    const ev: TurnEvent = { method, params: rec };
    if (threadId) {
      const set = this.turnListeners.get(threadId);
      if (set) for (const fn of [...set]) fn(ev);
    }
    if (turnId) {
      const set = this.turnListeners.get(`turn:${turnId}`);
      if (set) for (const fn of [...set]) fn(ev);
    }
  }

  private async onServerRequest(id: RpcId, method: string, params: unknown): Promise<void> {
    if (method !== "item/tool/call") {
      this.respond(id, undefined, { code: -32601, message: `unsupported server method: ${method}` });
      return;
    }
    const rec = (typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {}) as Record<string, unknown>;
    const threadId = typeof rec["threadId"] === "string" ? (rec["threadId"] as string) : "";
    const turnId = typeof rec["turnId"] === "string" ? (rec["turnId"] as string) : "";
    const callId = typeof rec["callId"] === "string" ? (rec["callId"] as string) : "";
    const tool = typeof rec["tool"] === "string" ? (rec["tool"] as string) : "";
    if (!threadId || !turnId || !callId || !tool) {
      this.respond(id, undefined, { code: -32602, message: "malformed item/tool/call" });
      return;
    }
    const handler = this.toolHandlers.get(`${threadId}:${turnId}`) ?? this.toolHandlers.get(threadId);
    if (!handler) {
      this.respond(id, undefined, { code: -32601, message: "no tool handler for turn" });
      return;
    }
    try {
      const out = await handler({ threadId, turnId, callId, tool, args: rec["arguments"] });
      this.respond(id, { contentItems: [{ type: "inputText", text: out.ackText }], success: true }, undefined);
    } catch (err) {
      this.respond(id, undefined, { code: -32603, message: err instanceof Error ? err.message.slice(0, 200) : "tool handler failed" });
    }
  }

  private respond(id: RpcId, result: unknown, error: { code: number | string; message: string } | undefined): void {
    const proc = this.proc;
    if (!proc?.stdin || proc.stdin.destroyed) return;
    const payload =
      error !== undefined
        ? { id, error: { code: error.code, message: error.message } }
        : { id, result: result ?? null };
    try {
      proc.stdin.write(`${JSON.stringify(payload)}\n`);
    } catch {
      // transport already dead; turn guards handle it
    }
  }

  private notify(method: string, params: unknown): void {
    const proc = this.proc;
    if (!proc?.stdin || proc.stdin.destroyed) return;
    try {
      proc.stdin.write(`${JSON.stringify({ method, params })}\n`);
    } catch {
      // ignore
    }
  }

  async callRaw(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    const proc = this.proc;
    if (!proc?.stdin || proc.stdin.destroyed || this.closed) {
      throw new CodexError("transport_closed", `Codex transport unavailable for ${method}`);
    }
    const id = this.nextId++;
    const timeout = timeoutMs ?? this.rpcTimeoutMs;
    const payload = { id, method, params: params ?? null };
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexError("timeout_before_start", `Codex rpc timeout: ${method}`));
      }, timeout);
      if (typeof timer.unref === "function") timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try {
        proc.stdin?.write(`${JSON.stringify(payload)}\n`, (err) => {
          if (err) {
            const p = this.pending.get(id);
            if (p) {
              this.pending.delete(id);
              clearTimeout(p.timer);
              p.reject(new CodexError("transport_closed", `Codex write failed: ${method}`));
            }
          }
        });
      } catch (err) {
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          clearTimeout(p.timer);
          p.reject(new CodexError("transport_closed", `Codex write threw: ${method}`));
        }
      }
    });
    return result;
  }

  /** Standard call: ensures the process is up, then issues one RPC. */
  async call(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    await this.ensureStarted();
    try {
      return await this.callRaw(method, params, timeoutMs);
    } catch (err) {
      if (err instanceof CodexError && err.kind === "transport_closed") {
        this.recordFailure(err.kind, err.message);
      }
      throw err;
    }
  }

  async restart(): Promise<void> {
    this.closeTransportOnly();
    this.restartCount += 1;
    await this.ensureStarted();
  }

  private closeTransportOnly(): void {
    this.initialized = false;
    if (this.rl) {
      try {
        this.rl.close();
      } catch {
        // ignore
      }
      this.rl = null;
    }
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }
  }

  close(): void {
    this.closed = true;
    const err = new CodexError("transport_closed", "Codex App Server shutting down");
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
    this.closeTransportOnly();
  }

  /** For tests: inject a raw inbound line as if read from stdout. */
  injectLineForTests(line: string): void {
    this.onLine(line);
  }

  pendingCountForTests(): number {
    return this.pending.size;
  }
}

let shared: CodexAppServer | null = null;

/** Process-wide singleton (one App Server per backend instance). */
export function sharedAppServer(): CodexAppServer {
  if (!shared) shared = new CodexAppServer();
  return shared;
}

/** For tests only. */
export function resetSharedAppServerForTests(): void {
  if (shared) {
    try {
      shared.close();
    } catch {
      // ignore
    }
  }
  shared = null;
}

export { canFallbackBeforeStart };
export type { CodexErrorKind };
