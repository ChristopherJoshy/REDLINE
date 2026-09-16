import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase } from "../db/database.js";
import { startRound } from "../rounds/state.js";
import { applyAssessmentElo, applyElo } from "./ratings.js";

test("ELO adds a per-character completion-order bonus with an audit trail", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    const now = Date.parse("2026-09-15T10:01:00.000Z");
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('first', 'First', 'one', 'ONE1')");
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('second', 'Second', 'two', 'TWO2')");
    startRound(db, 1, 600, now - 60_000);

    db.run("INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, verified_at) VALUES ('first', 'wick', 'marker', 1, 'verified', '2026-09-15T10:00:30.000Z')");
    const first = applyElo(db, "first", "wick", "FirstPlayer", "verified:wick", now);
    assert.equal(first.completionRank, 1);
    assert.equal(first.speedBonus, 12);
    assert.equal(first.delta, first.baseDelta + 12);

    db.run("INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, verified_at) VALUES ('second', 'wick', 'marker', 1, 'verified', '2026-09-15T10:00:40.000Z')");
    const second = applyElo(db, "second", "wick", "SecondPlayer", "verified:wick", now + 10_000);
    assert.equal(second.completionRank, 2);
    assert.equal(second.speedBonus, 9);
    assert.match(db.get<{ reason: string }>("SELECT reason FROM elo_log WHERE team_id = 'second'")?.reason ?? "", /rank=2;elapsed=40;base=\d+;speed=9/);
  } finally {
    db.close();
  }
});

test("Round 2 assessments are bounded and leave an ELO audit trail", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Team', 'hash', 'TEST')");
    const result = applyAssessmentElo(db, "team", -8, "r2-assessment:itachi:p1;cover contradicted itself");
    assert.equal(result.before, 600);
    assert.equal(result.after, 592);
    assert.equal(result.delta, -8);
    assert.match(db.get<{ reason: string }>("SELECT reason FROM elo_log WHERE team_id = 'team'")?.reason ?? "", /^r2-assessment:itachi:p1;/);
    assert.throws(() => applyAssessmentElo(db, "team", 9, "out of range"), /invalid assessment delta/);
  } finally {
    db.close();
  }
});
