import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CodexError,
  canFallbackBeforeStart,
  classifyRpcError,
  classifyTurnError,
  isTransientOverloaded,
  parseJsonRpcLine,
} from "./protocol.js";

test("parseJsonRpcLine routes responses, server requests, notifications", () => {
  const resp = parseJsonRpcLine(`{"id":1,"result":{"ok":true}}`);
  assert.equal(resp.kind, "response");
  const errResp = parseJsonRpcLine(`{"id":2,"error":{"code":-32602,"message":"bad"}}`);
  assert.equal(errResp.kind, "response");
  const srv = parseJsonRpcLine(`{"id":60,"method":"item/tool/call","params":{"tool":"handover_item"}}`);
  assert.equal(srv.kind, "server_request");
  if (srv.kind === "server_request") assert.equal(srv.method, "item/tool/call");
  const notif = parseJsonRpcLine(`{"method":"turn/completed","params":{"threadId":"t"}}`);
  assert.equal(notif.kind, "notification");
  const bad = parseJsonRpcLine(`not json`);
  assert.equal(bad.kind, "invalid");
});

test("classifyRpcError maps auth/rate/overload/model without fragile prose matching", () => {
  assert.equal(classifyRpcError({ message: "x", data: { kind: "not_authenticated" } }), "not_authenticated");
  assert.equal(classifyRpcError({ message: "Rate limit 429 exceeded" }), "rate_limited");
  assert.equal(classifyRpcError({ message: "server busy, try again", code: 503 }), "overloaded");
  assert.equal(classifyRpcError({ message: "unknown model 'gpt-9'" }), "model_unavailable");
  assert.equal(classifyRpcError({ code: -32602, message: "bad params" }), "protocol_error");
  assert.equal(classifyRpcError({ message: "something weird" }), "unknown");
});

test("fallback eligibility: pre-start errors fall back, midstream ones do not", () => {
  for (const k of ["binary_missing", "process_unavailable", "not_authenticated", "model_unavailable", "rate_limited", "overloaded", "timeout_before_start", "transport_closed", "protocol_error", "turn_failed"] as const) {
    assert.equal(canFallbackBeforeStart(k), true, k);
  }
  for (const k of ["timeout_midstream", "turn_incomplete", "unknown"] as const) {
    assert.equal(canFallbackBeforeStart(k), false, k);
  }
  assert.equal(isTransientOverloaded("overloaded"), true);
  assert.equal(isTransientOverloaded("rate_limited"), false);
});

test("classifyTurnError and CodexError carry kinds", () => {
  assert.equal(classifyTurnError("failed"), "turn_failed");
  assert.equal(classifyTurnError("interrupted"), "turn_incomplete");
  const err = new CodexError("rate_limited", "busy", false);
  assert.equal(err.kind, "rate_limited");
  assert.equal(err.name, "CodexError");
});
