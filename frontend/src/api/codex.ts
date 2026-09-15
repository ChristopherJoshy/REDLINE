import { apiFetch, apiUrl } from "./client";

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
  return apiFetch(apiUrl("/api/codex/status"), signal ? { signal } : undefined).then((r) => parseJson<CodexStatus>(r));
}

export function refreshCodex(): Promise<CodexStatus> {
  return apiFetch(apiUrl("/api/codex/refresh"), { method: "POST" }).then((r) => parseJson<CodexStatus>(r));
}

export function startCodexConnect(): Promise<{ authUrl: string; loginId?: string }> {
  return apiFetch(apiUrl("/api/codex/connect/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then((r) => parseJson<{ authUrl: string; loginId?: string }>(r));
}

export function cancelCodexConnect(loginId?: string): Promise<{ ok: boolean }> {
  return apiFetch(apiUrl("/api/codex/connect/cancel"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginId ? { loginId } : {}),
  }).then((r) => parseJson<{ ok: boolean }>(r));
}

export function codexLogout(): Promise<{ ok: boolean }> {
  return apiFetch(apiUrl("/api/codex/logout"), { method: "POST" }).then((r) => parseJson<{ ok: boolean }>(r));
}

export function codexRestart(): Promise<{ ok: boolean; error?: string }> {
  return apiFetch(apiUrl("/api/codex/restart"), { method: "POST" }).then((r) => parseJson<{ ok: boolean; error?: string }>(r));
}

export function consumeCodexReset(creditId?: string): Promise<{ outcome: string; status?: CodexStatus }> {
  return apiFetch(apiUrl("/api/codex/reset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creditId ? { creditId } : {}),
  }).then((r) => parseJson<{ outcome: string; status?: CodexStatus }>(r));
}
