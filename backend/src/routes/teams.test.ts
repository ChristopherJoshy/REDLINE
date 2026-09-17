import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { openDatabase } from "../db/database.js";
import { Bus } from "../ws/bus.js";
import { registerTeamRoutes } from "./teams.js";
import { registerAdminRoutes } from "./admin.js";

test("admin force-logout kills the token; the member can log back in and resume", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  const oldAdmin = process.env["ADMIN_CODE"];
  process.env["JOIN_CODE_PEPPER"] = "test-pepper-teams";
  process.env["ADMIN_CODE"] = "test-admin";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('t1', 'Team', 'h', 'H')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('t1', 'Kai')");
    registerTeamRoutes(app, db, new Bus());
    registerAdminRoutes(app, db, mkdtempSync(join(tmpdir(), "redline-test-")), new Bus());
    const adminHeaders = { "x-admin-code": "test-admin" };

    const identify = () => app.inject({ method: "POST", url: "/api/identify", payload: { teamId: "t1", displayName: "Kai" } });
    const me = (token: string) => app.inject({ method: "GET", url: "/api/me", headers: { "x-session-token": token } });

    const token1 = (await identify()).json().token as string;
    assert.ok(typeof token1 === "string" && token1 !== "");
    assert.equal((await me(token1)).statusCode, 200);

    const kicked = await app.inject({ method: "POST", url: "/api/admin/force-logout", headers: adminHeaders, payload: { teamId: "t1", displayName: "Kai", reason: "test" } });
    assert.equal(kicked.statusCode, 200);
    assert.equal(kicked.json().ok, true);

    // Old token is dead everywhere
    assert.equal((await me(token1)).statusCode, 401);
    // Presence reads offline
    assert.equal(db.get<{ presence: string }>("SELECT presence FROM team_members WHERE team_id = 't1' AND display_name = 'Kai'")?.presence, "offline");

    // Re-login works and the new token is accepted
    const token2 = (await identify()).json().token as string;
    assert.notEqual(token2, token1);
    assert.equal((await me(token2)).statusCode, 200);

    // Self logout also kills the token
    assert.equal((await app.inject({ method: "POST", url: "/api/logout", headers: { "x-session-token": token2 } })).statusCode, 200);
    assert.equal((await me(token2)).statusCode, 401);

    // Unknown member cannot be kicked
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/force-logout", headers: adminHeaders, payload: { teamId: "t1", displayName: "Ghost" } })).statusCode, 404);
    // Unguarded kick is rejected
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/force-logout", payload: { teamId: "t1", displayName: "Kai" } })).statusCode, 401);
  } finally {
    await app.close(); db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
    if (oldAdmin === undefined) delete process.env["ADMIN_CODE"]; else process.env["ADMIN_CODE"] = oldAdmin;
  }
});

test("admin delete removes a team and every related record", async () => {
  const oldAdmin = process.env["ADMIN_CODE"];
  process.env["ADMIN_CODE"] = "test-admin-delete";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.run("INSERT INTO teams (id, name, join_code_hash, hint) VALUES ('delete-me', 'Delete Me', 'delete-hash', 'DELE')");
    db.run("INSERT INTO team_members (team_id, display_name) VALUES ('delete-me', 'Kai')");
    db.run("INSERT INTO merchant_clues (team_id, bot_id, tier) VALUES ('delete-me', 'wick', 1)");
    db.run("INSERT INTO team_inventory (team_id, bot_id, item_key) VALUES ('delete-me', 'wick', 'item')");
    db.run("INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) VALUES ('delete-me', 1, 600, 601, 'test')");
    db.run(
      "INSERT INTO bot_completions (bot_id, round, team_id, completed_by, verified_at, completion_rank) VALUES ('wick', 1, 'delete-me', 'Kai', '2026-01-01T00:00:00.000Z', 1)",
    );
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES ('delete-me', 'wick', 'user', 'hello')");
    db.run("INSERT INTO reasoning_traces (team_id, bot_id, phase, trace_json, guard_json) VALUES ('delete-me', 'wick', 'test', '{}', '{}')");
    db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES ('delete-me', 'wick', 'test')");
    db.run("INSERT INTO fullscreen_attempts (team_id, display_name) VALUES ('delete-me', 'Kai')");
    db.run("INSERT INTO r2_assignments (team_id, boss) VALUES ('delete-me', 'itachi')");
    db.run("INSERT INTO r2_scores (team_id, boss, phase, score, detail) VALUES ('delete-me', 'itachi', 'p1', 1, '{}')");
    db.run("INSERT INTO deterrence_log (team_id, kind) VALUES ('delete-me', 'test')");
    db.run("INSERT INTO cover_profiles (team_id, display_name, bot_id, alias) VALUES ('delete-me', 'Kai', 'wick', 'K')");
    db.run("INSERT INTO security_logs (team_id, display_name, violation_type) VALUES ('delete-me', 'Kai', 'test')");
    db.run("INSERT INTO r2_memories (team_id, boss, display_name, scope, memory) VALUES ('delete-me', 'itachi', 'Kai', 'private', 'test')");
    db.run("INSERT INTO r2_assessments (team_id, boss, display_name, turn_no, delta, fingerprint, reason) VALUES ('delete-me', 'itachi', 'Kai', 1, 1, 'fp', 'test')");
    registerTeamRoutes(app, db, new Bus());

    const response = await app.inject({
      method: "DELETE",
      url: "/api/admin/teams/delete-me",
      headers: { "x-admin-code": "test-admin-delete" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(db.get<{ id: string }>("SELECT id FROM teams WHERE id = 'delete-me'"), undefined);
    for (const table of [
      "team_members",
      "merchant_clues",
      "team_inventory",
      "elo_log",
      "bot_completions",
      "chat_logs",
      "reasoning_traces",
      "sound_events",
      "fullscreen_attempts",
      "r2_assignments",
      "r2_scores",
      "deterrence_log",
      "cover_profiles",
      "security_logs",
      "r2_memories",
      "r2_assessments",
    ]) {
      assert.equal(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE team_id = 'delete-me'`)?.n, 0, table);
    }
  } finally {
    await app.close();
    db.close();
    if (oldAdmin === undefined) delete process.env["ADMIN_CODE"]; else process.env["ADMIN_CODE"] = oldAdmin;
  }
});
