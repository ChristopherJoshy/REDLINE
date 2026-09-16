import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { openDatabase } from "../db/database.js";
import { registerAdminRoutes } from "./admin.js";
import { Bus } from "../ws/bus.js";

test("admin credits adjustment supports add, remove, and set", async () => {
  const oldAdminCode = process.env["ADMIN_CODE"];
  process.env["ADMIN_CODE"] = "admin-test-code";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  try {
    db.run("INSERT INTO teams (id, name, join_code_hash, hint, clue_credits) VALUES ('team', 'Test', 'hash', 'TEST', 20)");
    registerAdminRoutes(app, db, join(__dirname, ".."), new Bus());
    const headers = { "x-admin-code": "admin-test-code" };
    const adjust = (mode: "add" | "remove" | "set", amount: number) => app.inject({
      method: "POST",
      url: "/api/admin/credits-adjust",
      headers,
      payload: { teamId: "team", mode, amount, reason: "test adjustment" },
    });

    assert.deepEqual((await adjust("add", 30)).json().after, 50);
    assert.deepEqual((await adjust("remove", 12)).json().after, 38);
    assert.deepEqual((await adjust("set", 7)).json().after, 7);
    assert.equal(db.get<{ clue_credits: number }>("SELECT clue_credits FROM teams WHERE id = 'team'")?.clue_credits, 7);
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/credits-adjust", payload: { teamId: "team", mode: "add", amount: 1 } })).statusCode, 401);
  } finally {
    await app.close();
    db.close();
    if (oldAdminCode === undefined) delete process.env["ADMIN_CODE"]; else process.env["ADMIN_CODE"] = oldAdminCode;
  }
});
