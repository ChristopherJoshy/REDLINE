import { apiFetch } from "./client";

function codexFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  try { headers.set("x-admin-code", localStorage.getItem("redline_admin_code") ?? ""); } catch { /* Server rejects missing credentials. */ }
  return apiFetch(path, { ...init, headers });
}

export interface CodexUsageWindow {
  usedPercent: number;
  remainingPercent: number;
  resetsAt?: number;
}

export interface CodexStatus {
  runtime: { state: string; pid?: number };
  account: { connected: boolean; planType?: string };
  model: { requested: string; available: boolean; supportsLow: boolean; supportsMedium: boolean };
  usage: {
    fiveHour?: CodexUsageWindow;
    weekly?: CodexUsageWindow;
    extra?: Array<{ label: string } & CodexUsageWindow>;
  };
  resetCredits: {
    availableCount: number;
    credits?: Array<{ id?: string; title?: string; description?: string; expiresAt?: number }>;
  };
  rateLimitReached?: string;
  lastUpdatedAt: number;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "request failed");
  return data as T;
}

export function getCodexStatus(signal?: AbortSignal): Promise<CodexStatus> {
  return codexFetch("/api/codex/status", signal ? { signal } : undefined).then((r) => parseJson<CodexStatus>(r));
}

export function refreshCodex(): Promise<CodexStatus> {
  return codexFetch("/api/codex/refresh", { method: "POST" }).then((r) => parseJson<CodexStatus>(r));
}

export function startCodexConnect(): Promise<{ authUrl: string; userCode: string; loginId?: string }> {
  return codexFetch("/api/codex/connect/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then((r) => parseJson<{ authUrl: string; userCode: string; loginId?: string }>(r));
}

export function cancelCodexConnect(loginId?: string): Promise<{ ok: boolean }> {
  return codexFetch("/api/codex/connect/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginId ? { loginId } : {}),
  }).then((r) => parseJson<{ ok: boolean }>(r));
}

export function codexLogout(): Promise<{ ok: boolean }> {
  return codexFetch("/api/codex/logout", { method: "POST" }).then((r) => parseJson<{ ok: boolean }>(r));
}

export function codexRestart(): Promise<{ ok: boolean; error?: string }> {
  return codexFetch("/api/codex/restart", { method: "POST" }).then((r) => parseJson<{ ok: boolean; error?: string }>(r));
}

export function consumeCodexReset(creditId?: string): Promise<{ outcome: string; status?: CodexStatus }> {
  return codexFetch("/api/codex/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creditId ? { creditId } : {}),
  }).then((r) => parseJson<{ outcome: string; status?: CodexStatus }>(r));
}
