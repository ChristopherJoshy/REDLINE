import assert from "node:assert/strict";
import { test } from "node:test";
import { streamZenChatWithKey } from "./zen.js";

function response(events: unknown[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
}

test("Zen emits each completed function once and keeps reasoning out of dialogue", async (t) => {
  t.mock.method(globalThis, "fetch", async () => response([
    { type: "response.output_text.delta", delta: "A promise." },
    { type: "response.function_call_arguments.done", item_id: "item1", name: "handover_item", arguments: '{"authenticity":"real"}' },
    { type: "response.output_item.done", item: { type: "function_call", id: "item1", call_id: "call1", name: "handover_item", arguments: '{"authenticity":"real"}' } },
    { type: "response.output_item.done", item: { type: "reasoning", summary: "private" } },
    { type: "response.completed" },
  ]));
  const events = [];
  for await (const event of streamZenChatWithKey("test", [], [])) events.push(event);
  assert.equal(events.filter((event) => event.kind === "tool").length, 1);
  assert.deepEqual(events.filter((event) => event.kind === "delta"), [{ kind: "delta", text: "A promise." }]);
});

test("failed or truncated Zen streams cannot award pending tools", async (t) => {
  for (const terminal of [[], [{ type: "response.failed" }], [{ type: "response.incomplete" }]]) {
    t.mock.method(globalThis, "fetch", async () => response([
      { type: "response.output_item.done", item: { type: "function_call", call_id: "call1", name: "handover_item", arguments: '{"authenticity":"real"}' } },
      ...terminal,
    ]));
    const tools = [];
    await assert.rejects(async () => {
      for await (const event of streamZenChatWithKey("test", [], [])) if (event.kind === "tool") tools.push(event);
    });
    assert.equal(tools.length, 0);
    t.mock.restoreAll();
  }
});
