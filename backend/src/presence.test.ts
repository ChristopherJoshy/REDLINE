import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase } from "./db/database.js";
import { heartbeatPresence, memberNonce, mintSessionNonce, reconcilePresence, revokeSession, setPresence } from "./presence.js";

function seed(db: ReturnType<typeof openDatabase>): void {
  db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('t1', 'Team', 'h', 'H')");
  db.run("INSERT INTO team_members (team_id, display_name) VALUES ('t1', 'Kai')");
  db.run("INSERT INTO team_members (team_id, display_name) VALUES ('t1', 'Rey')");
}

test("presence tracks online/away and logout marks offline with a timestamp", () => {
  const db = openDatabase(":memory:", join(__dirname, "db/schema.sql"));
  try {
    seed(db);
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Kai'")?.presence, "offline");
    setPresence(db, "t1", "Kai", "online");
    setPresence(db, "t1", "Rey", "away");
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Kai'")?.presence, "online");
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Rey'")?.presence, "away");
    const seen = db.get<{ last_seen_at: string }>("SELECT last_seen_at FROM team_members WHERE display_name = 'Kai'")?.last_seen_at;
    assert.ok(seen && !Number.isNaN(Date.parse(seen)));
    revokeSession(db, "t1", "Kai");
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Kai'")?.presence, "offline");
  } finally {
    db.close();
  }
});

test("reconciler flips only members with no live socket", () => {
  const db = openDatabase(":memory:", join(__dirname, "db/schema.sql"));
  try {
    seed(db);
    setPresence(db, "t1", "Kai", "online");
    setPresence(db, "t1", "Rey", "online");
    const live = new Set(["t1\nKai"]);
    assert.equal(reconcilePresence(db, live), 1);
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Kai'")?.presence, "online");
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Rey'")?.presence, "offline");
    assert.equal(reconcilePresence(db, live), 0);
  } finally {
    db.close();
  }
});

test("heartbeat lease keeps a player online without a gameplay socket", () => {
  const db = openDatabase(":memory:", join(__dirname, "db/schema.sql"));
  try {
    seed(db);
    heartbeatPresence(db, "t1", "Kai", "online");
    assert.equal(reconcilePresence(db, new Set()), 0);
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE display_name = 'Kai'")?.presence, "online");
    revokeSession(db, "t1", "Kai");
  } finally {
    db.close();
  }
});

test("minting a nonce twice gives unique values", () => {
  const db = openDatabase(":memory:", join(__dirname, "db/schema.sql"));
  try {
    seed(db);
    const a = mintSessionNonce(db, "t1", "Kai");
    const b = mintSessionNonce(db, "t1", "Kai");
    assert.notEqual(a, b);
    assert.equal(memberNonce(db, "t1", "Kai"), b);
  } finally {
    db.close();
  }
});
