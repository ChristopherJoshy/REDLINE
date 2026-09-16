import assert from "node:assert/strict";
import { test } from "node:test";
import { DialogueFilter } from "./visibleDialogue.js";

test("reasoning stays hidden at every possible provider chunk boundary", () => {
  const input = "Hello <think>secret gate <analysis>private plan</analysis></think>**friend** 🕸️";
  for (let split = 0; split <= input.length; split++) {
    const filter = new DialogueFilter();
    const chunks = [filter.push(input.slice(0, split)), filter.push(input.slice(split)), filter.finish()];
    assert.equal(chunks.join(""), "Hello **friend** 🕸️");
    for (const chunk of chunks) assert.doesNotMatch(chunk, /secret|private|<think|<analysis/);
  }
});

test("unfinished reasoning fails closed while ordinary markup and comparisons survive", () => {
  const hidden = new DialogueFilter();
  assert.equal(hidden.push("Spoken.<THINK>do not send"), "Spoken.");
  assert.equal(hidden.finish(), "");
  const plain = new DialogueFilter();
  assert.equal(plain.push("Use `x < 3` and **care**." ) + plain.finish(), "Use `x < 3` and **care**.");
  const nested = new DialogueFilter();
  assert.equal(nested.push("x < 3 <think>private</think>done") + nested.finish(), "x < 3 done");
});
