import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import Fastify from "fastify";
import { openDatabase } from "../db/database.js";
import { Bus } from "../ws/bus.js";
import type { ServerEvent } from "../contracts/events.js";
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
  const bus = new Bus();
  const showcaseEvents: ServerEvent[] = [];
  bus.subscribe("team", (event) => showcaseEvents.push(event));
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Test', 'hash', 'TEST')");
    startRound(db, 1, 3600, Date.now() - 31_000);
    registerMerchantRoutes(app, db, bus);
    const text = BOTS.wick!.meta.itemKey;
    const submit = () => app.inject({ method: "POST", url: "/api/submit", headers: { "x-session-token": makeSessionToken("team", "Tester", "test-pepper") }, payload: { text } });
    assert.equal((await submit()).json().result, "troll");
    awardItem(db, "team", "wick", BOTS.wick!.meta.decoyKey, false);
    assert.equal((await submit()).json().result, "troll");
    awardItem(db, "team", "wick", text, true);
    assert.equal((await submit()).json().result, "verified");
    assert.equal((await submit()).json().already, true);
    const showcase = showcaseEvents.find((event) => event.event === "leaderboard_showcase");
    assert.ok(showcase);
    if (showcase.event === "leaderboard_showcase") {
      assert.deepEqual(showcase.data, {
        botId: "wick",
        playerName: "Tester",
        teamName: "Test",
        completionRank: 1,
      });
    }
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
  const completionEvents: ServerEvent[] = [];
  bus.subscribe("team", (event) => completionEvents.push(event));
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Test', 'hash', 'TEST')");
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES ('team', 'itachi')");
    startRound(db, 2, 3600, Date.now() - 31_000);
    for (let i = 0; i < 7; i++) db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'itachi', 'user', 'hello', 'Tester')");
    const text = bossKeys("itachi").itemKey;
    assert.equal((await r2Submit(db, bus, "team", "itachi", text, "Tester")).result, "troll");
    awardItem(db, "team", "itachi", text, true);
    assert.equal((await r2Submit(db, bus, "team", "itachi", text, "Tester")).result, "verified");
    assert.ok(completionEvents.some((event) => event.event === "round2_end" && event.data.reason === "team_completed"));
    assert.equal((await r2Submit(db, bus, "team", "itachi", text, "Tester")).result, "troll");
  } finally {
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});

test("merchant claim is team-scoped and idempotent", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "test-pepper";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Test', 'hash', 'TEST')");
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('other', 'Other', 'hash-other', 'OTHER')");
    awardItem(db, "team", "wick", BOTS.wick!.meta.itemKey, true);
    registerMerchantRoutes(app, db, new Bus());
    const headers = { "x-session-token": makeSessionToken("team", "Tester", "test-pepper") };
    const first = await app.inject({ method: "POST", url: "/api/merchant/claim", headers, payload: { itemKey: BOTS.wick!.meta.itemKey } });
    assert.deepEqual(first.json(), { ok: true, already: false, claimed: true });
    const second = await app.inject({ method: "POST", url: "/api/merchant/claim", headers, payload: { itemKey: BOTS.wick!.meta.itemKey } });
    assert.deepEqual(second.json(), { ok: true, already: true, claimed: true });
    assert.equal(db.get<{ claimed: number }>("SELECT claimed_at IS NOT NULL AS claimed FROM team_inventory WHERE team_id = 'team'")?.claimed, 1);
    const other = await app.inject({
      method: "POST",
      url: "/api/merchant/claim",
      headers: { "x-session-token": makeSessionToken("other", "Other", "test-pepper") },
      payload: { itemKey: BOTS.wick!.meta.itemKey },
    });
    assert.equal(other.statusCode, 404);
  } finally {
    await app.close(); db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});
