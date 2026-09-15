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
import { roundState } from "./rounds/state.js";
import { registerRound2Routes } from "./routes/round2.js";
import { registerCodexRoutes } from "./routes/codex.js";
import { sharedAppServer } from "./llm/codex/appServer.js";
import { readAssessmentSettings } from "./assessment/settings.js";
import { registerMerchantRoutes } from "./routes/merchant.js";
import { Bus } from "./ws/bus.js";
import { BotLocks, lockable } from "./chat/locks.js";
import { registerLockRoutes } from "./routes/locks.js";
import { handleChatSend } from "./chat/handler.js";
import { parseCookies, verifySessionToken } from "./auth/codes.js";
import { tokenTracker } from "./llm/tokenTracker.js";
import type { BotId, ClientEvent, InventoryDelta } from "./contracts/events.js";

// src/ and dist/ are both one level below the backend root.
const root = existsSync(join(__dirname, "..", "package.json"))
  ? join(__dirname, "..")
  : join(__dirname, "..", "..");
const app = Fastify({ logger: true });

// Accept requests with empty/missing content-type or empty bodies for parameterless POSTs
app.addContentTypeParser("", (_req, _payload, done) => {
  done(null, {});
});
app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
  try {
    const str = typeof body === "string" ? body : body.toString("utf-8");
    done(null, JSON.parse(str || "{}"));
  } catch {
    done(null, {});
  }
});

app.addHook("onRequest", async (req, reply) => {
  // Open CORS: any origin may call the API. The client sends
  // credentials:include and auth can fall back to the session cookie,
  // so echo the request origin with the credentials flag — a wildcard
  // origin is rejected by browsers on credentialed requests.
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "") {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Vary", "Origin");
  }
  reply.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  reply.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-session-token, x-admin-code, x-admin-pin, x-settings-pin, ngrok-skip-browser-warning",
  );
  reply.header("Access-Control-Max-Age", "86400");
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
const locks = new BotLocks();
registerTeamRoutes(app, db);
registerProfileRoutes(app, db);
registerLockRoutes(app, locks, bus);
registerMerchantRoutes(app, db, bus);
registerGateRoutes(app, db, bus);
registerRound2Routes(app, db, bus);
registerCodexRoutes(app);
registerAdminRoutes(app, db, root, bus, locks);

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
  const logs = db.all<{ id: number; bot_id: BotId; role: "user" | "assistant"; text_final: string; created_at: string }>(
    "SELECT id, bot_id, role, text_final, created_at FROM chat_logs WHERE team_id = ? ORDER BY id ASC",
    session.teamId,
  );
  const history: Partial<Record<BotId, Array<{ id?: number; role: "user" | "bot"; text: string; createdAt?: string }>>> = {};
  for (const row of logs) {
    if (!history[row.bot_id]) {
      history[row.bot_id] = [];
    }
    history[row.bot_id]!.push({
      id: row.id,
      role: row.role === "assistant" ? "bot" : "user",
      text: row.text_final,
      createdAt: row.created_at,
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
  let telemetryInterval: ReturnType<typeof setInterval>;
  // Touch env at boot so missing keys fail closed here, not mid-event.
  void env.groqApiKey;
  void env.zenApiKey;
  void env.joinCodePepper;

  app.addHook("onClose", async () => { clearInterval(roundEvents); clearInterval(telemetryInterval); wss.close(); db.close(); try { sharedAppServer().close(); } catch { /* ignore */ } });

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
    if (session === undefined && token !== env.adminCode) {
      socket.close(4401, "no session");
      return;
    }
    const teamId = session ? session.teamId : "ADMIN";
    bus.add(socket, teamId);
    
    if (session === undefined) {
      // Admin clients don't send hello/chat commands
      return;
    }

    socket.on("message", (raw) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(String(raw)) as ClientEvent;
      } catch {
        return;
      }
      if (event.event === "hello") {
        const assessmentSettings = readAssessmentSettings(db);
        bus.setMember(socket, session.displayName, "online", assessmentSettings.singleTabMode);
        if (typeof event.data.lastEventId === "string") {
          bus.replay(socket, session.teamId, event.data.lastEventId);
        }
        bus.send(socket, bus.frame("hello_ack", {}));
        // Fresh mounts (or a dropped room) start from current truth, not empty.
        const items = db.all<InventoryDelta>(
          "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
          session.teamId,
        );
        bus.send(socket, bus.frame("assessment_settings_sync", assessmentSettings));
        const teamRow = db.get<{ elo: number; clue_credits: number }>("SELECT elo, clue_credits FROM teams WHERE id = ?", session.teamId);
        const credits = teamRow?.clue_credits ?? 0;
        bus.send(socket, bus.frame("inventory_sync", { items, credits }));
        if (teamRow !== undefined) {
          bus.send(socket, bus.frame("elo_update", { teamId: session.teamId, elo: teamRow.elo, delta: 0, reason: "sync" }));
        }
        const logs = db.all<{ id: number; bot_id: BotId; role: "user" | "assistant"; text_final: string; created_at: string }>(
          "SELECT id, bot_id, role, text_final, created_at FROM chat_logs WHERE team_id = ? ORDER BY id ASC",
          session.teamId,
        );
        const history: Partial<Record<BotId, Array<{ id?: number; role: "user" | "bot"; text: string; createdAt?: string }>>> = {};
        for (const row of logs) {
          if (!history[row.bot_id]) {
            history[row.bot_id] = [];
          }
          history[row.bot_id]!.push({
            id: row.id,
            role: row.role === "assistant" ? "bot" : "user",
            text: row.text_final,
            createdAt: row.created_at,
          });
        }
        bus.send(socket, bus.frame("chat_sync", { history }));
        bus.send(socket, bus.frame("bot_locks", { locks: locks.snapshot(session.teamId) }));
      } else if (event.event === "ping") {
        bus.send(socket, bus.frame("pong", {}));
      } else if (event.event === "visibility_change") {
        const member = bus.memberOf(socket);
        if (member) {
          bus.setMember(socket, member.displayName, event.data.status, false);
        }
      } else if (event.event === "security_violation") {
        const member = bus.memberOf(socket);
        if (member) {
          db.run(
            "INSERT INTO security_logs (team_id, display_name, violation_type, detail) VALUES (?, ?, ?, ?)",
            session.teamId,
            member.displayName,
            event.data.type,
            "",
          );
        }
      } else if (event.event === "chat_send") {
        if (event.data.teamId && event.data.teamId !== session.teamId) {
          return;
        }
        // Round-1 single-operator rule: a mark held by a teammate rejects other senders.
        if (lockable(event.data.botId)) {
          const held = locks.holder(session.teamId, event.data.botId);
          if (held !== undefined && held.displayName !== session.displayName) {
            bus.send(
              socket,
              bus.frame("bot_error", {
                botId: event.data.botId,
                message: `${held.displayName} is already talking to this mark`,
                retryable: false,
              }),
            );
            return;
          }
        }
        void handleChatSend(bus, db, session.teamId, event.data.botId, event.data.text, session.displayName);
      }
    });
  });
  setInterval(() => {
    bus.sweep();
    bus.heartbeat((socket) => socket.ping());
    for (const teamId of locks.sweep()) {
      bus.broadcast(teamId, bus.frame("bot_locks", { locks: locks.snapshot(teamId) }));
    }
  }, PING_MS).unref();
  telemetryInterval = setInterval(() => {
    // We can just eagerly broadcast it. If no admins are listening, it just drops.
    const tokens = tokenTracker.getMetrics();
    bus.broadcast("ADMIN", bus.frame("admin_telemetry", {
      tps: tokens.currentTps,
      peakTps: tokens.peakTps,
      tokensIn: tokens.promptTokens,
      tokensOut: tokens.completionTokens,
    }));
  }, 500);
  telemetryInterval.unref();
  
  // Notifications follow the saved clock; gameplay checks the same deadline on every request.
  let previousRound2 = roundState(db, 2).status;
  const roundEvents = setInterval(() => {
    const current = roundState(db, 2);
    if (current.status !== previousRound2) {
      previousRound2 = current.status;
      if (current.status === "active") bus.broadcastAll(bus.frame("round2_start", { durationSecs: current.durationSecs }));
      if (current.status === "ended") bus.broadcastAll(bus.frame("round2_end", { reason: "expired" }));
    }
  }, 250);
  roundEvents.unref();
}

const PING_MS = 25_000;

void boot();
