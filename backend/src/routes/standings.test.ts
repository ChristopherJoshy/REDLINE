import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { makeSessionToken } from "../auth/codes.js";
import { openDatabase } from "../db/database.js";
import { registerStandingsRoutes } from "./standings.js";

test("standings exposes the top eight teams", async () => {
  const oldPepper = process.env["JOIN_CODE_PEPPER"];
  process.env["JOIN_CODE_PEPPER"] = "standings-test-pepper";
  const db = openDatabase(":memory:", join(__dirname, "../db/schema.sql"));
  const app = Fastify();
  try {
    for (let i = 1; i <= 9; i++) {
      db.run(
        "INSERT INTO teams (id, name, join_code_hash, hint, elo) VALUES (?, ?, ?, ?, ?)",
        `team-${i}`,
        `Team ${i}`,
        `hash-${i}`,
        `T${String(i).padStart(3, "0")}`,
        1000 - i,
      );
    }
    registerStandingsRoutes(app, db);

    const response = await app.inject({
      method: "GET",
      url: "/api/standings",
      headers: { "x-session-token": makeSessionToken("team-9", "Tester", "standings-test-pepper") },
    });
    const data = response.json() as { leaderboard?: Array<{ rank: number; teamName: string }> };

    assert.equal(response.statusCode, 200);
    assert.equal(data.leaderboard?.length, 8);
    assert.equal(data.leaderboard?.at(-1)?.rank, 8);
    assert.equal(data.leaderboard?.at(-1)?.teamName, "Team 8");
  } finally {
    await app.close();
    db.close();
    if (oldPepper === undefined) delete process.env["JOIN_CODE_PEPPER"]; else process.env["JOIN_CODE_PEPPER"] = oldPepper;
  }
});
