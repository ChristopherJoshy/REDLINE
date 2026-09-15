import { apiFetch } from "./client";

export interface Gates {
  serverNow: string;
  round1: RoundState;
  round2: RoundState;
  round1Open: boolean;
  vaultOpen: boolean;
  qualified: boolean;
  solved: number;
  round1Size: number;
  round2Status: "off" | "countdown" | "active" | "paused";
  round2TimeLeft: number;
}

export interface RoundState {
  status: "not_started" | "countdown" | "active" | "ended" | "paused";
  startsAt: string | null;
  endsAt: string | null;
  durationSecs: number;
}

export async function getGates(): Promise<Gates> {
  const res = await apiFetch("/api/gates");
  if (!res.ok) {
    throw new Error("no gates");
  }
  return (await res.json()) as Gates;
}

async function adminPost(path: string, code: string, body?: Record<string, unknown>): Promise<unknown> {
  const init: RequestInit = { 
    method: "POST", 
    headers: { 
      "x-admin-code": code,
      "Content-Type": "application/json"
    } 
  };
  init.body = JSON.stringify(body ?? {});
  
  const res = await apiFetch(path, init);
  const data = (await res.json()) as { error?: unknown };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "admin request failed");
  }
  return data;
}

export function startRound1(code: string, durationSecs: number): Promise<{ ok: boolean; countdownEndsAt: string; duration: number }> {
  return adminPost("/api/admin/start-round1", code, { durationSecs }) as Promise<{ ok: boolean; countdownEndsAt: string; duration: number }>;
}

export function endRound1(code: string): Promise<unknown> {
  return adminPost("/api/admin/end-round1", code);
}

export function computeTop5(code: string): Promise<{ top5: string[] }> {
  return adminPost("/api/admin/compute-top5", code) as Promise<{ top5: string[] }>;
}

export function openVault(code: string): Promise<unknown> {
  return adminPost("/api/admin/open-vault", code);
}

export function extendRound1(code: string, addSecs: number): Promise<{ ok: boolean; newEndsAt: string; addedSecs: number }> {
  return adminPost("/api/admin/extend-round1", code, { addSecs }) as Promise<{ ok: boolean; newEndsAt: string; addedSecs: number }>;
}

export function reduceRound1(code: string, reduceSecs: number): Promise<{ ok: boolean }> {
  return adminPost("/api/admin/reduce-round1", code, { reduceSecs }) as Promise<{ ok: boolean }>;
}

export function pauseRound1(code: string): Promise<{ ok: boolean }> {
  return adminPost("/api/admin/pause-round1", code) as Promise<{ ok: boolean }>;
}

export function resumeRound1(code: string): Promise<{ ok: boolean }> {
  return adminPost("/api/admin/resume-round1", code) as Promise<{ ok: boolean }>;
}

export function startRound2(code: string, durationSecs = 1800, selectedTeamIds?: string[]): Promise<{ ok: boolean; countdownEndsAt: string; duration: number }> {
  return adminPost("/api/admin/start-round2", code, { durationSecs, selectedTeamIds }) as Promise<{ ok: boolean; countdownEndsAt: string; duration: number }>;
}

export function stopRound2(code: string): Promise<unknown> {
  return adminPost("/api/admin/stop-round2", code);
}

export function extendRound2(code: string, addSecs: number): Promise<{ ok: boolean; newEndsAt: string; addedSecs: number }> {
  return adminPost("/api/admin/extend-round2", code, { addSecs }) as Promise<{ ok: boolean; newEndsAt: string; addedSecs: number }>;
}

export function reduceRound2(code: string, reduceSecs: number): Promise<{ ok: boolean }> {
  return adminPost("/api/admin/reduce-round2", code, { reduceSecs }) as Promise<{ ok: boolean }>;
}

export function pauseRound2(code: string): Promise<{ ok: boolean }> {
  return adminPost("/api/admin/pause-round2", code) as Promise<{ ok: boolean }>;
}

export function resumeRound2(code: string): Promise<{ ok: boolean }> {
  return adminPost("/api/admin/resume-round2", code) as Promise<{ ok: boolean }>;
}

export async function enterRound2(): Promise<{ boss: string }> {
  const res = await apiFetch("/api/round2/enter", { method: "POST" });
  const data = (await res.json()) as { boss: string } & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "vault sealed");
  }
  return data;
}
