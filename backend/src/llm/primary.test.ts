import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { CodexAppServer, type SpawnFn } from "./codex/appServer.js";
import { resetUsageCacheForTests, seedUsageCacheForTests } from "./codex/usage.js";
import { CODEX_MODEL } from "./codex/protocol.js";
import { resetPrimaryForTests, withCodexPrimary } from "./primary.js";
import type { ChatMessage, StreamYield } from "./groq.js";

const MSGS: ChatMessage[] = [{ role: "system", content: "p" }, { role: "user", content: "hi" }];

async function* fakeFallback(calls: { n: number }): AsyncGenerator<StreamYield> {
  calls.n += 1;
  yield { kind: "delta", text: "fallback-text" };
  yield { kind: "done", finish: "stop" };
}

async function collect(gen: AsyncGenerator<StreamYield>): Promise<StreamYield[]> {
  const out: StreamYield[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

test("pre-start Codex failure falls back to existing provider", async () => {
  resetUsageCacheForTests();
  resetPrimaryForTests();
  const spawnFn: SpawnFn = () => {
    throw new Error("spawn ENOENT");
  };
  const server = new CodexAppServer(spawnFn, "fake-codex");
  try {
    const calls = { n: 0 };
    const out = await collect(withCodexPrimary("r1", MSGS, [], undefined, () => fakeFallback(calls), "t", "b", server));
    assert.equal(calls.n, 1);
    assert.deepEqual(out.map((o) => o.kind), ["delta", "done"]);
  } finally {
    server.close();
    resetPrimaryForTests();
    resetUsageCacheForTests();
  }
});

test("midstream Codex failure yields truncated done (no fallback, no duplication)", async () => {
  seedUsageCacheForTests({}, { connected: true }, [{ id: CODEX_MODEL }]);
  resetPrimaryForTests();
  const stdout = new PassThrough();
  const emitter = new EventEmitter();
  const proc = emitter as unknown as ChildProcess;
  let serverRef: CodexAppServer | undefined;
  (proc as unknown as Record<string, unknown>)["stdin"] = {
    destroyed: false,
    write: (data: string, cb?: (err?: Error) => void): boolean => {
      try {
        const msg = JSON.parse(String(data)) as { id?: number; method?: string };
        const respond = (id: number, result: unknown): void => {
          setImmediate(() => stdout.write(`${JSON.stringify({ id, result })}\n`));
        };
        if (msg.method === "initialize" && msg.id !== undefined) respond(msg.id, {});
        else if (msg.method === "thread/start" && msg.id !== undefined) respond(msg.id, { threadId: "t9" });
        else if (msg.method === "thread/inject_items" && msg.id !== undefined) respond(msg.id, {});
        else if (msg.method === "turn/start" && msg.id !== undefined) {
          respond(msg.id, { turn: { id: "turn9" } });
          setImmediate(() => {
            serverRef?.injectLineForTests(
              JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "t9", turnId: "turn9", itemId: "i", delta: "partial " } }),
            );
            setImmediate(() => {
              serverRef?.injectLineForTests(
                JSON.stringify({ method: "turn/completed", params: { threadId: "t9", turn: { id: "turn9", status: "failed", error: null } } }),
              );
            });
          });
        } else if (msg.id !== undefined) respond(msg.id, {});
      } catch {
        // ignore
      }
      if (typeof cb === "function") cb();
      return true;
    },
  };
  (proc as unknown as Record<string, unknown>)["stdout"] = stdout;
  (proc as unknown as Record<string, unknown>)["stderr"] = new PassThrough();
  (proc as unknown as Record<string, unknown>)["pid"] = 4244;
  (proc as unknown as Record<string, unknown>)["kill"] = (): boolean => true;
  const server = new CodexAppServer(() => proc, "fake-codex");
  serverRef = server;
  try {
    const calls = { n: 0 };
    const seen: StreamYield[] = [];
    // No rejection — midstream failure now yields truncated done instead of throwing
    for await (const item of withCodexPrimary("r1", MSGS, [], undefined, () => fakeFallback(calls), "t", "b", server)) {
      seen.push(item);
    }
    assert.equal(calls.n, 0, "fallback must not run after output started");
    assert.ok(seen.some((o) => o.kind === "delta"), "partial output preserved");
    assert.ok(seen.some((o) => o.kind === "done"), "terminal done emitted after midstream failure");
  } finally {
    server.close();
    resetPrimaryForTests();
    resetUsageCacheForTests();
  }
});
