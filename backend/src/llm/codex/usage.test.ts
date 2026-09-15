import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPublicStatus,
  isCodexLimitExhausted,
  labelWindow,
  mergeRateLimits,
  resetUsageCacheForTests,
  seedUsageCacheForTests,
  toWindow,
} from "./usage.js";
import { CODEX_MODEL } from "./protocol.js";

test("usedPercent 25 => remaining 75; missing windows stay missing", () => {
  resetUsageCacheForTests();
  const win = toWindow({ usedPercent: 25, windowDurationMins: 300, resetsAt: 1789500000 });
  assert.deepEqual(win, { usedPercent: 25, remainingPercent: 75, resetsAt: 1789500000 });
  assert.equal(toWindow({}), undefined);
  assert.equal(toWindow(null), undefined);
  assert.equal(toWindow({ usedPercent: "lots" }), undefined);
});

test("window labels: 300 -> 5-hour, 10080 -> weekly, unknown generic", () => {
  assert.equal(labelWindow(300), "5-hour");
  assert.equal(labelWindow(10080), "weekly");
  assert.equal(labelWindow(999), undefined);
});

test("mergeRateLimits merges present fields, never clears absent nullable ones", () => {
  resetUsageCacheForTests();
  const prev = { primary: { usedPercent: 60 }, planType: "plus" as unknown };
  const merged = mergeRateLimits(prev as Record<string, unknown>, { primary: { usedPercent: 62 } });
  assert.deepEqual((merged["primary"] as { usedPercent: number }).usedPercent, 62);
  assert.equal(merged["planType"], "plus");
  const merged2 = mergeRateLimits(merged, { secondary: null });
  assert.deepEqual(merged2["primary"], { usedPercent: 62 });
});

test("reset availability: count 0 unavailable, >0 available; exhaustion gate", () => {
  resetUsageCacheForTests();
  seedUsageCacheForTests({ rateLimits: { usedPercent: 10 } }, { connected: true });
  assert.equal(isCodexLimitExhausted(), false);
  seedUsageCacheForTests(
    { rateLimits: { usedPercent: 100, resetsAt: Math.floor(Date.now() / 1000) + 3600 }, rateLimitReachedType: "rate_limit_reached" },
    { connected: true },
  );
  assert.equal(isCodexLimitExhausted(), true);
  resetUsageCacheForTests();
});

test("model/list data catalog marks the requested model and reasoning support available", () => {
  resetUsageCacheForTests();
  seedUsageCacheForTests(
    {},
    { connected: true, planType: "plus" },
    [{ id: CODEX_MODEL, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "medium" }] }],
  );
  const status = buildPublicStatus({ health: () => ({ state: "healthy", restartCount: 0 }) } as never);
  assert.equal(status.model.available, true);
  assert.equal(status.model.supportsLow, true);
  assert.equal(status.model.supportsMedium, true);
});
