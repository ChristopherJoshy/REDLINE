import type { StreamYield } from "../llm/groq.js";

const PRIVATE_TAG = /^<\s*(\/?)\s*(think|analysis|reasoning)\b[^>]*>$/i;

// Hold incomplete tags across provider chunks so reasoning never flashes in WS or SSE.
export class DialogueFilter {
  private pending = "";
  private depth = 0;

  push(delta: string): string {
    this.pending += delta;
    let visible = "";
    while (this.pending !== "") {
      const start = this.pending.indexOf("<");
      if (start === -1) {
        if (this.depth === 0) visible += this.pending;
        this.pending = "";
        break;
      }
      if (this.depth === 0) visible += this.pending.slice(0, start);
      this.pending = this.pending.slice(start);
      const end = this.pending.indexOf(">");
      const next = this.pending.indexOf("<", 1);
      if (next !== -1 && (end === -1 || next < end)) {
        if (this.depth === 0) visible += this.pending.slice(0, next);
        this.pending = this.pending.slice(next);
        continue;
      }
      if (end === -1) break;
      const token = this.pending.slice(0, end + 1);
      const match = PRIVATE_TAG.exec(token);
      if (match) {
        if (match[1] === "/") this.depth = Math.max(0, this.depth - 1);
        else this.depth += 1;
      } else if (this.depth === 0) visible += token;
      this.pending = this.pending.slice(end + 1);
    }
    return visible;
  }

  finish(): string {
    // A truncated opening tag must not expose the text that follows it.
    const candidate = this.pending.toLowerCase().replace(/\s/g, "");
    const privatePrefix = ["<think", "<analysis", "<reasoning"].some((tag) => tag.startsWith(candidate) || candidate.startsWith(tag));
    const tail = this.depth === 0 && !privatePrefix ? this.pending : "";
    this.pending = "";
    return tail;
  }
}

export async function* visibleDialogue(stream: AsyncIterable<StreamYield & { reasoning?: string }>): AsyncGenerator<StreamYield & { reasoning?: string }> {
  const filter = new DialogueFilter();
  for await (const item of stream) {
    if (item.kind !== "delta") { yield item; continue; }
    const text = filter.push(item.text);
    if (text !== "") yield { kind: "delta", text };
  }
  const tail = filter.finish();
  if (tail !== "") yield { kind: "delta", text: tail };
}
