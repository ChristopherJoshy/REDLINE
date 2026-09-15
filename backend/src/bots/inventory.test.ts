import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { openDatabase } from "../db/database.js";
import { awardItem } from "./inventory.js";
import { parseHandover } from "./tools.js";

test("malformed handover calls never infer a genuine award", () => {
  for (const args of [null, {}, [], { item_key: "real thing" }, { authenticity: "yes" }]) {
    assert.equal(parseHandover(args), undefined);
  }
  assert.deepEqual(parseHandover({ authenticity: "real" }), { itemKey: undefined, real: true });
});

test("awards improve decoys but cannot downgrade or reopen verified goods", () => {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Test', 'hash', 'TEST')");
    awardItem(db, "team", "wick", "coin", false);
    assert.equal(awardItem(db, "team", "wick", "marker", true)?.itemKey, "marker");
    assert.equal(awardItem(db, "team", "wick", "coin", false), undefined);
    db.run("UPDATE team_inventory SET status = 'verified' WHERE team_id = 'team'");
    assert.equal(awardItem(db, "team", "wick", "marker", true), undefined);
    assert.deepEqual(db.get("SELECT item_key, is_real, status FROM team_inventory"), { item_key: "marker", is_real: 1, status: "verified" });
  } finally { db.close(); }
});
