import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { DatabaseAdapter } from "../db/database.js";
import { env } from "../env.js";
import { adminOk } from "../auth/codes.js";
import { sessionOf } from "./teams.js";
import type { Bus } from "../ws/bus.js";
import type { BotLocks, LockMap } from "../chat/locks.js";
import type { BotId, InventoryDelta, AnnouncementData } from "../contracts/events.js";
import {
  addApiKey,
  deleteApiKey,
  getKeyList,
  registerKeyPoolDb,
  toggleApiKey,
  type LlmProvider,
} from "../llm/keyPool.js";
import { tokenTracker } from "../llm/tokenTracker.js";
import { codexHealthSummary } from "./codex.js";
import { round2Status, round2TimeLeft, round2Duration } from "./gates.js";
import { normalizeAssessmentSettings, readAssessmentSettings } from "../assessment/settings.js";

const EXPORT_TABLES = ["elo_log", "chat_logs", "team_inventory"] as const;
const announcementsHistory: AnnouncementData[] = [];

function adminHeader(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const h = req.headers["x-admin-code"];
  return Array.isArray(h) ? h[0] : h;
}

interface BoardRow {
  name: string;
  hint: string;
  elo: number;
  solved: number;
  rewinds: number;
  lastSolve: string | null;
}

export function registerAdminRoutes(app: FastifyInstance, db: DatabaseAdapter, root: string, bus?: Bus, locks?: BotLocks): void {
  registerKeyPoolDb(db);
  tokenTracker.init(db);

  function guard(req: { headers: Record<string, string | string[] | undefined> }): boolean {
    return adminOk(adminHeader(req), env.adminCode);
  }

  function settingsPinGuard(req: { headers: Record<string, string | string[] | undefined> }): boolean {
    const header = req.headers["x-settings-pin"];
    const val = Array.isArray(header) ? header[0] : header;
    return adminOk(val?.trim(), env.adminSettingsPin);
  }

  // Append an operator audit record for every mutating admin request. The log is
  // intentionally server-owned so browser clients cannot edit or erase it.
  app.addHook("onResponse", async (req, reply) => {
    const path = req.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/admin/") || req.method === "GET" || path.endsWith("/verify") || !guard(req)) return;
    const body = req.body !== null && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 240) : "admin operation";
    const targetId = typeof body.teamId === "string" ? body.teamId : null;
    db.run("INSERT INTO admin_audit (action, target_id, reason, detail) VALUES (?, ?, ?, ?)", `HTTP ${req.method} ${path}`, targetId, reason, JSON.stringify({ statusCode: reply.statusCode }));
  });


  // Rewind: −1 ELO immediately, truncate to point-in-time messageId / turns / phase start.
  app.post("/api/rewind", async (req, reply) => {
    const session = sessionOf(req);
    if (session === undefined) {
      return reply.code(401).send({ error: "no session" });
    }
    const body = (req.body ?? {}) as { botId?: unknown; messageId?: unknown; turns?: unknown };
    if (typeof body.botId !== "string") {
      return reply.code(400).send({ error: "bot required" });
    }
    const team = db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = ?", session.teamId);
    if (team === undefined) {
      return reply.code(404).send({ error: "unknown team" });
    }
    const after = Math.max(0, team.elo - 1);
    const botId = body.botId as BotId;
    const targetMsgId = typeof body.messageId === "number" ? body.messageId : undefined;
    const turns = typeof body.turns === "number" ? body.turns : undefined;

    let cutoffId: number | undefined = targetMsgId;
    if (cutoffId === undefined && typeof turns === "number" && turns > 0) {
      // Find the ID of the Nth latest user turn
      const userRows = db.all<{ id: number }>(
        "SELECT id FROM chat_logs WHERE team_id = ? AND bot_id = ? AND role = 'user' ORDER BY id DESC LIMIT ?",
        session.teamId,
        botId,
        turns,
      );
      if (userRows.length > 0) {
        cutoffId = userRows[userRows.length - 1]?.id;
      }
    }

    db.transaction(() => {
      if (cutoffId !== undefined) {
        db.run("DELETE FROM chat_logs WHERE team_id = ? AND bot_id = ? AND id >= ?", session.teamId, botId, cutoffId);
      } else {
        db.run("DELETE FROM chat_logs WHERE team_id = ? AND bot_id = ?", session.teamId, botId);
      }
      // Revert unverified relic if team was holding it without filing at merchant
      db.run("UPDATE team_inventory SET status = 'locked' WHERE team_id = ? AND bot_id = ? AND status = 'obtained'", session.teamId, botId);

      db.run("UPDATE teams SET elo = ? WHERE id = ?", after, session.teamId);
      db.run(
        "INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) VALUES (?, -1, ?, ?, ?)",
        session.teamId,
        team.elo,
        after,
        cutoffId !== undefined ? `rewind:${botId}:msg_${cutoffId}` : `rewind:${botId}:all`,
      );
    });

    const remainingLogs = db.all<{ id: number; role: "user" | "assistant"; text_final: string; created_at: string }>(
      "SELECT id, role, text_final, created_at FROM chat_logs WHERE team_id = ? AND bot_id = ? ORDER BY id ASC",
      session.teamId,
      botId,
    );
    const remainingMsgs = remainingLogs.map((row) => ({
      id: row.id,
      role: (row.role === "assistant" ? "bot" : "user") as "user" | "bot",
      text: row.text_final,
      createdAt: row.created_at,
    }));

    if (bus !== undefined) {
      bus.broadcast(session.teamId, bus.frame("chat_sync", { history: { [botId]: remainingMsgs } }));
      bus.broadcast(session.teamId, bus.frame("elo_update", { teamId: session.teamId, elo: after, delta: -1, reason: `rewind:${botId}` }));
      const items = db.all<InventoryDelta>(
        "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
        session.teamId,
      );
      bus.broadcast(session.teamId, bus.frame("inventory_sync", { items }));
    }
    return { ok: true, elo: after, messages: remainingMsgs };
  });

  app.get("/api/admin/board", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const rows = db.all<BoardRow>(
      `SELECT t.name, (SELECT display_name FROM team_members m WHERE m.team_id = t.id ORDER BY rowid ASC LIMIT 1) AS hint, t.elo,
        (SELECT COUNT(*) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified') AS solved,
        (SELECT COUNT(*) FROM elo_log l WHERE l.team_id = t.id AND (l.reason LIKE 'rewind:%' OR l.reason LIKE 'admin_rewind:%')) AS rewinds,
        (SELECT MAX(i.verified_at) FROM team_inventory i WHERE i.team_id = t.id AND i.status = 'verified') AS lastSolve
       FROM teams t ORDER BY t.elo DESC, lastSolve ASC`,
    );
    return { rows };
  });

  app.get("/api/admin/overview", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const teams = db.all<{ id: string; name: string; hint: string; join_code: string | null; elo: number; is_qualified: number; created_at: string }>(
      "SELECT id, name, hint, join_code, elo, is_qualified, created_at FROM teams ORDER BY elo DESC"
    );
    const result = teams.map((team) => {
      const members = db.all<{ display_name: string; role: string; joined_at: string }>(
        "SELECT display_name, role, joined_at FROM team_members WHERE team_id = ? ORDER BY rowid",
        team.id
      );
      const lastMsg = db.get<{ bot_id: string; created_at: string; text_final: string }>(
        "SELECT bot_id, created_at, text_final FROM chat_logs WHERE team_id = ? ORDER BY id DESC LIMIT 1",
        team.id
      );
      const totalMessages = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM chat_logs WHERE team_id = ? AND role = 'user'",
        team.id
      )?.n ?? 0;
      const inventory = db.all<{ bot_id: string; item_key: string; is_real: number; status: string; verified_at: string | null }>(
        "SELECT bot_id, item_key, is_real, status, verified_at FROM team_inventory WHERE team_id = ?",
        team.id
      );
      const solved = inventory.filter((i) => i.status === "verified").length;
      const teamLocks: LockMap = locks?.snapshot(team.id) ?? {};
      return {
        ...team,
        members: members.map((m) => ({
          ...m,
          contribution: totalMessages > 0 ? Math.round(totalMessages / Math.max(1, members.length)) : 0,
          currentActivity: lastMsg ? `Engaged with ${lastMsg.bot_id} (${lastMsg.created_at.slice(11, 19)})` : "Awaiting Deployment",
        })),
        inventory,
        solved,
        locks: teamLocks,
        lastActivity: lastMsg ? lastMsg.created_at : team.created_at,
      };
    });
    return {
      teams: result,
      round2: {
        status: round2Status(db),
        timeLeft: round2TimeLeft(db),
        duration: round2Duration(db),
      },
    };
  });

  app.get("/api/admin/export.json", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return {
      teams: db.all("SELECT id, name, elo, created_at FROM teams"),
      members: db.all("SELECT team_id, display_name, role, joined_at FROM team_members"),
      inventory: db.all("SELECT * FROM team_inventory"),
      elo_log: db.all("SELECT * FROM elo_log"),
    };
  });

  app.get("/api/admin/export.csv", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const query = req.query as { table?: unknown };
    if (typeof query.table !== "string" || !(EXPORT_TABLES as readonly string[]).includes(query.table)) {
      return reply.code(400).send({ error: "table must be elo_log|chat_logs|team_inventory" });
    }
    const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${query.table}`);
    const cols = rows.length > 0 ? Object.keys(rows[0] as object) : [];
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    void reply.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="${query.table}.csv"`);
    return csv;
  });

  app.post("/api/admin/backup", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const dir = join(root, "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = join(dir, `redline-${stamp}.db`);
    await db.backup(dest);
    return { file: dest };
  });

  app.post("/api/admin/qualify-team", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { teamId?: unknown; qualified?: unknown };
    const teamId = typeof body.teamId === "string" ? body.teamId : undefined;
    const qualified = typeof body.qualified === "boolean" ? body.qualified : undefined;
    if (teamId === undefined || qualified === undefined) {
      return reply.code(400).send({ error: "teamId and qualified (boolean) are required" });
    }
    const team = db.get<{ name: string }>("SELECT name FROM teams WHERE id = ?", teamId);
    if (team === undefined) {
      return reply.code(404).send({ error: "team not found" });
    }
    db.run("UPDATE teams SET is_qualified = ? WHERE id = ?", qualified ? 1 : 0, teamId);
    return { ok: true, teamId, qualified };
  });

  // Powerful Admin Tools: ELO Adjuster
  app.post("/api/admin/elo-adjust", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { teamId?: unknown; delta?: unknown; reason?: unknown };
    const teamId = typeof body.teamId === "string" ? body.teamId : undefined;
    const delta = typeof body.delta === "number" ? body.delta : undefined;
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    if (teamId === undefined || delta === undefined || reason === undefined) {
      return reply.code(400).send({ error: "teamId, delta (number), and reason (string) are required" });
    }
    const team = db.get<{ elo: number; name: string }>("SELECT elo, name FROM teams WHERE id = ?", teamId);
    if (team === undefined) {
      return reply.code(404).send({ error: "team not found" });
    }
    const before = team.elo;
    const after = Math.max(0, before + delta);
    db.transaction(() => {
      db.run("UPDATE teams SET elo = ? WHERE id = ?", after, teamId);
      db.run(
        "INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) VALUES (?, ?, ?, ?, ?)",
        teamId,
        delta,
        before,
        after,
        reason.trim() || "admin_manual_adjustment"
      );
    });
    if (bus) {
      bus.broadcast(teamId, bus.frame("elo_update", {
        teamId,
        elo: after,
        delta,
        reason,
      }));
    }
    return { ok: true, teamId, before, after, delta, reason };
  });

  // Powerful Admin Tools: Inventory & Relic Overrider
  app.post("/api/admin/inventory-override", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { teamId?: unknown; botId?: unknown; itemKey?: unknown; status?: unknown };
    const teamId = typeof body.teamId === "string" ? body.teamId : undefined;
    const botId = typeof body.botId === "string" ? body.botId : undefined;
    const status = typeof body.status === "string" ? body.status : undefined;
    if (teamId === undefined || botId === undefined || status === undefined) {
      return reply.code(400).send({ error: "teamId, botId, and status are required" });
    }
    const itemKey = typeof body.itemKey === "string" && body.itemKey !== "" ? body.itemKey : `${botId}_item`;
    const existing = db.get<{ status: string }>(
      "SELECT status FROM team_inventory WHERE team_id = ? AND bot_id = ?",
      teamId,
      botId
    );
    const now = new Date().toISOString();
    db.transaction(() => {
      if (existing) {
        db.run(
          "UPDATE team_inventory SET item_key = ?, status = ?, verified_at = ? WHERE team_id = ? AND bot_id = ?",
          itemKey,
          status,
          status === "verified" ? now : null,
          teamId,
          botId
        );
      } else {
        db.run(
          "INSERT INTO team_inventory (team_id, bot_id, item_key, is_real, status, obtained_at, verified_at, attempt_count) VALUES (?, ?, ?, 1, ?, ?, ?, 1)",
          teamId,
          botId,
          itemKey,
          status,
          now,
          status === "verified" ? now : null
        );
      }
    });
    if (bus) {
      const items = db.all<InventoryDelta>(
        "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
        teamId,
      );
      bus.broadcast(teamId, bus.frame("inventory_sync", { items }));
    }
    return { ok: true, teamId, botId, status };
  });

  // Powerful Admin Tools: Force Rewind Team Context
  app.post("/api/admin/team-rewind", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { teamId?: unknown; botId?: unknown; penalty?: unknown };
    const teamId = typeof body.teamId === "string" ? body.teamId : undefined;
    if (teamId === undefined) {
      return reply.code(400).send({ error: "teamId required" });
    }
    const botId = typeof body.botId === "string" && body.botId !== "" ? body.botId : undefined;
    const team = db.get<{ elo: number }>("SELECT elo FROM teams WHERE id = ?", teamId);
    if (team === undefined) {
      return reply.code(404).send({ error: "team not found" });
    }
    const penalty = typeof body.penalty === "number" ? body.penalty : 0;
    const after = Math.max(0, team.elo - penalty);
    // Capture affected bot IDs before deletion so we can tell the client to clear them
    const affectedBots = botId ? [botId] : db.all<{ bot_id: string }>(
      "SELECT DISTINCT bot_id FROM chat_logs WHERE team_id = ?", teamId,
    ).map((r) => r.bot_id);
    db.transaction(() => {
      if (botId) {
        db.run("DELETE FROM chat_logs WHERE team_id = ? AND bot_id = ?", teamId, botId);
        db.run("DELETE FROM reasoning_traces WHERE team_id = ? AND bot_id = ?", teamId, botId);
        db.run("UPDATE team_inventory SET status = 'locked', verified_at = NULL WHERE team_id = ? AND bot_id = ? AND status IN ('obtained', 'verified')", teamId, botId);
      } else {
        db.run("DELETE FROM chat_logs WHERE team_id = ?", teamId);
        db.run("DELETE FROM reasoning_traces WHERE team_id = ?", teamId);
        db.run("UPDATE team_inventory SET status = 'locked', verified_at = NULL WHERE team_id = ? AND status IN ('obtained', 'verified')", teamId);
      }
      if (penalty > 0) {
        db.run("UPDATE teams SET elo = ? WHERE id = ?", after, teamId);
        db.run(
          "INSERT INTO elo_log (team_id, delta, before_rating, after_rating, reason) VALUES (?, ?, ?, ?, ?)",
          teamId,
          -penalty,
          team.elo,
          after,
          `admin_rewind:${botId ?? "all"}`
        );
      }
    });
    if (bus !== undefined) {
      // Broadcast chat_sync — include empty arrays for rewound bots so client clears them
      const history: Record<string, Array<{ id: number; role: "user" | "bot"; text: string; createdAt: string }>> = {};
      for (const b of affectedBots) { history[b] = []; }
      bus.broadcast(teamId, bus.frame("chat_sync", { history }));
      bus.broadcast(teamId, bus.frame("elo_update", { teamId, elo: after, delta: -penalty, reason: `admin_rewind:${botId ?? "all"}` }));
      const items = db.all<InventoryDelta>(
        "SELECT bot_id AS botId, item_key AS itemKey, status FROM team_inventory WHERE team_id = ?",
        teamId,
      );
      bus.broadcast(teamId, bus.frame("inventory_sync", { items }));
    }
    return { ok: true, teamId, botId, elo: after };
  });

  // Powerful Admin Tools: Live Transcripts & Internal Reasoning Traces Inspector
  app.get("/api/admin/transcripts", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const query = req.query as { teamId?: unknown; botId?: unknown };
    if (typeof query.teamId !== "string") {
      return reply.code(400).send({ error: "teamId required" });
    }
    let messages: Array<{ id: number; bot_id: string; role: string; text_final: string; created_at: string }>;
    let traces: Array<{ id: number; bot_id: string; phase: string; trace_json: string; guard_json: string; created_at: string }>;
    if (typeof query.botId === "string" && query.botId !== "all" && query.botId !== "") {
      messages = db.all(
        "SELECT id, bot_id, role, text_final, created_at FROM chat_logs WHERE team_id = ? AND bot_id = ? ORDER BY id ASC",
        query.teamId,
        query.botId
      );
      traces = db.all(
        "SELECT id, bot_id, phase, trace_json, guard_json, created_at FROM reasoning_traces WHERE team_id = ? AND bot_id = ? ORDER BY id ASC",
        query.teamId,
        query.botId
      );
    } else {
      messages = db.all(
        "SELECT id, bot_id, role, text_final, created_at FROM chat_logs WHERE team_id = ? ORDER BY id ASC",
        query.teamId
      );
      traces = db.all(
        "SELECT id, bot_id, phase, trace_json, guard_json, created_at FROM reasoning_traces WHERE team_id = ? ORDER BY id ASC",
        query.teamId
      );
    }
    return { messages, traces };
  });

  // Powerful Admin Tools: Arena-wide Announcement Broadcast
  app.post("/api/admin/announcement", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { message?: unknown; level?: unknown; sender?: unknown };
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return reply.code(400).send({ error: "message required" });
    }
    const level = body.level === "warning" || body.level === "alert" ? body.level : "info";
    const sender = typeof body.sender === "string" && body.sender.trim() !== "" ? body.sender.trim() : "COMMAND HQ";
    const frameData: AnnouncementData = {
      id: randomUUID(),
      message: body.message.trim(),
      level,
      sender,
      timestamp: new Date().toISOString(),
    };
    announcementsHistory.unshift(frameData);
    if (announcementsHistory.length > 50) {
      announcementsHistory.pop();
    }
    if (bus) {
      bus.broadcastAll(bus.frame("announcement", frameData));
    }
    return { ok: true, announcement: frameData };
  });

  // Powerful Admin Tools: Announcement History
  app.get("/api/admin/announcements", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return { announcements: announcementsHistory };
  });

  // Powerful Admin Tools: Live Activity & Audit Stream
  app.get("/api/admin/activity-stream", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const recentElo = db.all<{ id: number; team_id: string; team_name: string; delta: number; reason: string; created_at: string }>(
      `SELECT l.id, l.team_id, t.name as team_name, l.delta, l.reason, l.created_at
       FROM elo_log l JOIN teams t ON l.team_id = t.id
       ORDER BY l.id DESC LIMIT 25`
    );
    const recentSolves = db.all<{ team_id: string; team_name: string; bot_id: string; item_key: string; verified_at: string }>(
      `SELECT i.team_id, t.name as team_name, i.bot_id, i.item_key, i.verified_at
       FROM team_inventory i JOIN teams t ON i.team_id = t.id
       WHERE i.status = 'verified' AND i.verified_at IS NOT NULL
       ORDER BY i.verified_at DESC LIMIT 25`
    );
    const recentDeterrence = db.all<{ id: number; team_id: string | null; team_name: string | null; kind: string; created_at: string }>(
      `SELECT d.id, d.team_id, t.name as team_name, d.kind, d.created_at
       FROM deterrence_log d LEFT JOIN teams t ON d.team_id = t.id
       ORDER BY d.id DESC LIMIT 20`
    );

    const stream = [
      ...recentElo.map((e) => ({
        id: `elo-${e.id}`,
        type: "elo" as const,
        teamId: e.team_id,
        teamName: e.team_name,
        detail: `${e.delta > 0 ? "+" : ""}${e.delta} ELO (${e.reason})`,
        timestamp: e.created_at,
      })),
      ...recentSolves.map((s, idx) => ({
        id: `solve-${s.team_id}-${s.bot_id}-${idx}`,
        type: "solve" as const,
        teamId: s.team_id,
        teamName: s.team_name,
        detail: `Item appraised & verified: ${s.item_key} (${s.bot_id})`,
        timestamp: s.verified_at,
      })),
      ...recentDeterrence.map((d) => ({
        id: `det-${d.id}`,
        type: "security" as const,
        teamId: d.team_id ?? "unknown",
        teamName: d.team_name ?? "Untracked Client",
        detail: `Anti-tamper violation flagged: ${d.kind}`,
        timestamp: d.created_at,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 40);

    return { stream };
  });

  app.get("/api/admin/audit", async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: "unauthorized" });
    const rows = db.all<{ id: number; action: string; target_id: string | null; reason: string; detail: string; created_at: string }>(
      "SELECT id, action, target_id, reason, detail, created_at FROM admin_audit ORDER BY id DESC LIMIT 250",
    );
    return { entries: rows };
  });

  // Powerful Admin Tools: System Diagnostics & Health Status
  app.get("/api/admin/system-health", async (req, reply) => {
    if (!guard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const teamsCount = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM teams")?.n ?? 0;
    const membersCount = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM team_members")?.n ?? 0;
    const messagesCount = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs")?.n ?? 0;
    const solvesCount = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM team_inventory WHERE status = 'verified'")?.n ?? 0;
    const tokenMetrics = tokenTracker.getMetrics();
    const modelUsageRows = db.all<{ key: string; value: string }>("SELECT key, value FROM game_state WHERE key LIKE 'model_usage:%'");
    const modelsMap: Record<string, { provider: string; model: string; promptTokens: number; completionTokens: number }> = {
      "codex:gpt-5.6-luna": { provider: "codex", model: "gpt-5.6-luna", promptTokens: 0, completionTokens: 0 },
      "groq:qwen/qwen3.8-27b": { provider: "groq", model: "qwen/qwen3.8-27b", promptTokens: 0, completionTokens: 0 },
      "opencode:muse-spark-1.3-contributor-free": { provider: "opencode", model: "muse-spark-1.3-contributor-free", promptTokens: 0, completionTokens: 0 }
    };
    for (const row of modelUsageRows) {
      const parts = row.key.split(":");
      if (parts.length < 4) continue;
      const provider = parts[1]!;
      const model = parts[2]!;
      const type = parts[3]!;
      const modelId = `${provider}:${model}`;
      if (!modelsMap[modelId]) modelsMap[modelId] = { provider, model, promptTokens: 0, completionTokens: 0 };
      if (type === "prompt") modelsMap[modelId]!.promptTokens += parseInt(row.value, 10) || 0;
      if (type === "completion") modelsMap[modelId]!.completionTokens += parseInt(row.value, 10) || 0;
    }
    return {
      uptime: Math.round(process.uptime()),
      activeConnections: bus ? bus.connectionCount() : 0,
      teamsCount,
      membersCount,
      messagesCount,
      solvesCount,
      groqConfigured: Boolean(env.groqApiKey),
      zenConfigured: Boolean(env.zenApiKey),
      nodeVersion: process.version,
      memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      totalTokens: tokenMetrics.totalTokens,
      promptTokens: tokenMetrics.promptTokens,
      completionTokens: tokenMetrics.completionTokens,
      currentTps: tokenMetrics.currentTps,
      peakTps: tokenMetrics.peakTps,
      averageTps: tokenMetrics.averageTps,
      totalLlmRequests: tokenMetrics.totalRequests,
      modelUsage: Object.values(modelsMap),
      ...codexHealthSummary(),
    };
  });

  // Player endpoint: Get recent announcements
  app.get("/api/announcements", async () => {
    return { announcements: announcementsHistory };
  });

  // Verify master Admin Code
  app.post("/api/admin/verify", async (req, reply) => {
    const body = (req.body ?? {}) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : (adminHeader(req) ?? "");
    if (adminOk(code, env.adminCode)) {
      return { ok: true };
    }
    return reply.code(401).send({ ok: false, error: "Invalid Admin Code" });
  });

  // Verify secondary Settings PIN
  app.post("/api/admin/settings/verify", async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    if (adminOk(pin, env.adminSettingsPin)) {
      return { ok: true };
    }
    return reply.code(401).send({ error: "Invalid Settings PIN" });
  });

  // Get dynamic keys list
  app.get("/api/admin/keys", async (req, reply) => {
    if (!guard(req) || !settingsPinGuard(req)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return getKeyList(db);
  });

  // Add key to pool
  app.post("/api/admin/keys", async (req, reply) => {
    if (!guard(req) || !settingsPinGuard(req)) {
      return reply.code(401).send({ error: "unauthorized - settings pin required" });
    }
    const body = (req.body ?? {}) as { provider?: unknown; keyValue?: unknown; label?: unknown };
    const provider = body.provider === "groq" || body.provider === "zen" ? (body.provider as LlmProvider) : undefined;
    const keyValue = typeof body.keyValue === "string" ? body.keyValue.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : undefined;
    if (!provider || keyValue === "") {
      return reply.code(400).send({ error: "provider (groq|zen) and keyValue required" });
    }
    try {
      const created = addApiKey(provider, keyValue, label, db);
      return { ok: true, key: created };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Failed to add key" });
    }
  });

  // Delete key from pool
  app.delete("/api/admin/keys/:id", async (req, reply) => {
    if (!guard(req) || !settingsPinGuard(req)) {
      return reply.code(401).send({ error: "unauthorized - settings pin required" });
    }
    const params = req.params as { id?: string };
    const id = Number(params.id);
    if (isNaN(id)) {
      return reply.code(400).send({ error: "Invalid key id" });
    }
    deleteApiKey(id, db);
    return { ok: true };
  });

  // Toggle key active status
  app.patch("/api/admin/keys/:id/toggle", async (req, reply) => {
    if (!guard(req) || !settingsPinGuard(req)) {
      return reply.code(401).send({ error: "unauthorized - settings pin required" });
    }
    const params = req.params as { id?: string };
    const id = Number(params.id);
    if (isNaN(id)) {
      return reply.code(400).send({ error: "Invalid key id" });
    }
    try {
      const is_active = toggleApiKey(id, db);
      return { ok: true, is_active };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Failed to toggle key" });
    }
  });

  app.get("/api/admin/assessment", async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: "unauthorized" });
    return readAssessmentSettings(db);
  });

  app.post("/api/admin/assessment", async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: "unauthorized" });
    const settings = normalizeAssessmentSettings(req.body);
    db.run(
      "INSERT INTO game_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      "assessment_settings",
      JSON.stringify(settings),
    );
    if (bus !== undefined) {
      bus.broadcastAll(bus.frame("assessment_settings_sync", settings));
    }
    return settings;
  });

  app.post("/api/admin/reset-game", async (req, reply) => {
    if (!guard(req)) return reply.code(401).send({ error: "unauthorized" });
    db.transaction(() => {
      db.run("DELETE FROM team_inventory");
      db.run("DELETE FROM merchant_clues");
      db.run("DELETE FROM elo_log");
      db.run("DELETE FROM chat_logs");
      db.run("DELETE FROM reasoning_traces");
      db.run("DELETE FROM sound_events");
      db.run("DELETE FROM r2_assignments");
      db.run("DELETE FROM r2_scores");
      db.run("DELETE FROM cover_profiles");
      db.run("DELETE FROM game_state");
      db.run("UPDATE teams SET elo = 600, is_qualified = 0, clue_credits = 0");
    });
    if (bus !== undefined) {
      bus.broadcastAll(bus.frame("game_reset", {}));
    }
    return { ok: true };
  });
}

