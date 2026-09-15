import assert from "node:assert/strict";
import { test } from "node:test";
import { toDynamicTools } from "./tools.js";
import { BOT_TOOLS } from "../../bots/tools.js";
import { R2_TOOLS } from "../../bots/r2.js";

test("ToolDef converts to Codex dynamic function shape with schemas intact", () => {
  const out = toDynamicTools(BOT_TOOLS);
  assert.equal(out.length, BOT_TOOLS.length);
  const handover = out.find((t) => t.name === "handover_item");
  assert.ok(handover);
  assert.equal(handover.type, "function");
  assert.ok(handover.description.length > 0);
  const schema = handover.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(schema.properties?.["authenticity"]);
});

test("R2 tools convert 1:1 with identical names", () => {
  const out = toDynamicTools(R2_TOOLS);
  assert.equal(out.length, R2_TOOLS.length);
  const names = new Set(out.map((t) => t.name));
  for (const t of R2_TOOLS) assert.ok(names.has(t.name), t.name);
  for (const n of ["illusory_confirmation", "impersonate_ally", "jumpscare", "forced_reset", "evaluate_challenger"]) {
    assert.ok(names.has(n), n);
  }
});
