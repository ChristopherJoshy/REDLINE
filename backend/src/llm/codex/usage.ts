// Codex account/usage/model state: cached snapshot + merge updates + public DTO.
// Never exposes tokens; missing fields stay missing (never 0%).
import { CodexAppServer, sharedAppServer } from "./appServer.js";
import { CODEX_MODEL, CodexError } from "./protocol.js";

export interface UsageWindow {
  usedPercent: number;
  remainingPercent: number;
  resetsAt?: number;
}

export interface ResetCreditView {
  id?: string;
  title?: string;
  description?: string;
  expiresAt?: number;
}

export interface CodexPublicStatus {
  runtime: { state: "healthy" | "starting" | "binary_missing" | "process_failed" | "idle"; pid?: number };
  account: { connected: boolean; planType?: string };
  model: { requested: typeof CODEX_MODEL; available: boolean; supportsLow: boolean; supportsMedium: boolean };
  usage: { fiveHour?: UsageWindow; weekly?: UsageWindow; extra?: Array<{ label: string } & UsageWindow> };
  resetCredits: { availableCount: number; credits?: ResetCreditView[] };
  rateLimitReached?: string;
  lastUpdatedAt: number;
}

interface CachedState {
  raw: Record<string, unknown> | null;
  account: { connected: boolean; planType?: string } | null;
  models: Array<{ id?: string; effort?: unknown }> | null;
  updatedAt: number;
}

const cache: CachedState = { raw: null, account: null, models: null, updatedAt: 0 };
let usageListenerAttached = false;

function clampPct(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

export function labelWindow(windowDurationMins: unknown): string | undefined {
  if (windowDurationMins === 300) return "5-hour";
  if (windowDurationMins === 10080) return "weekly";
  return undefined;
}

export function toWindow(input: unknown): UsageWindow | undefined {
  const rec = asRecord(input);
  if (!rec) return undefined;
  const used = clampPct(rec["usedPercent"] ?? rec["used_percent"]);
  if (used === undefined) return undefined;
  const win: UsageWindow = { usedPercent: used, remainingPercent: Math.round((100 - used) * 10) / 10 };
  const resetsAt = rec["resetsAt"] ?? rec["resets_at"] ?? rec["resetAt"];
  if (typeof resetsAt === "number" && Number.isFinite(resetsAt)) win.resetsAt = Math.floor(resetsAt);
  return win;
}

/** Merge sparse `account/rateLimits/updated` payloads: present fields win, absent never clears. */
export function mergeRateLimits(prev: Record<string, unknown> | null, update: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = prev ? { ...prev } : {};
  const rec = asRecord(update);
  if (!rec) return base;
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" && base[k] !== null && !Array.isArray(base[k])) {
      base[k] = { ...(base[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      base[k] = v;
    }
  }
  return base;
}

function pickWindows(raw: Record<string, unknown>): CodexPublicStatus["usage"] {
  const usage: CodexPublicStatus["usage"] = {};
  const windows: Array<{ label?: string | undefined; win: UsageWindow; mins?: unknown | undefined }> = [];
  const push = (obj: unknown, mins?: unknown, fallbackLabel?: string): void => {
    const win = toWindow(obj);
    if (!win) return;
    const label = labelWindow(mins) ?? fallbackLabel;
    windows.push({ label, win, mins });
  };
  const direct = (asRecord(raw["rateLimits"]) ?? raw) as Record<string, unknown>;
  // Newer shape: rateLimitsByLimitId map; legacy: primary/secondary or flat.
  const byId = asRecord(raw["rateLimitsByLimitId"]);
  if (byId) {
    for (const [, v] of Object.entries(byId)) {
      const rec = asRecord(v);
      push(v, rec?.["windowDurationMins"] ?? rec?.["window_duration_mins"]);
    }
  } else {
    push(raw["primary"], asRecord(raw["primary"])?.["windowDurationMins"], "primary");
    push(raw["secondary"], asRecord(raw["secondary"])?.["windowDurationMins"], "secondary");
    if (windows.length === 0) push(direct, asRecord(direct)?.["windowDurationMins"]);
  }
  for (const w of windows) {
    if (w.label === "5-hour" && !usage.fiveHour) usage.fiveHour = w.win;
    else if (w.label === "weekly" && !usage.weekly) usage.weekly = w.win;
    else {
      usage.extra = usage.extra ?? [];
      usage.extra.push({ label: w.label ?? "limit", ...w.win });
    }
  }
  return usage;
}

function pickResetCredits(raw: Record<string, unknown>): { availableCount: number; credits?: ResetCreditView[] } {
  const summary = asRecord(raw["rateLimitResetCredits"]);
  const availableCount = typeof summary?.["availableCount"] === "number" ? (summary["availableCount"] as number) : 0;
  const out: { availableCount: number; credits?: ResetCreditView[] } = { availableCount };
  const rows = Array.isArray(summary?.["credits"]) ? (summary["credits"] as unknown[]) : undefined;
  if (rows) {
    out.credits = rows.map((r) => {
      const rec = asRecord(r) ?? {};
      const view: ResetCreditView = {};
      if (typeof rec["id"] === "string") view.id = rec["id"];
      if (typeof rec["title"] === "string") view.title = rec["title"];
      if (typeof rec["description"] === "string") view.description = rec["description"];
      if (typeof rec["expiresAt"] === "number") view.expiresAt = rec["expiresAt"];
      return view;
    });
  }
  return out;
}

function modelAvailability(models: CachedState["models"]): { available: boolean; supportsLow: boolean; supportsMedium: boolean } {
  if (!models) return { available: false, supportsLow: false, supportsMedium: false };
  const entry = models.find((m) => m.id === CODEX_MODEL);
  if (!entry) return { available: false, supportsLow: false, supportsMedium: false };
  const efforts = Array.isArray(entry.effort) ? (entry.effort as unknown[]).map(String) : undefined;
  // Catalog schemas vary; if effort list absent, assume low/medium supported when model present.
  if (!efforts) return { available: true, supportsLow: true, supportsMedium: true };
  return {
    available: true,
    supportsLow: efforts.includes("low"),
    supportsMedium: efforts.includes("medium"),
  };
}

export function buildPublicStatus(server: CodexAppServer): CodexPublicStatus {
  const h = server.health();
  const runtimeState = h.state === "idle" ? "idle" : h.state;
  const raw = cache.raw ?? {};
  const model = modelAvailability(cache.models);
  const rateLimitReached = typeof raw["rateLimitReachedType"] === "string" ? (raw["rateLimitReachedType"] as string) : undefined;
  return {
    runtime: { state: runtimeState === "idle" ? "starting" : runtimeState, ...(h.pid !== undefined ? { pid: h.pid } : {}) },
    account: { connected: cache.account?.connected ?? false, ...(cache.account?.planType ? { planType: cache.account.planType } : {}) },
    model: { requested: CODEX_MODEL, ...model },
    usage: pickWindows(raw),
    resetCredits: pickResetCredits(raw),
    ...(rateLimitReached ? { rateLimitReached } : {}),
    lastUpdatedAt: cache.updatedAt,
  };
}

async function refreshModels(server: CodexAppServer): Promise<void> {
  try {
    const res = (await server.call("model/list", {})) as unknown;
    const rec = asRecord(res);
    const list = Array.isArray(rec?.["models"]) ? (rec["models"] as Array<{ id?: string; effort?: unknown }>) : Array.isArray(res) ? (res as Array<{ id?: string }>) : [];
    cache.models = list;
  } catch {
    // keep previous catalog; gameplay proceeds via fallback
  }
}

async function refreshAccount(server: CodexAppServer): Promise<void> {
  try {
    const res = asRecord(await server.call("account/read", {})) as Record<string, unknown> | undefined;
    if (res) {
      const connected = res["connected"] ?? res["loggedIn"] ?? res["isLoggedIn"];
      cache.account = {
        connected: connected === true || (typeof res["email"] === "string" && res["email"] !== ""),
        ...(typeof res["planType"] === "string" ? { planType: res["planType"] as string } : {}),
      };
    }
  } catch (err) {
    if (err instanceof CodexError && (err.kind === "not_authenticated" || err.kind === "binary_missing")) {
      cache.account = { connected: false };
    }
  }
}

export async function refreshUsage(server?: CodexAppServer): Promise<CodexPublicStatus> {
  const srv = server ?? sharedAppServer();
  attachUsageListener(srv);
  try {
    await srv.ensureStarted();
  } catch {
    cache.updatedAt = Date.now();
    return buildPublicStatus(srv);
  }
  await refreshAccount(srv);
  if (cache.models === null) await refreshModels(srv);
  try {
    const res = (await srv.call("account/rateLimits/read", {})) as unknown;
    const rec = asRecord(res) ?? {};
    cache.raw = mergeRateLimits(cache.raw, rec);
    cache.updatedAt = Date.now();
  } catch {
    cache.updatedAt = Date.now();
  }
  return buildPublicStatus(srv);
}

export function attachUsageListener(server: CodexAppServer): void {
  if (usageListenerAttached) return;
  usageListenerAttached = true;
  server.onUsage((params) => {
    cache.raw = mergeRateLimits(cache.raw, params);
    cache.updatedAt = Date.now();
  });
  server.onLoginEvent(() => {
    cache.account = null;
    cache.models = null;
    cache.updatedAt = Date.now();
  });
}

/** Rate-limit-aware gate: true when cached state clearly says the window is exhausted. */
export function isCodexLimitExhausted(): boolean {
  const raw = cache.raw;
  if (!raw) return false;
  const rec = asRecord(raw["rateLimits"]) ?? raw;
  const reached = raw["rateLimitReachedType"] ?? rec["rateLimitReachedType"];
  if (typeof reached === "string" && reached !== "") return true;
  const used = rec["usedPercent"] ?? rec["used_percent"];
  if (typeof used === "number" && used >= 100) {
    const resetsAt = rec["resetsAt"] ?? rec["resets_at"];
    if (typeof resetsAt === "number" && resetsAt * 1000 > Date.now()) return true;
    if (typeof resetsAt !== "number") return true;
  }
  return false;
}

export function cachedModelAvailable(): boolean {
  return modelAvailability(cache.models).available;
}

/** For tests. */
export function resetUsageCacheForTests(): void {
  cache.raw = null;
  cache.account = null;
  cache.models = null;
  cache.updatedAt = 0;
  usageListenerAttached = false;
}

export function seedUsageCacheForTests(raw: Record<string, unknown>, account?: { connected: boolean; planType?: string }, models?: Array<{ id?: string; effort?: unknown }>): void {
  cache.raw = raw;
  if (account) cache.account = account;
  if (models) cache.models = models;
  cache.updatedAt = Date.now();
}
