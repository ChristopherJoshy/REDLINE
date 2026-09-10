import type { FastifyInstance } from "fastify";
import type { BotId, InventoryDelta } from "../contracts/events.js";
import type { DatabaseAdapter } from "../db/database.js";
import type { Bus } from "../ws/bus.js";
import { env } from "../env.js";
import { sessionOf } from "./teams.js";
import { BOTS, ROUND1_BOTS } from "../bots/registry.js";
import { foldAnswer, matchesAny, variants } from "../portal/normalize.js";
import { CLUE_COST, CLUE_LABEL, clueFor } from "../bots/merchantClues.js";
import { applyElo } from "../elo/ratings.js";
import { bossOf } from "../bots/r2.js";
import { r2Submit } from "./round2.js";
import { round1Open } from "./gates.js";

const ROASTS = [
  "That seal is upside down. The Commander would weep. Try again.",
  "Heh. I have seen better forgeries on a tavern napkin. Again.",
  "Wrong shelf, friend. The real goods do not rattle like that.",
  "Thank you for the laugh. Payment in genuine articles only.",
  "This? This is a decoy and we both know it. Bring me the truth.",
];

function roast(): string {
  return ROASTS[Math.floor(Math.random() * ROASTS.length)] as string;
}

export function registerMerchantRoutes(app: FastifyInstance, db: DatabaseAdapter, bus: Bus): void {
  // No bot picker: single input, server auto-identifies from the matched answer.
  app.post("/api/submit", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (text.trim() === "") {
      return reply.code(400).send({ error: "empty" });
    }
    const forms = variants(text);
    const boss = bossOf(session.teamId, db);
    if (boss !== undefined) {
      return r2Submit(db, bus, session.teamId, boss, text);
    }

    if (!round1Open(db)) {
      return reply.code(403).send({ error: "round sealed" });
    }

    let realHit: BotId | undefined;
    let decoyHit: BotId | undefined;
    for (const botId of ROUND1_BOTS) {
      const entry = BOTS[botId];
      if (entry === undefined) {
        continue;
      }
      if (realHit === undefined && matchesAny(forms, foldAnswer(entry.meta.itemKey), env.joinCodePepper)) {
        realHit = botId;
      }
      if (decoyHit === undefined && matchesAny(forms, foldAnswer(entry.meta.decoyKey), env.joinCodePepper)) {
        decoyHit = botId;
      }
    }

    if (realHit !== undefined) {
      const hit: BotId = realHit;
      const verified = db.get<{ status: string }>(
        "SELECT status FROM team_inventory WHERE team_id = ? AND bot_id = ?",
        session.teamId,
        hit,
      );
      if (verified?.status === "verified") {
        return { result: "verified", botId: hit, already: true as const };
      }
      db.run(
        "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, verified_at, attempt_count) VALUES (?, ?, ?, 1, 'verified', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1) ON CONFLICT(team_id, bot_id) DO UPDATE SET status = 'verified', verified_at = excluded.verified_at, attempt_count = team_inventory.attempt_count + 1",
        session.teamId,
        hit,
        BOTS[hit]?.meta.itemKey ?? "",
      );
      const elo = applyElo(db, session.teamId, hit, `verified:${hit}`);
      const bounty = BOTS[hit]?.meta.bounty ?? 0;
      db.run("UPDATE teams SET clue_credits = clue_credits + ? WHERE id = ?", bounty, session.teamId);
      const credits = db.get<{ clue_credits: number }>("SELECT clue_credits FROM teams WHERE id = ?", session.teamId)?.clue_credits ?? 0;
      const delta: InventoryDelta = { botId: hit, itemKey: BOTS[hit]?.meta.itemKey ?? "", status: "verified" };
      const items = db.all<InventoryDelta>(
        "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
        session.teamId,
      );
      bus.broadcast(session.teamId, bus.frame("inventory_sync", { items, credits }));
      db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES (?, ?, ?)", session.teamId, hit, "merchant/success-thank-you");
      bus.broadcast(session.teamId, bus.frame("sound_play", { botId: "merchant", soundId: "merchant/success-thank-you", src: "/sounds/merchant/success-thank-you.mp3" }));
      return { result: "verified", botId: hit, eloDelta: elo.delta, credits, soundId: "merchant/success-thank-you" };
    }

    if (decoyHit !== undefined) {
      const hit: BotId = decoyHit;
      db.run(
        "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, attempt_count) VALUES (?, ?, ?, 0, 'locked', 1) ON CONFLICT(team_id, bot_id) DO UPDATE SET attempt_count = team_inventory.attempt_count + 1",
        session.teamId,
        hit,
        BOTS[hit]?.meta.decoyKey ?? "",
      );
      db.run("INSERT INTO sound_events (team_id, bot_id, sound_id) VALUES (?, ?, ?)", session.teamId, hit, "merchant/troll-not-enough-cash");
      bus.broadcast(session.teamId, bus.frame("sound_play", { botId: "merchant", soundId: "merchant/troll-not-enough-cash", src: "/sounds/merchant/troll-not-enough-cash.mp3" }));
      return { result: "troll", botId: hit, line: roast(), soundId: "merchant/troll-not-enough-cash" };
    }

    // Silent fail: never reveal which normalization fired or how close it was.
    bus.broadcast(session.teamId, bus.frame("sound_play", { botId: "merchant", soundId: "merchant/troll-not-enough-cash", src: "/sounds/merchant/troll-not-enough-cash.mp3" }));
    return { result: "troll", line: roast(), soundId: "merchant/troll-not-enough-cash" };
  });

  function creditBalance(teamId: string): number {
    return db.get<{ clue_credits: number }>("SELECT clue_credits FROM teams WHERE id = ?", teamId)?.clue_credits ?? 0;
  }

  // Counter state: spendable credits plus owned clue tiers.
  app.get("/api/merchant/state", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const clues = db.all<{ botId: BotId; tier: number }>(
      "SELECT bot_id AS botId, tier FROM merchant_clues WHERE team_id = ?",
      session.teamId,
    );
    return { credits: creditBalance(session.teamId), clues };
  });

  // Buy one sealed clue tier for an unsolved Round-1 mark. Idempotent: owned
  // tiers return free. Unpaid content never leaves this route unpurchased.
  app.post("/api/merchant/clue", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { botId?: unknown; tier?: unknown };
    const botId = typeof body.botId === "string" ? (body.botId as BotId) : undefined;
    const tier = body.tier === 1 || body.tier === 2 ? body.tier : undefined;
    if (botId === undefined || tier === undefined || !ROUND1_BOTS.includes(botId)) {
      return reply.code(400).send({ error: "bad clue" });
    }
    const filed = db.get<{ status: string }>(
      "SELECT status FROM team_inventory WHERE team_id = ? AND bot_id = ?",
      session.teamId,
      botId,
    );
    if (filed?.status === "verified") {
      return reply.code(400).send({ error: "mark filed — no clues needed" });
    }
    const owned = db.get<{ bot_id: string }>(
      "SELECT bot_id FROM merchant_clues WHERE team_id = ? AND bot_id = ? AND tier = ?",
      session.teamId,
      botId,
      tier,
    );
    const clue = clueFor(botId, tier);
    if (clue === undefined) {
      return reply.code(400).send({ error: "bad clue" });
    }
    if (owned !== undefined) {
      return { botId, tier, clue, credits: creditBalance(session.teamId), owned: true as const };
    }
    const cost = CLUE_COST[tier];
    const paid = db.run(
      "UPDATE teams SET clue_credits = clue_credits - ? WHERE id = ? AND clue_credits >= ?",
      cost,
      session.teamId,
      cost,
    );
    if (paid.changes === 0) {
      return reply.code(402).send({ error: "not enough credits — sell a genuine article first" });
    }
    db.run("INSERT INTO merchant_clues (team_id, bot_id, tier) VALUES (?, ?, ?)", session.teamId, botId, tier);
    db.run("INSERT INTO chat_logs (team_id, bot_id, role, text_final) VALUES (?, ?, ?, ?)", session.teamId, "merchant", "assistant", `Sealed ${CLUE_LABEL[tier]} for ${botId}: ${clue}`);
    return { botId, tier, clue, credits: creditBalance(session.teamId), owned: false as const };
  });
}
