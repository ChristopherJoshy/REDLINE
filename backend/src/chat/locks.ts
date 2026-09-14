// Round-1 bot engagement locks: one operator per mark per team.
// A teammate sees live who holds a mark ("bot already in use") and is
// blocked from engaging until the holder leaves or the lease expires.
// In-memory by design: locks are presence, not progress. A server restart
// simply frees every mark. Merchant + R2 bosses are never lockable.
import type { BotId } from "../contracts/events.js";
import { ROUND1_BOTS } from "../bots/registry.js";

export interface BotLock {
  displayName: string;
  since: string;
}

export type LockMap = Partial<Record<BotId, BotLock>>;

// Lease: holder heartbeats every 20s; expiry at 45s so a closed laptop
// frees the mark within one sweep without killing slow typists.
const LEASE_MS = 45_000;

interface Entry extends BotLock {
  expires: number;
}

export function lockable(botId: string): botId is BotId {
  return (ROUND1_BOTS as string[]).includes(botId);
}

export class BotLocks {
  private teams = new Map<string, Map<string, Entry>>();

  /** Acquire (or refresh, when the holder re-knocks). 409-style conflict carries the holder. */
  acquire(teamId: string, botId: string, displayName: string): { ok: true } | { ok: false; holder: BotLock } {
    if (!lockable(botId)) return { ok: true };
    this.sweepTeam(teamId);
    const bots = this.teams.get(teamId);
    const cur = bots?.get(botId);
    if (cur !== undefined && cur.displayName !== displayName) {
      return { ok: false, holder: { displayName: cur.displayName, since: cur.since } };
    }
    const now = Date.now();
    const entry: Entry = {
      displayName,
      since: cur?.displayName === displayName ? cur.since : new Date(now).toISOString(),
      expires: now + LEASE_MS,
    };
    if (bots === undefined) {
      this.teams.set(teamId, new Map([[botId, entry]]));
    } else {
      bots.set(botId, entry);
    }
    return { ok: true };
  }

  /** Release only the holder's own lock; strangers cannot evict. */
  release(teamId: string, botId: string, displayName: string): boolean {
    const bots = this.teams.get(teamId);
    const cur = bots?.get(botId);
    if (cur === undefined || cur.displayName !== displayName) return false;
    bots!.delete(botId);
    if (bots!.size === 0) this.teams.delete(teamId);
    return true;
  }

  holder(teamId: string, botId: string): BotLock | undefined {
    this.sweepTeam(teamId);
    const cur = this.teams.get(teamId)?.get(botId);
    return cur === undefined ? undefined : { displayName: cur.displayName, since: cur.since };
  }

  snapshot(teamId: string): LockMap {
    this.sweepTeam(teamId);
    const out: LockMap = {};
    for (const [botId, e] of this.teams.get(teamId) ?? []) {
      (out as Record<string, BotLock>)[botId] = { displayName: e.displayName, since: e.since };
    }
    return out;
  }

  snapshotAll(): Record<string, LockMap> {
    const out: Record<string, LockMap> = {};
    for (const teamId of this.teams.keys()) {
      const snap = this.snapshot(teamId);
      if (Object.keys(snap).length > 0) out[teamId] = snap;
    }
    return out;
  }

  /** Sweep expired leases. Returns the teamIds whose maps changed. */
  sweep(): string[] {
    const changed: string[] = [];
    for (const teamId of [...this.teams.keys()]) {
      if (this.sweepTeam(teamId)) changed.push(teamId);
    }
    return changed;
  }

  private sweepTeam(teamId: string): boolean {
    const bots = this.teams.get(teamId);
    if (bots === undefined) return false;
    const now = Date.now();
    let changed = false;
    for (const [botId, e] of [...bots.entries()]) {
      if (e.expires <= now) {
        bots.delete(botId);
        changed = true;
      }
    }
    if (bots.size === 0) this.teams.delete(teamId);
    return changed;
  }
}
