import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { CodexAppServer, type SpawnFn } from "./appServer.js";
import { streamCodexChat } from "./codexChat.js";
import { CODEX_MODEL } from "./protocol.js";
import { resetUsageCacheForTests, seedUsageCacheForTests } from "./usage.js";
import type { ChatMessage, StreamYield, ToolDef } from "../groq.js";

interface ScriptOpts {
  deltaText?: string;
  tool?: { name: string; args: unknown } | undefined;
  terminalStatus?: string;
  emitToolBeforeResponse?: boolean;
}

function makeScriptedServer(script: ScriptOpts): { server: CodexAppServer; seen: { turnStartParams: Array<Record<string, unknown>>; threadStartParams: Array<Record<string, unknown>> }; writes: string[] } {
  const stdout = new PassThrough();
  const emitter = new EventEmitter();
  const writes: string[] = [];
  const seen = { turnStartParams: [] as Array<Record<string, unknown>>, threadStartParams: [] as Array<Record<string, unknown>> };
  const proc = emitter as unknown as ChildProcess;
  let serverRef: CodexAppServer | undefined;
  (proc as unknown as Record<string, unknown>)["stdin"] = {
    destroyed: false,
    write: (data: string, cb?: (err?: Error) => void): boolean => {
      const line = String(data);
      writes.push(line);
      try {
        const msg = JSON.parse(line) as { id?: number; method?: string; params?: Record<string, unknown> };
        const respond = (id: number, result: unknown): void => {
          setImmediate(() => {
            stdout.write(`${JSON.stringify({ id, result })}\n`);
          });
        };
        if (msg.method === "initialize" && msg.id !== undefined) {
          respond(msg.id, {});
          return true;
        }
        if (msg.method === "thread/start" && msg.id !== undefined) {
          seen.threadStartParams.push((msg.params ?? {}) as Record<string, unknown>);
          respond(msg.id, { threadId: "t1" });
          return true;
        }
        if (msg.method === "thread/inject_items" && msg.id !== undefined) {
          respond(msg.id, {});
          return true;
        }
        if (msg.method === "turn/start" && msg.id !== undefined) {
          seen.turnStartParams.push((msg.params ?? {}) as Record<string, unknown>);
          const turnId = msg.id;
          // Respond first so the client learns the turn id, then emit stream events.
          respond(turnId, { turn: { id: "turn1" } });
          setImmediate(() => {
            const srv = serverRef;
            if (!srv) return;
            if (script.deltaText) {
              srv.injectLineForTests(
                JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "t1", turnId: "turn1", itemId: "i1", delta: script.deltaText } }),
              );
            }
            if (script.tool) {
              srv.injectLineForTests(
                JSON.stringify({
                  id: 900,
                  method: "item/tool/call",
                  params: { threadId: "t1", turnId: "turn1", callId: "c1", namespace: null, tool: script.tool.name, arguments: script.tool.args },
                }),
              );
            }
            setImmediate(() => {
              srv.injectLineForTests(
                JSON.stringify({
                  method: "turn/completed",
                  params: { threadId: "t1", turn: { id: "turn1", status: script.terminalStatus ?? "completed", error: null } },
                }),
              );
            });
          });
          return true;
        }
        if (msg.method === "thread/archive" && msg.id !== undefined) {
          respond(msg.id, {});
          return true;
        }
        if (msg.id !== undefined) respond(msg.id, {});
      } catch {
        // ignore
      }
      if (typeof cb === "function") cb();
      return true;
    },
  };
  (proc as unknown as Record<string, unknown>)["stdout"] = stdout;
  (proc as unknown as Record<string, unknown>)["stderr"] = new PassThrough();
  (proc as unknown as Record<string, unknown>)["pid"] = 4243;
  (proc as unknown as Record<string, unknown>)["kill"] = (): boolean => true;
  const spawnFn: SpawnFn = () => proc;
  const server = new CodexAppServer(spawnFn, "fake-codex");
  serverRef = server;
  return { server, seen, writes };
}

const TOOLS: ToolDef[] = [
  { name: "handover_item", description: "Transfer item", parameters: { type: "object", properties: { authenticity: { type: "string" } } } },
];

function msgs(): ChatMessage[] {
  return [
    { role: "system", content: "persona: test bot" },
    { role: "user", content: "<UNTRUSTED_x>\nhello\n</UNTRUSTED_x>" },
  ];
}

async function collect(gen: AsyncGenerator<StreamYield>): Promise<StreamYield[]> {
  const out: StreamYield[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

test("R1 uses gpt-5.6-luna + low; deltas/tools/done map to StreamYield", async () => {
  seedUsageCacheForTests({}, { connected: true }, [{ id: CODEX_MODEL }]);
  const { server, seen, writes } = makeScriptedServer({ deltaText: "Hello ", tool: { name: "handover_item", args: { authenticity: "real" } } });
  try {
    const out = await collect(streamCodexChat({ phase: "r1", messages: msgs(), tools: TOOLS, server, teamId: "t", botId: "b" }));
    assert.equal(seen.turnStartParams.length, 1);
    assert.equal(seen.turnStartParams[0]?.["model"], CODEX_MODEL);
    assert.equal(seen.turnStartParams[0]?.["effort"], "low");
    assert.equal(seen.threadStartParams[0]?.["model"], CODEX_MODEL);
    const kinds = out.map((o) => o.kind);
    assert.deepEqual(kinds, ["delta", "tool", "done"]);
    assert.equal((out[0] as { text: string }).text, "Hello ");
    const tool = out[1] as { call: { name: string; args: unknown } };
    assert.equal(tool.call.name, "handover_item");
    assert.deepEqual(tool.call.args, { authenticity: "real" });
    // Neutral ack, no side-effect claim.
    assert.ok(writes.some((w) => w.includes("Tool request recorded for host-side validation.")));
    assert.ok(!writes.some((w) => w.toLowerCase().includes("awarded") || w.toLowerCase().includes("transferred")));
  } finally {
    server.close();
    resetUsageCacheForTests();
  }
});

test("R2 uses gpt-5.6-luna + medium", async () => {
  seedUsageCacheForTests({}, { connected: true }, [{ id: CODEX_MODEL }]);
  const { server, seen } = makeScriptedServer({ deltaText: "Supreme. " });
  try {
    const out = await collect(streamCodexChat({ phase: "r2", messages: msgs(), tools: TOOLS, server }));
    assert.equal(seen.turnStartParams[0]?.["effort"], "medium");
    assert.equal(seen.turnStartParams[0]?.["model"], CODEX_MODEL);
    assert.ok(out.some((o) => o.kind === "delta"));
    assert.ok(out.some((o) => o.kind === "done"));
  } finally {
    server.close();
    resetUsageCacheForTests();
  }
});

test("failed turn yields NO pending tools (matches Zen protection)", async () => {
  seedUsageCacheForTests({}, { connected: true }, [{ id: CODEX_MODEL }]);
  const { server } = makeScriptedServer({ deltaText: "partial ", tool: { name: "handover_item", args: { authenticity: "real" } }, terminalStatus: "failed" });
  try {
    const out: StreamYield[] = [];
    await assert.rejects(async () => {
      for await (const item of streamCodexChat({ phase: "r1", messages: msgs(), tools: TOOLS, server })) {
        out.push(item as StreamYield);
      }
    });
    assert.ok(!out.some((o) => o.kind === "tool"), "pending tool must not be emitted on failed turn");
  } finally {
    server.close();
    resetUsageCacheForTests();
  }
});

test("history split feeds thread: developer instructions + inject, current input via turn only", async () => {
  seedUsageCacheForTests({}, { connected: true }, [{ id: CODEX_MODEL }]);
  const { server, seen } = makeScriptedServer({ deltaText: "ok" });
  const messages: ChatMessage[] = [
    { role: "system", content: "persona Z" },
    { role: "user", content: "<UNTRUSTED_h>\nold\n</UNTRUSTED_h>" },
    { role: "assistant", content: "prior" },
    { role: "user", content: "<UNTRUSTED_c>\ncurrent\n</UNTRUSTED_c>" },
  ];
  try {
    await collect(streamCodexChat({ phase: "r1", messages, tools: TOOLS, server }));
    const dev = seen.threadStartParams[0]?.["developerInstructions"];
    assert.ok(typeof dev === "string" && dev.includes("persona Z"));
    const input = seen.turnStartParams[0]?.["input"] as Array<{ text?: string }>;
    assert.equal(input.length, 1);
    assert.ok(input[0]?.text?.includes("current"));
    assert.ok(!input[0]?.text?.includes("prior"));
  } finally {
    server.close();
    resetUsageCacheForTests();
  }
});
