import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase } from "../db/database.js";
import { COUNTDOWN_MS, extendRound, roundState, startRound, stopRound } from "./state.js";

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
