import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCookies } from "./codes.js";

test("malformed unrelated cookies do not crash session authentication", () => {
  assert.equal(parseCookies("bad=%E0%A4%A; redline_session=valid")["redline_session"], "valid");
  assert.equal(parseCookies("redline_session=%GG")["redline_session"], undefined);
});
