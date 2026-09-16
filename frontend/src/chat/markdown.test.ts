import assert from "node:assert/strict";
import { test } from "node:test";

const { inlineMarkdown, blockMarkdown } = await import(new URL("./markdown.ts", import.meta.url).href);

test("chat Markdown preserves emoji, escaped punctuation, and unfinished streaming text", () => {
  assert.deepEqual(inlineMarkdown("**Care** 🐦‍⬛ *matters*"), [
    { kind: "bold", children: [{ kind: "text", text: "Care" }] },
    { kind: "text", text: " 🐦‍⬛ " },
    { kind: "italic", children: [{ kind: "text", text: "matters" }] },
  ]);
  assert.deepEqual(inlineMarkdown("**unfinished"), [{ kind: "text", text: "**unfinished" }]);
  assert.deepEqual(inlineMarkdown("`**literal**`"), [{ kind: "code", text: "**literal**" }]);
  assert.deepEqual(inlineMarkdown("\\*literal"), [{ kind: "text", text: "*" }, { kind: "text", text: "literal" }]);
});

test("lists, quotations and code blocks retain their structure without executing HTML", () => {
  assert.deepEqual(blockMarkdown("- One\n- Two\n\n> Remember\n\n```ts\n<script>alert(1)</script>\n```"), [
    { kind: "ul", items: ["One", "Two"] },
    { kind: "quote", text: "Remember" },
    { kind: "code", text: "<script>alert(1)</script>" },
  ]);
  assert.deepEqual(inlineMarkdown("<img src=x onerror=alert(1)>"), [{ kind: "text", text: "<img src=x onerror=alert(1)>" }]);
});
