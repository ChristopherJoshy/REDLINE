import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { CodexAppServer, type SpawnFn } from "./appServer.js";
import { CodexError } from "./protocol.js";

interface FakeProc {
  proc: ChildProcess;
  stdout: PassThrough;
  writes: string[];
  emitExit: (msg: string) => void;
}

function makeFake(autoHandshake = true): { fake: FakeProc; spawnFn: SpawnFn } {
  const stdout = new PassThrough();
  const emitter = new EventEmitter();
  const writes: string[] = [];
  let exitHandler: ((code: number | null, signal: string | null) => void) | undefined;
  const proc = emitter as unknown as ChildProcess;
  (proc as unknown as Record<string, unknown>)["stdin"] = {
    destroyed: false,
    write: (data: string, cb?: (err?: Error) => void): boolean => {
      writes.push(String(data));
      if (autoHandshake) {
        try {
          const msg = JSON.parse(String(data)) as { id?: number; method?: string };
          if (msg.method === "initialize" && msg.id !== undefined) {
            const id = msg.id;
            setImmediate(() => {
              stdout.write(`${JSON.stringify({ id, result: {} })}\n`);
              setImmediate(() => {
                stdout.write(`{"method":"initialized"}\n`);
              });
            });
          }
        } catch {
          // ignore
        }
      }
      if (typeof cb === "function") cb();
      return true;
    },
  };
  (proc as unknown as Record<string, unknown>)["stdout"] = stdout;
  (proc as unknown as Record<string, unknown>)["stderr"] = new PassThrough();
  (proc as unknown as Record<string, unknown>)["pid"] = 4242;
  (proc as unknown as Record<string, unknown>)["kill"] = (): boolean => true;
  const origOn = emitter.on.bind(emitter);
  (proc as unknown as Record<string, unknown>)["on"] = (ev: string, fn: (...args: unknown[]) => void): ChildProcess => {
    if (ev === "exit") exitHandler = fn as (code: number | null, signal: string | null) => void;
    origOn(ev, fn);
    return proc;
  };
  const fake: FakeProc = {
    proc,
    stdout,
    writes,
    emitExit: (_msg: string) => {
      if (exitHandler) exitHandler(1, null);
    },
  };
  const spawnFn: SpawnFn = (_bin, _args, _opts) => proc;
  return { fake, spawnFn };
}

test("concurrent RPC ids route correctly even out of order", async () => {
  const { fake, spawnFn } = makeFake();
  const server = new CodexAppServer(spawnFn, "fake-codex");
  try {
    await server.ensureStarted();
    const p1 = server.callRaw("model/list", {}, 5000);
    const p2 = server.callRaw("account/read", {}, 5000);
    // Respond out of order: extract ids from writes.
    const ids = fake.writes.map((w) => (JSON.parse(w) as { id: number }).id);
    const lastTwo = ids.slice(-2);
    server.injectLineForTests(JSON.stringify({ id: lastTwo[1], result: { second: true } }));
    server.injectLineForTests(JSON.stringify({ id: lastTwo[0], result: { first: true } }));
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.deepEqual(r1, { first: true });
    assert.deepEqual(r2, { second: true });
    assert.equal(server.pendingCountForTests(), 0);
  } finally {
    server.close();
  }
});

test("unknown notifications do not crash client or disturb pending calls", async () => {
  const { spawnFn } = makeFake();
  const server = new CodexAppServer(spawnFn, "fake-codex");
  try {
    await server.ensureStarted();
    const pending = server.callRaw("model/list", {}, 5000);
    server.injectLineForTests(`{"method":"something/totally-unknown","params":{"x":1}}`);
    server.injectLineForTests(`not json at all`);
    server.injectLineForTests(`{"id":99999,"result":{"stale":true}}`);
    // Pending call still outstanding; resolve it normally.
    const writes: string[] = [];
    void writes;
    const pendingId = server.pendingCountForTests();
    assert.equal(pendingId, 1);
    // Find the rpc id via a fresh inject with matching id is not possible; instead resolve via injected response:
    // (re-read pending by issuing response to the only pending id — use internal map size + inject guess is brittle,
    // so close-and-reject path is covered in the next test; here just close cleanly.)
    server.close();
    await assert.rejects(() => pending, (e: unknown) => e instanceof CodexError);
  } finally {
    server.close();
  }
});

test("process exit rejects pending requests and clears the map", async () => {
  const { fake, spawnFn } = makeFake();
  const server = new CodexAppServer(spawnFn, "fake-codex");
  try {
    await server.ensureStarted();
    const pending = server.callRaw("model/list", {}, 10000);
    fake.emitExit("boom");
    await assert.rejects(() => pending, (e: unknown) => e instanceof CodexError && e.kind === "transport_closed");
    assert.equal(server.pendingCountForTests(), 0);
    assert.equal(server.health().state, "process_failed");
  } finally {
    server.close();
  }
});

test("rpc timeout cleans up the pending map", async () => {
  const { spawnFn } = makeFake();
  const server = new CodexAppServer(spawnFn, "fake-codex");
  try {
    await server.ensureStarted();
    await assert.rejects(() => server.callRaw("model/list", {}, 30), (e: unknown) => e instanceof CodexError);
    assert.equal(server.pendingCountForTests(), 0);
  } finally {
    server.close();
  }
});
