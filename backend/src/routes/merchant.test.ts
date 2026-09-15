import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import Fastify from "fastify";
import { openDatabase } from "../db/database.js";
import { Bus } from "../ws/bus.js";
import { makeSessionToken } from "../auth/codes.js";
import { awardItem } from "../bots/inventory.js";
import { BOTS } from "../bots/registry.js";
import { startRound } from "../rounds/state.js";
import { registerMerchantRoutes } from "./merchant.js";
import { r2Submit } from "./round2.js";
import { bossKeys } from "../bots/r2.js";

test("merchant requires real possession and rewards each item only once", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "test-pepper";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Test', 'hash', 'TEST')");
    startRound(db, 1, 3600, Date.now() - 31_000);
    registerMerchantRoutes(app, db, new Bus());
    const text = BOTS.wick!.meta.itemKey;
    const submit = () => app.inject({ method: "POST", url: "/api/submit", headers: { "x-session-token": makeSessionToken("team", "Tester", "test-pepper") }, payload: { text } });
    assert.equal((await submit()).json().result, "troll");
    awardItem(db, "team", "wick", BOTS.wick!.meta.decoyKey, false);
    assert.equal((await submit()).json().result, "troll");
    awardItem(db, "team", "wick", text, true);
    assert.equal((await submit()).json().result, "verified");
    assert.equal((await submit()).json().already, true);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM elo_log")?.n, 1);
    assert.equal(db.get<{ clue_credits: number }>("SELECT clue_credits FROM teams")?.clue_credits, BOTS.wick!.meta.bounty);
  } finally {
    await app.close(); db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});

test("Round 2 correct words and phase alone cannot create an unearned prize", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "test-pepper";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const bus = new Bus();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Test', 'hash', 'TEST')");
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES ('team', 'itachi')");
    startRound(db, 2, 3600, Date.now() - 31_000);
    for (let i = 0; i < 6; i++) db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES ('team', 'itachi', 'user', 'hello')");
    const text = bossKeys("itachi").itemKey;
    assert.equal((await r2Submit(db, bus, "team", "itachi", text)).result, "troll");
    awardItem(db, "team", "itachi", text, true);
    assert.equal((await r2Submit(db, bus, "team", "itachi", text)).result, "verified");
    assert.equal((await r2Submit(db, bus, "team", "itachi", text)).result, "verified");
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM elo_log")?.n, 1);
  } finally {
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});
