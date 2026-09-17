import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { makeSessionToken } from "../auth/codes.js";
import { openDatabase, type DatabaseAdapter } from "../db/database.js";
import { registerAdminRoutes } from "./admin.js";
import { Bus } from "../ws/bus.js";

interface TestContext {
  app: FastifyInstance;
  db: DatabaseAdapter;
}

function setup(): TestContext {
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  registerAdminRoutes(app, db, join(process.cwd(), "tmp-rewind-test"), new Bus());
  return { app, db };
}

test("R2 rewind isolates the current player and clears private context", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "rewind-test-pepper";
  const { app, db } = setup();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Team', 'hash', 'TEAM')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('team', 'Alice')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('team', 'Bob')");
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES ('team', 'itachi')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'itachi', 'user', 'alice turn', 'Alice')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'itachi', 'assistant', 'alice reply', 'Alice')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'itachi', 'user', 'bob turn', 'Bob')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'itachi', 'assistant', 'bob reply', 'Bob')");
    db.run("INSERT INTO r2_memories (team_id, boss, display_name, scope, memory) VALUES ('team', 'itachi', 'Alice', 'private', 'alice memory')");
    db.run("INSERT INTO r2_memories (team_id, boss, display_name, scope, memory) VALUES ('team', 'itachi', 'Bob', 'private', 'bob memory')");
    db.run("INSERT INTO r2_memories (team_id, boss, display_name, scope, memory) VALUES ('team', 'itachi', '', 'team', 'shared memory')");
    db.run("INSERT INTO sound_events (team_id, bot_id, sound_id, display_name) VALUES ('team', 'itachi', 'escalation:jumpscare', 'Alice')");
    db.run("INSERT INTO sound_events (team_id, bot_id, sound_id, display_name) VALUES ('team', 'itachi', 'escalation:jumpscare', 'Bob')");
    db.run("INSERT INTO reasoning_traces (team_id, bot_id, display_name, phase, trace_json, guard_json) VALUES ('team', 'itachi', 'Alice', 'r2-p1', '{}', '{}')");
    db.run("INSERT INTO reasoning_traces (team_id, bot_id, display_name, phase, trace_json, guard_json) VALUES ('team', 'itachi', 'Bob', 'r2-p1', '{}', '{}')");

    const response = await app.inject({
      method: "POST",
      url: "/api/rewind",
      headers: { "x-session-token": makeSessionToken("team", "Alice", "rewind-test-pepper") },
      payload: { botId: "itachi", turns: 1 },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().messages, []);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = 'team' AND bot_id = 'itachi' AND display_name = 'Alice'")?.n, 0);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = 'team' AND bot_id = 'itachi' AND display_name = 'Bob'")?.n, 2);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM r2_memories WHERE team_id = 'team' AND boss = 'itachi' AND display_name = 'Alice' AND scope = 'private'")?.n, 0);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM r2_memories WHERE team_id = 'team' AND boss = 'itachi' AND display_name = 'Bob' AND scope = 'private'")?.n, 1);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM r2_memories WHERE team_id = 'team' AND boss = 'itachi' AND scope = 'team'")?.n, 1);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sound_events WHERE team_id = 'team' AND bot_id = 'itachi' AND display_name = 'Alice'")?.n, 1);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sound_events WHERE team_id = 'team' AND bot_id = 'itachi' AND display_name = 'Bob'")?.n, 1);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM reasoning_traces WHERE team_id = 'team' AND bot_id = 'itachi' AND display_name = 'Alice'")?.n, 0);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM reasoning_traces WHERE team_id = 'team' AND bot_id = 'itachi' AND display_name = 'Bob'")?.n, 1);
    assert.equal(db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = 'team'")?.elo, 599);
  } finally {
    await app.close();
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"];
    else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});

test("R2 rewind rejects another player's message id", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "rewind-test-pepper-2";
  const { app, db } = setup();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Team', 'hash', 'TEAM')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('team', 'Alice')");
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES ('team', 'aizen')");
    const bobMessage = db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'aizen', 'user', 'bob turn', 'Bob')").lastInsertRowid;
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'aizen', 'assistant', 'bob reply', 'Bob')");

    const response = await app.inject({
      method: "POST",
      url: "/api/rewind",
      headers: { "x-session-token": makeSessionToken("team", "Alice", "rewind-test-pepper-2") },
      payload: { botId: "aizen", messageId: Number(bobMessage) },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = 'team'")?.elo, 600);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = 'team'")?.n, 2);
  } finally {
    await app.close();
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"];
    else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});
test("R1 rewind removes the latest team-wide turn", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "rewind-test-pepper-3";
  const { app, db } = setup();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('team', 'Team', 'hash', 'TEAM')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('team', 'Alice')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'wick', 'user', 'first turn', 'Alice')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'wick', 'assistant', 'first reply', 'Alice')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'wick', 'user', 'latest turn', 'Alice')");
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final, display_name) VALUES ('team', 'wick', 'assistant', 'latest reply', 'Alice')");

    const response = await app.inject({
      method: "POST",
      url: "/api/rewind",
      headers: { "x-session-token": makeSessionToken("team", "Alice", "rewind-test-pepper-3") },
      payload: { botId: "wick", turns: 1 },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().messages.map((message: { text: string }) => message.text), ["first turn", "first reply"]);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = 'team' AND bot_id = 'wick'")?.n, 2);
    assert.equal(db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = 'team'")?.elo, 599);
  } finally {
    await app.close();
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"];
    else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});
