// Member presence + session-nonce helpers. Presence is server truth stored on
// team_members: online/away while a socket or heartbeat lease lives, offline
// on logout, force-logout, or when the 30s reconciler finds neither.
import { randomBytes } from "node:crypto";
import type { DatabaseAdapter } from "./db/database.js";

export type Presence = "online" | "away" | "offline";

const HEARTBEAT_LEASE_MS = 45_000;
const heartbeatLeases = new Map<string, number>();

function presenceKey(teamId: string, displayName: string): string {
  return `${teamId}\n${displayName}`;
}

export function heartbeatPresence(
  db: DatabaseAdapter,
  teamId: string,
  displayName: string,
  presence: Exclude<Presence, "offline">,
): void {
  setPresence(db, teamId, displayName, presence);
  heartbeatLeases.set(presenceKey(teamId, displayName), Date.now() + HEARTBEAT_LEASE_MS);
}

function hasHeartbeatLease(teamId: string, displayName: string, now: number): boolean {
  const key = presenceKey(teamId, displayName);
  const until = heartbeatLeases.get(key);
  if (until === undefined) return false;
  if (until <= now) {
    heartbeatLeases.delete(key);
    return false;
  }
  return true;
}

function clearHeartbeatLease(teamId: string, displayName: string): void {
  heartbeatLeases.delete(presenceKey(teamId, displayName));
}

function nowIso(): string {
  return new Date().toISOString();
}

export function setPresence(db: DatabaseAdapter, teamId: string, displayName: string, presence: Presence): void {
  db.run("UPDATE team_members SET presence = ?, last_seen_at = ? WHERE team_id = ? AND display_name = ?", presence, nowIso(), teamId, displayName);
}

/** Mint a fresh session nonce (login). Returns the new nonce. */
export function mintSessionNonce(db: DatabaseAdapter, teamId: string, displayName: string): string {
  const nonce = randomBytes(12).toString("hex");
  db.run("UPDATE team_members SET session_nonce = ? WHERE team_id = ? AND display_name = ?", nonce, teamId, displayName);
  return nonce;
}

/** Invalidate every outstanding token for this member (logout / force-logout). */
export function revokeSession(db: DatabaseAdapter, teamId: string, displayName: string): void {
  clearHeartbeatLease(teamId, displayName);
  mintSessionNonce(db, teamId, displayName);
  setPresence(db, teamId, displayName, "offline");
}

export function memberNonce(db: DatabaseAdapter, teamId: string, displayName: string): string | undefined {
  return db.get<{ session_nonce: string }>("SELECT session_nonce FROM team_members WHERE team_id = ? AND display_name = ?", teamId, displayName)?.session_nonce;
}

/**
 * Flip members to offline when none of their live socket keys or heartbeat
 * leases remain. Keys are `${teamId}\n${displayName}`.
 */
export function reconcilePresence(db: DatabaseAdapter, live: Set<string>): number {
  const rows = db.all<{ team_id: string; display_name: string }>(
    "SELECT team_id, display_name FROM team_members WHERE presence != 'offline'",
  );
  let flipped = 0;
  const at = nowIso();
  const now = Date.now();
  for (const row of rows) {
    const key = presenceKey(row.team_id, row.display_name);
    if (live.has(key) || hasHeartbeatLease(row.team_id, row.display_name, now)) continue;
    db.run("UPDATE team_members SET presence = 'offline', last_seen_at = ? WHERE team_id = ? AND display_name = ?", at, row.team_id, row.display_name);
    flipped += 1;
  }
  return flipped;
}
