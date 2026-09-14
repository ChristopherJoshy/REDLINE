// Bot engagement locks: one operator per R1 mark per team.
// Acquire is atomic and re-entrant for the holder (heartbeat refresh).
// Every mutation broadcasts bot_locks so teammates update live.
import type { FastifyInstance } from "fastify";
import type { Bus } from "../ws/bus.js";
import { sessionOf } from "./teams.js";
import { BotLocks, lockable } from "../chat/locks.js";

export function registerLockRoutes(app: FastifyInstance, locks: BotLocks, bus: Bus): void {
  function sync(teamId: string): void {
    bus.broadcast(teamId, bus.frame("bot_locks", { locks: locks.snapshot(teamId) }));
  }

  // Current locks for my team (mount / re-sync).
  app.get("/api/bot-locks", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    return { locks: locks.snapshot(session.teamId) };
  });

  // Take (or refresh) the lock for a mark. 409 names the holder.
  app.post("/api/bot-lock", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { botId?: unknown };
    const botId = typeof body.botId === "string" ? body.botId : "";
    if (!lockable(botId)) {
      return reply.code(400).send({ error: "bot is not lockable" });
    }
    const res = locks.acquire(session.teamId, botId, session.displayName);
    if (!res.ok) {
      return reply.code(409).send({ error: "bot already in use", holder: res.holder });
    }
    sync(session.teamId);
    return { ok: true, locks: locks.snapshot(session.teamId) };
  });

  // Release my own lock. Releasing a mark I don't hold is a no-op.
  app.post("/api/bot-unlock", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { botId?: unknown };
    const botId = typeof body.botId === "string" ? body.botId : "";
    if (!lockable(botId)) {
      return reply.code(400).send({ error: "bot is not lockable" });
    }
    if (locks.release(session.teamId, botId, session.displayName)) {
      sync(session.teamId);
    }
    return { ok: true, locks: locks.snapshot(session.teamId) };
  });
}
