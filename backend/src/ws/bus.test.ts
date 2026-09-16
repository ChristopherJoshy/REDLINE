import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebSocket } from "ws";
import type { ServerEvent } from "../contracts/events.js";
import { Bus } from "./bus.js";

function fakeSocket(): WebSocket & { closed: Array<{ code: number; reason: string }>; sent: ServerEvent[] } {
  const sock = {
    readyState: 1,
    closed: [] as Array<{ code: number; reason: string }>,
    sent: [] as ServerEvent[],
    close(code: number, reason: string): void {
      sock.closed.push({ code, reason });
    },
    send(data: string): void {
      sock.sent.push(JSON.parse(data) as ServerEvent);
    },
    on(): void {},
  };
  return sock as unknown as WebSocket & { closed: Array<{ code: number; reason: string }>; sent: ServerEvent[] };
}

test("tick() broadcasts a game_tick frame to every socket", () => {
  const bus = new Bus();
  const a = fakeSocket();
  const b = fakeSocket();
  bus.add(a, "team-a");
  bus.add(b, "ADMIN");
  bus.tick("board");
  for (const sock of [a, b]) {
    assert.equal(sock.sent.length, 1);
    assert.equal(sock.sent[0]?.event, "game_tick");
    assert.deepEqual((sock.sent[0] as { data: unknown }).data, { scope: "board" });
  }
});

test("kickMember closes only that member's sockets and reports the count", () => {
  const bus = new Bus();
  const kai1 = fakeSocket();
  const kai2 = fakeSocket();
  const rey = fakeSocket();
  bus.add(kai1, "t1");
  bus.add(kai2, "t1");
  bus.add(rey, "t1");
  bus.setMember(kai1, "Kai", "online", false);
  bus.setMember(kai2, "Kai", "online", false);
  bus.setMember(rey, "Rey", "online", false);
  assert.deepEqual(bus.liveMembers(), [
    { teamId: "t1", displayName: "Kai" },
    { teamId: "t1", displayName: "Kai" },
    { teamId: "t1", displayName: "Rey" },
  ]);
  assert.equal(bus.kickMember("t1", "Kai", 4008, "admin_logout"), 2);
  assert.deepEqual(kai1.closed, [{ code: 4008, reason: "admin_logout" }]);
  assert.deepEqual(kai2.closed, [{ code: 4008, reason: "admin_logout" }]);
  assert.deepEqual(rey.closed, []);
  assert.deepEqual(bus.liveMembers(), [{ teamId: "t1", displayName: "Rey" }]);
});

test("sendMember keeps private frames out of another teammate's socket", () => {
  const bus = new Bus();
  const kai = fakeSocket();
  const rey = fakeSocket();
  bus.add(kai, "t1");
  bus.add(rey, "t1");
  bus.setMember(kai, "Kai", "online", false);
  bus.setMember(rey, "Rey", "online", false);
  kai.sent.length = 0;
  rey.sent.length = 0;
  bus.sendMember("t1", "Kai", bus.frame("bot_token", { botId: "itachi", delta: "private" }));
  assert.equal(kai.sent.length, 1);
  assert.equal(rey.sent.length, 0);
});
