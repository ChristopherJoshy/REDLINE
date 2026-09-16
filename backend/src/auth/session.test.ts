import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";
import { makeSessionToken, verifySessionToken } from "./codes.js";
import { sessionOf } from "../routes/teams.js";
import { memberNonce, mintSessionNonce, revokeSession } from "../presence.js";
import { openDatabase } from "../db/database.js";

const PEPPER = "test-pepper-sessions";

function reqWith(token: string): { headers: Record<string, string | string[] | undefined> } {
  return { headers: { "x-session-token": token } };
}

test("nonce tokens round-trip; legacy 3-part tokens still verify as empty nonce", () => {
  const fresh = makeSessionToken("team", "Kai", PEPPER, "abc123");
  assert.equal(fresh.split(".").length, 4);
  assert.deepEqual(verifySessionToken(fresh, PEPPER), { teamId: "team", displayName: "Kai", nonce: "abc123" });
  // Legacy deterministic token (minted before nonces existed)
  const a = Buffer.from("team", "utf8").toString("base64url");
  const b = Buffer.from("Kai", "utf8").toString("base64url");
  const sig = createHmac("sha256", PEPPER).update(`${a}.${b}`, "utf8").digest("hex");
  assert.deepEqual(verifySessionToken(`${a}.${b}.${sig}`, PEPPER), { teamId: "team", displayName: "Kai", nonce: "" });
});

test("tampered tokens and wrong nonces are rejected", () => {
  const token = makeSessionToken("team", "Kai", PEPPER, "n1");
  const parts = token.split(".");
  assert.equal(verifySessionToken([...parts.slice(0, 3), "0".repeat(64)].join("."), PEPPER), undefined);
  assert.equal(verifySessionToken("not.a.token.at.all", PEPPER), undefined);
  assert.equal(verifySessionToken(makeSessionToken("team", "Kai", "wrong-pepper", "n1"), PEPPER), undefined);
});

test("logout revokes the token; re-login mints a working one (sessionOf + nonce)", () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = PEPPER;
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('t1', 'Team', 'h', 'H')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('t1', 'Kai')");
    // Fresh row has empty nonce: legacy-style login still passes
    const legacyToken = makeSessionToken("t1", "Kai", PEPPER);
    assert.deepEqual(sessionOf(reqWith(legacyToken), db), { teamId: "t1", displayName: "Kai" });
    // Login mints a nonce-bound token
    const nonce = mintSessionNonce(db, "t1", "Kai");
    assert.notEqual(nonce, "");
    const token = makeSessionToken("t1", "Kai", PEPPER, nonce);
    assert.deepEqual(sessionOf(reqWith(token), db), { teamId: "t1", displayName: "Kai" });
    // Logout / force-logout revokes it
    revokeSession(db, "t1", "Kai");
    assert.notEqual(memberNonce(db, "t1", "Kai"), nonce);
    assert.equal(sessionOf(reqWith(token), db), undefined);
    assert.equal(sessionOf(reqWith(legacyToken), db), undefined);
    // Re-login works with the fresh nonce
    const nonce2 = mintSessionNonce(db, "t1", "Kai");
    const token2 = makeSessionToken("t1", "Kai", PEPPER, nonce2);
    assert.deepEqual(sessionOf(reqWith(token2), db), { teamId: "t1", displayName: "Kai" });
  } finally {
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});
