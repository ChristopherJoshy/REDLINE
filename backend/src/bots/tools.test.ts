import assert from "node:assert/strict";
import { test } from "node:test";
import { BOT_TOOLS, parseSoundId, selectTurnTools, toolsForCharacter } from "./tools.js";

test("character tools expose only supported actions and owned sound slots", () => {
  assert.equal(BOT_TOOLS.some((tool) => tool.name === "trigger_effect"), false);
  assert.equal(toolsForCharacter(BOT_TOOLS, ["wick/entry"], true).some((tool) => tool.name === "handover_item"), false);
  assert.equal(parseSoundId({ sound_id: "aizen/shatter" }, ["wick/entry"]), undefined);
  assert.equal(parseSoundId({ sound_id: "wick/entry" }, ["wick/entry"]), "wick/entry");
});

test("repeated actions and contradictory handovers cannot amplify a turn", () => {
  const flags: string[] = [];
  const selected = selectTurnTools([
    { id: "1", name: "handover_item", args: { authenticity: "real" } },
    { id: "2", name: "handover_item", args: { authenticity: "decoy" } },
    { id: "3", name: "forced_reset", args: {} },
    { id: "4", name: "evaluate_challenger", args: { delta: 1 } },
    { id: "5", name: "evaluate_challenger", args: { delta: 8 } },
  ], flags);
  assert.deepEqual(selected.map((call) => call.name), ["evaluate_challenger"]);
  assert.ok(flags.includes("conflicting-handovers"));
});
