import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase } from "../db/database.js";
import { COUNTDOWN_MS, extendRound, pauseRound, resumeRound, roundSnapshot, roundState, startRound, stopRound } from "./state.js";

test("round clock keeps countdown separate from playable duration", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    const now = Date.parse("2026-09-15T10:00:00.000Z");
    const scheduled = startRound(db, 1, 300, now);
    assert.equal(scheduled.status, "countdown");
    assert.equal(Date.parse(scheduled.startsAt ?? "") - now, COUNTDOWN_MS);
    assert.equal(Date.parse(scheduled.endsAt ?? "") - Date.parse(scheduled.startsAt ?? ""), 300_000);
    assert.equal(roundState(db, 1, now + COUNTDOWN_MS).status, "active");
    assert.equal(roundState(db, 1, now + COUNTDOWN_MS + 299_999).status, "active");
    assert.equal(roundState(db, 1, now + COUNTDOWN_MS + 300_000).status, "ended");
  } finally {
    db.close();
  }
});

test("only active rounds extend and a stop ends immediately", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    const now = Date.parse("2026-09-15T10:00:00.000Z");
    startRound(db, 1, 120, now - COUNTDOWN_MS);
    const extended = extendRound(db, 1, 60, now);
    assert.equal(extended.durationSecs, 180);
    assert.equal(roundState(db, 1, now + 179_999).status, "active");
    stopRound(db, 1);
    assert.equal(roundState(db, 1, now).status, "ended");
    assert.throws(() => extendRound(db, 1, 60, now));
  } finally {
    db.close();
  }
});

test("paused rounds hold their clock and cannot be started twice", () => {  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    const now = Date.parse("2026-09-15T10:00:00.000Z");
    startRound(db, 2, 120, now - COUNTDOWN_MS);
    const paused = pauseRound(db, 2, now + 20_000);
    assert.equal(paused.status, "paused");
    assert.equal(roundState(db, 2, now + 200_000).status, "paused");
    assert.throws(() => startRound(db, 2, 60, now + 30_000));
    const resumed = resumeRound(db, 2, now + 200_000);
    assert.equal(resumed.status, "active");
    assert.equal(Date.parse(resumed.endsAt ?? ""), now + 120_000 + 180_000);
  } finally {
    db.close();
  }
});

test("every client sees the identical snapshot for the same server instant", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    const now = Date.parse("2026-09-15T10:00:00.000Z");
    startRound(db, 1, 300, now);
    startRound(db, 2, 600, now);
    // Two clients polling at the same server instant get byte-identical clocks.
    const a = roundSnapshot(db, now + 5_000);
    const b = roundSnapshot(db, now + 5_000);
    assert.deepEqual(a, b);
    assert.equal(a.round1.status, "countdown");
    assert.equal(a.round2.status, "countdown");
    // The 30s countdown boundary is exact: 1ms before start is countdown, at start is active.
    assert.equal(roundState(db, 1, now + COUNTDOWN_MS - 1).status, "countdown");
    assert.equal(roundState(db, 1, now + COUNTDOWN_MS).status, "active");
    // Duration is derived from stored server timestamps, never client clocks.
    assert.equal(a.round1.durationSecs, 300);
    assert.equal(a.round2.durationSecs, 600);
    assert.equal(Date.parse(a.round1.endsAt ?? "") - Date.parse(a.round1.startsAt ?? ""), 300_000);
  } finally {
    db.close();
  }
});
