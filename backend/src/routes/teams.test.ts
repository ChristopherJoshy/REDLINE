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
