import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer } from "ws";
import { env } from "./env.js";
import { openDatabase } from "./db/database.js";
import { registerTeamRoutes, sessionOf } from "./routes/teams.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerGateRoutes } from "./routes/gates.js";
import { registerRound2Routes } from "./routes/round2.js";
import { registerMerchantRoutes } from "./routes/merchant.js";
import { Bus } from "./ws/bus.js";
import { handleChatSend } from "./chat/handler.js";
import { parseCookies, verifySessionToken } from "./auth/codes.js";
import type { BotId, ClientEvent, InventoryDelta } from "./contracts/events.js";

// src/ and dist/ are both one level below the backend root.
const root = existsSync(join(__dirname, "..", "package.json"))
  ? join(__dirname, "..")
  : join(__dirname, "..", "..");
const app = Fastify({ logger: true });

app.addHook("onRequest", async (req, reply) => {
  const origin = req.headers.origin;
  if (origin) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-session-token, x-admin-code, x-admin-pin, ngrok-skip-browser-warning");
  }
  if (req.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/api/health", async () => ({ ok: true }));

// Single LAN process: the built frontend (dist, sounds included) + API + WS.
const webRoot = join(root, "..", "frontend", "dist");
if (existsSync(webRoot)) {
  app.register(fastifyStatic, { root: webRoot });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      reply.code(404).send({ error: "not found" });
    } else {
      reply.sendFile("index.html");
    }
  });
} else {
  app.register(fastifyStatic, { root: join(root, "public"), prefix: "/sounds/" });
}

mkdirSync(join(root, "data"), { recursive: true });
const db = openDatabase(join(root, "data", "redline.db"), join(__dirname, "db", "schema.sql"));
const bus = new Bus();
registerTeamRoutes(app, db);
registerProfileRoutes(app, db);
registerMerchantRoutes(app, db, bus);
registerGateRoutes(app, db);
registerRound2Routes(app, db, bus);
registerAdminRoutes(app, db, root, bus);

app.post("/api/fullscreen-log", async (req, reply) => {
  const session = sessionOf(req);
  if (session === undefined) {
    return reply.code(401).send({ error: "no session" });
  }
  db.run("INSERT INTO fullscreen_attempts (team_id, display_name) VALUES (?, ?)", session.teamId, session.displayName);
  return { ok: true };
});

app.post("/api/deterrence-log", async (req) => {
  const session = sessionOf(req);
  const body = (req.body ?? {}) as { kind?: unknown };
  const kind = typeof body.kind === "string" ? body.kind.slice(0, 32) : "unknown";
  db.run("INSERT INTO deterrence_log (team_id, kind) VALUES (?, ?)", session?.teamId ?? null, kind);
  return { ok: true };
});

app.get("/api/chat/history", async (req, reply) => {
  const session = sessionOf(req);
  if (session === undefined) {
    return reply.code(401).send({ error: "no session" });
  }
  const logs = db.all<{ bot_id: BotId; role: "user" | "assistant"; text_final: string }>(
    "SELECT bot_id, role, text_final FROM chat_logs WHERE team_id = ? ORDER BY id ASC",
    session.teamId,
  );
  const history: Partial<Record<BotId, Array<{ role: "user" | "bot"; text: string }>>> = {};
  for (const row of logs) {
    if (!history[row.bot_id]) {
      history[row.bot_id] = [];
    }
    history[row.bot_id]!.push({
      role: row.role === "assistant" ? "bot" : "user",
      text: row.text_final,
    });
  }
  return { history };
});

// EventSource fallback for venues whose firewall blocks the WS upgrade.
app.get("/api/stream", async (req, reply) => {
  const session = sessionOf(req);
  if (session === undefined) {
    return reply.code(401).send({ error: "no session" });
  }
  const raw = reply.raw;
  raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  raw.write(`data: ${JSON.stringify(bus.frame("hello_ack", {}))}\n\n`);
  const off = bus.subscribe(session.teamId, (event) => {
    raw.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  raw.on("close", () => {
    off();
  });
});

async function boot(): Promise<void> {
  // Touch env at boot so missing keys fail closed here, not mid-event.
  void env.groqApiKey;
  void env.zenApiKey;
  void env.joinCodePepper;

  await app.listen({ port: env.port, host: "0.0.0.0" });
  const wss = new WebSocketServer({ server: app.server });
  wss.on("connection", (socket, req) => {
    let token: string | undefined;
    if (req.url) {
      try {
        const parsedUrl = new URL(req.url, "http://localhost");
        token = parsedUrl.searchParams.get("token") ?? undefined;
      } catch {
        // ignore
      }
    }
    if (!token) {
      token = parseCookies(req.headers.cookie)["redline_session"];
    }
    const session = token === undefined ? undefined : verifySessionToken(token, env.joinCodePepper);
    if (session === undefined) {
      socket.close(4401, "no session");
      return;
    }
    bus.add(socket, session.teamId);
    socket.on("message", (raw) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(String(raw)) as ClientEvent;
      } catch {
        return;
      }
      if (event.event === "hello") {
        if (typeof event.data.lastEventId === "string") {
          bus.replay(socket, session.teamId, event.data.lastEventId);
        }
        bus.send(socket, bus.frame("hello_ack", {}));
        // Fresh mounts (or a dropped room) start from current truth, not empty.
        const items = db.all<InventoryDelta>(
          "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
          session.teamId,
        );
        const teamRow = db.get<{ elo: number; clue_credits: number }>("SELECT elo, clue_credits FROM teams WHERE id = ?", session.teamId);
        const credits = teamRow?.clue_credits ?? 0;
        bus.send(socket, bus.frame("inventory_sync", { items, credits }));
        if (teamRow !== undefined) {
          bus.send(socket, bus.frame("elo_update", { teamId: session.teamId, elo: teamRow.elo, delta: 0, reason: "sync" }));
        }
        const logs = db.all<{ bot_id: BotId; role: "user" | "assistant"; text_final: string }>(
          "SELECT bot_id, role, text_final FROM chat_logs WHERE team_id = ? ORDER BY id ASC",
          session.teamId,
        );
        const history: Partial<Record<BotId, Array<{ role: "user" | "bot"; text: string }>>> = {};
        for (const row of logs) {
          if (!history[row.bot_id]) {
            history[row.bot_id] = [];
          }
          history[row.bot_id]!.push({
            role: row.role === "assistant" ? "bot" : "user",
            text: row.text_final,
          });
        }
        bus.send(socket, bus.frame("chat_sync", { history }));
      } else if (event.event === "ping") {
        bus.send(socket, bus.frame("pong", {}));
      } else if (event.event === "chat_send") {
        if (event.data.teamId && event.data.teamId !== session.teamId) {
          return;
        }
        void handleChatSend(bus, db, session.teamId, event.data.botId, event.data.text, session.displayName);
      }
    });
  });
  setInterval(() => {
    bus.sweep();
    bus.heartbeat((socket) => socket.ping());
  }, PING_MS).unref();
}

const PING_MS = 25_000;

void boot();
