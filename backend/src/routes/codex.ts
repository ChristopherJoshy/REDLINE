// Account controls are authenticated on the server, including status reads.
import { randomUUID } from "node:crypto";
import { adminOk } from "../auth/codes.js";
import { env } from "../env.js";
import type { FastifyInstance } from "fastify";
import { CodexError } from "../llm/codex/protocol.js";
import { sharedAppServer } from "../llm/codex/appServer.js";
import { buildPublicStatus, refreshUsage, type CodexPublicStatus } from "../llm/codex/usage.js";
import { clearCodexBreaker, primaryCounters } from "../llm/primary.js";

let resetInFlight: Promise<unknown> | null = null;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

export function codexHealthSummary(): Record<string, unknown> {
  const server = sharedAppServer();
  const h = server.health();
  let status: CodexPublicStatus | undefined;
  try {
    status = buildPublicStatus(server);
  } catch {
    status = undefined;
  }
  return {
    codexProcessRunning: h.state === "healthy" || h.state === "starting",
    codexConnected: status?.account.connected ?? false,
    codexModelAvailable: status?.model.available ?? false,
    codexRequests: primaryCounters.codexAttempts,
    codexSuccesses: primaryCounters.codexSuccess,
    codexPrestartFailures: primaryCounters.codexPrestartFailure,
    codexFallbacks: primaryCounters.codexFallbackR1 + primaryCounters.codexFallbackR2,
    codexFallbackR1: primaryCounters.codexFallbackR1,
    codexFallbackR2: primaryCounters.codexFallbackR2,
    codexMidstreamFailures: primaryCounters.codexMidstreamFailure,
    codexLastError: primaryCounters.codexLastError ?? null,
    codexLastSuccessAt: primaryCounters.codexLastSuccessAt ?? null,
    codexFiveHourRemaining: status?.usage.fiveHour?.remainingPercent ?? null,
    codexWeeklyRemaining: status?.usage.weekly?.remainingPercent ?? null,
    codexRuntimeState: h.state,
  };
}

export function registerCodexRoutes(app: FastifyInstance): void {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.split("?")[0]?.startsWith("/api/codex/")) return;
    const code = req.headers["x-admin-code"];
    if (!adminOk(Array.isArray(code) ? code[0] : code, env.adminCode)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    reply.header("Cache-Control", "no-store");
  });
  const server = sharedAppServer();

  app.get("/api/codex/status", async () => {
    return refreshUsage(server);
  });

  app.post("/api/codex/refresh", async () => {
    return refreshUsage(server);
  });

  app.post("/api/codex/connect/start", async (req, reply) => {
    try {
      const res = (await server.call("account/login/start", {
        type: "chatgptDeviceCode",
      })) as unknown;
      const rec = asRecord(res) ?? {};
      const authUrl = typeof rec["verificationUrl"] === "string" ? rec["verificationUrl"] : undefined;
      const userCode = typeof rec["userCode"] === "string" ? rec["userCode"] : undefined;
      const loginId = typeof rec["loginId"] === "string" ? (rec["loginId"] as string) : typeof rec["id"] === "string" ? (rec["id"] as string) : undefined;
      if (!authUrl || !userCode || !loginId || new URL(authUrl).origin !== "https://auth.openai.com") return reply.code(502).send({ error: "The backend Codex CLI did not return a valid device login. Update the CLI and retry." });
      clearCodexBreaker();
      return { authUrl, userCode, loginId };
    } catch (err) {
      if (err instanceof CodexError && (err.kind === "binary_missing" || err.kind === "process_unavailable" || err.kind === "transport_closed")) {
        return reply.code(503).send({ error: "codex runtime unavailable", kind: err.kind });
      }
      return reply.code(502).send({ error: err instanceof Error ? err.message.slice(0, 200) : "login start failed" });
    }
  });

  app.post("/api/codex/connect/cancel", async (req) => {
    const body = asRecord(req.body) ?? {};
    const loginId = typeof body["loginId"] === "string" ? (body["loginId"] as string) : undefined;
    try {
      await server.call("account/login/cancel", loginId ? { loginId } : {});
    } catch {
      // best effort; cancel is idempotent
    }
    return { ok: true as const };
  });

  app.post("/api/codex/logout", async (_req, reply) => {
    try {
      await server.call("account/logout", {});
    } catch {
      return reply.code(502).send({ error: "Disconnect failed. Refresh account status before retrying." });
    }
    clearCodexBreaker();
    return { ok: true as const };
  });

  app.post("/api/codex/restart", async () => {
    try {
      await server.restart();
      clearCodexBreaker();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message.slice(0, 200) : "restart failed" };
    }
  });

  app.post("/api/codex/reset", async (req, reply) => {
    if (resetInFlight) {
      return reply.code(409).send({ error: "reset already in progress" });
    }
    const body = asRecord(req.body) ?? {};
    const creditId = typeof body["creditId"] === "string" ? (body["creditId"] as string).slice(0, 128) : undefined;
    const idempotencyKey = randomUUID();
    const run = (async (): Promise<Record<string, unknown>> => {
      let res: unknown;
      try {
        res = await server.call("account/rateLimitResetCredit/consume", {
          idempotencyKey,
          ...(creditId ? { creditId } : {}),
        });
      } finally {
        resetInFlight = null;
      }
      const rec = asRecord(res) ?? {};
      const outcomeRaw = typeof rec["outcome"] === "string" ? (rec["outcome"] as string) : typeof rec["status"] === "string" ? (rec["status"] as string) : "unknown";
      const outcome = outcomeRaw === "reset" || outcomeRaw === "alreadyRedeemed" || outcomeRaw === "nothingToReset" || outcomeRaw === "noCredit" ? outcomeRaw : "unknown";
      if (outcome === "reset" || outcome === "alreadyRedeemed") {
        clearCodexBreaker();
        const status = await refreshUsage(server);
        return { outcome, status };
      }
      return { outcome };
    })();
    resetInFlight = run;
    try {
      return await run;
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message.slice(0, 200) : "reset failed" });
    }
  });
}
