import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase } from "../db/database.js";
import { r2Phase, r2Prompt } from "./r2.js";

test("Round 2 bosses keep Phase 1 distinct until their configured release turn", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Team', 'hash', 'TEST')");
    for (let turn = 0; turn < 4; turn += 1) {
      db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES ('team', 'aizen', 'user', ?)", `turn ${turn}`);
    }
    assert.equal(r2Phase(db, "team", "aizen"), "p1");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES ('team', 'aizen', 'user', 'release')");
    assert.equal(r2Phase(db, "team", "aizen"), "p2");
    assert.equal(r2Prompt(db, "team", "aizen").reveal, true);

    for (let turn = 0; turn < 5; turn += 1) {
      db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES ('team', 'itachi', 'user', ?)", `turn ${turn}`);
    }
    assert.equal(r2Phase(db, "team", "itachi"), "p1");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES ('team', 'itachi', 'user', 'release')");
    assert.equal(r2Phase(db, "team", "itachi"), "p2");
    assert.equal(r2Prompt(db, "team", "itachi").reveal, true);
  } finally {
    db.close();
  }
});
