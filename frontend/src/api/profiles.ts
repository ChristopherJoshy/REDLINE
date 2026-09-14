import { apiFetch } from "./client";

export interface CoverProfile {
  team_id: string;
  display_name: string;
  bot_id: string;
  alias: string;
  role: string;
  affiliation: string;
  detail: string;
  updated_at: string;
}

export interface CoverFields {
  bot_id: string;
  alias: string;
  role: string;
  affiliation: string;
  detail: string;
}

async function read<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "request failed");
  }
  return data;
}

// Own cover for a specific bot; returns null when none filed yet.
export async function getCover(botId: string): Promise<CoverProfile | null> {
  const res = await apiFetch(`/api/profile?bot_id=${encodeURIComponent(botId)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { profile: CoverProfile | null };
  return data.profile ?? null;
}

// Whole-team covers (sync view for teammates).
export async function getTeamCovers(): Promise<CoverProfile[]> {
  const res = await apiFetch("/api/profiles");
  const data = await read<{ profiles: CoverProfile[] }>(res);
  return data.profiles;
}

// Create ONCE per bot — server 409s when a row already exists.
export async function createCover(fields: CoverFields): Promise<CoverProfile> {
  const res = await apiFetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const data = await read<{ profile: CoverProfile }>(res);
  return data.profile;
}

// Modify only — server 404s when nothing was ever created.
export async function updateCover(fields: CoverFields): Promise<CoverProfile> {
  const res = await apiFetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const data = await read<{ profile: CoverProfile }>(res);
  return data.profile;
}
