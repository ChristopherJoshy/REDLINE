import { apiFetch } from "./client";

export interface JoinResult {
  teamId: string;
  teamName: string;
  members: string[];
}

export interface IdentifyResult {
  teamId: string;
  displayName: string;
  teamName?: string;
  elo?: number;
  token?: string;
}

async function post<T>(path: string, body: unknown, adminCode?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminCode !== undefined) {
    headers["x-admin-code"] = adminCode;
  }
  const res = await apiFetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "request failed");
  }
  return data;
}

export function joinTeam(code: string): Promise<JoinResult> {
  return post<JoinResult>("/api/join", { code });
}

export async function identify(teamId: string, displayName: string): Promise<IdentifyResult> {
  const res = await post<IdentifyResult>("/api/identify", { teamId, displayName });
  if (res.token) {
    try {
      localStorage.setItem("redline_session_token", res.token);
    } catch {
      // LocalStorage might be restricted
    }
  }
  return res;
}

export async function me(): Promise<IdentifyResult> {
  const res = await apiFetch("/api/me");
  const data = (await res.json()) as IdentifyResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "no session");
  }
  return data;
}

export async function logout(): Promise<void> {
  // Server first (it needs the token to revoke the session + mark offline),
  // then drop the local copy no matter what.
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {
    // Server unreachable: still log out locally.
  }
  try {
    localStorage.removeItem("redline_session_token");
  } catch {
    // LocalStorage might be restricted
  }
}


export interface CreateTeamResult {
  id: string;
  name: string;
  code: string;
  hint: string;
}

export function createTeam(adminCode: string, name: string, members: string[]): Promise<CreateTeamResult> {
  return post<CreateTeamResult>("/api/admin/teams", { name, members }, adminCode);
}

/** Returns the list of display_names currently in-session for a team (seat-locked). */
export async function getActiveMembers(teamId: string): Promise<string[]> {
  const res = await apiFetch(`/api/team/active?teamId=${encodeURIComponent(teamId)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { active: string[] };
  return data.active ?? [];
}
