import type { DatabaseAdapter } from "../db/database.js";
import type { RoundNumber, RoundState, RoundSnapshot } from "../contracts/rounds.js";

export const COUNTDOWN_MS = 30_000;
export const MAX_DURATION_SECS = 86_400;

interface Schedule { startsAt: string; endsAt: string; stopped: boolean }

function schedule(db: DatabaseAdapter, round: RoundNumber): Schedule | null {
  const raw = db.get<{ value: string }>("SELECT value FROM game_state WHERE key = ?", `round${round}_schedule`)?.value;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Schedule;
    if (typeof value.startsAt !== "string" || typeof value.endsAt !== "string" || typeof value.stopped !== "boolean") return null;
    const start = Date.parse(value.startsAt);
    const end = Date.parse(value.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? value : null;
  } catch { return null; }
}

function save(db: DatabaseAdapter, round: RoundNumber, value: Schedule): void {
  db.run("INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", `round${round}_schedule`, JSON.stringify(value));
}

export function roundState(db: DatabaseAdapter, round: RoundNumber, now = Date.now()): RoundState {
  const saved = schedule(db, round);
  if (!saved) return { status: "not_started", startsAt: null, endsAt: null, durationSecs: 0 };
  const start = Date.parse(saved.startsAt);
  const end = Date.parse(saved.endsAt);
  return {
    status: saved.stopped || now >= end ? "ended" : now < start ? "countdown" : "active",
    startsAt: saved.startsAt,
    endsAt: saved.endsAt,
    durationSecs: (end - start) / 1000,
  };
}

export function roundSnapshot(db: DatabaseAdapter, now = Date.now()): RoundSnapshot {
  return { serverNow: new Date(now).toISOString(), round1: roundState(db, 1, now), round2: roundState(db, 2, now) };
}

export function startRound(db: DatabaseAdapter, round: RoundNumber, durationSecs: number, now = Date.now()): RoundState {
  if (!Number.isInteger(durationSecs) || durationSecs < 1 || durationSecs > MAX_DURATION_SECS) throw new Error("Duration must be between 1 second and 24 hours.");
  save(db, round, { startsAt: new Date(now + COUNTDOWN_MS).toISOString(), endsAt: new Date(now + COUNTDOWN_MS + durationSecs * 1000).toISOString(), stopped: false });
  return roundState(db, round, now);
}

export function stopRound(db: DatabaseAdapter, round: RoundNumber): void {
  const saved = schedule(db, round);
  if (saved) save(db, round, { ...saved, stopped: true });
}

export function extendRound(db: DatabaseAdapter, round: RoundNumber, addSecs: number, now = Date.now()): RoundState {
  if (!Number.isInteger(addSecs) || addSecs < 1 || addSecs > MAX_DURATION_SECS) throw new Error("Extension must be between 1 second and 24 hours.");
  const saved = schedule(db, round);
  if (!saved || roundState(db, round, now).status !== "active") throw new Error(`Round ${round} is not active.`);
  if ((Date.parse(saved.endsAt) - Date.parse(saved.startsAt)) / 1000 + addSecs > MAX_DURATION_SECS) throw new Error("Total duration cannot exceed 24 hours.");
  save(db, round, { ...saved, endsAt: new Date(Date.parse(saved.endsAt) + addSecs * 1000).toISOString() });
  return roundState(db, round, now);
}
