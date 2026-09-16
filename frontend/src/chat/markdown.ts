export type Inline = { kind: "text"; text: string } | { kind: "code"; text: string } | { kind: "bold" | "italic" | "strike"; children: Inline[] };
export type Block = { kind: "paragraph" | "quote" | "heading" | "code" | "think"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

// Chat Markdown stays text-only: no HTML execution, remote images, or link navigation.
export function inlineMarkdown(text: string, depth = 0): Inline[] {
  if (depth > 4) return [{ kind: "text", text }];
  const result: Inline[] = [];
  const pattern = /\\([\\`*_~])|`([^`\n]+)`|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^\n]+?)~~|\*([^*\n]+)\*|(?<!\w)_([^_\n]+)_(?!\w)/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > position) result.push({ kind: "text", text: text.slice(position, index) });
    if (match[1] !== undefined) result.push({ kind: "text", text: match[1] });
    else if (match[2] !== undefined) result.push({ kind: "code", text: match[2] });
    else {
      const kind = match[3] !== undefined || match[4] !== undefined ? "bold" : match[5] !== undefined ? "strike" : "italic";
      result.push({ kind, children: inlineMarkdown(match[3] ?? match[4] ?? match[5] ?? match[6] ?? match[7] ?? "", depth + 1) });
    }
    position = index + match[0].length;
  }
  if (position < text.length) result.push({ kind: "text", text: text.slice(position) });
  return result;
}

export function blockMarkdown(text: string): Block[] {
  // Normalize think tags to be on their own lines
  text = text.replace(/<think>/g, "\n<think>\n").replace(/<\/think>/g, "\n</think>\n");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  
  let inThink = false;
  let thinkText: string[] = [];

  while (index < lines.length) {
    const line = lines[index] ?? "";
    
    if (line.trim() === "<think>") {
      inThink = true;
      index++;
      continue;
    }
    if (line.trim() === "</think>") {
      inThink = false;
      if (thinkText.length > 0) {
        blocks.push({ kind: "think", text: thinkText.join("\n").trim() });
        thinkText = [];
      }
      index++;
      continue;
    }
    if (inThink) {
      thinkText.push(line);
      index++;
      continue;
    }

    if (line.trim() === "") { index++; continue; }
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? "")) code.push(lines[index++] ?? "");
      if (index < lines.length) index++;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const list = /^\s*(?:([-+*])|\d+[.)])\s+(.+)$/.exec(line);
    if (list) {
      const kind = list[1] ? "ul" : "ol";
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*(?:([-+*])|\d+[.)])\s+(.+)$/.exec(lines[index] ?? "");
        if (!item || (item[1] ? "ul" : "ol") !== kind) break;
        items.push(item[2] ?? ""); index++;
      }
      blocks.push({ kind, items }); continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) quote.push((lines[index++] ?? "").replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: quote.join("\n") }); continue;
    }
    if (/^#{1,6}\s/.test(line)) { blocks.push({ kind: "heading", text: line.replace(/^#{1,6}\s+/, "") }); index++; continue; }
    const paragraph = [line]; index++;
    while (index < lines.length && (lines[index] ?? "").trim() !== "" && !/^\s*(```|>\s?|#{1,6}\s|[-+*]\s|\d+[.)]\s|<think>|<\/think>)/.test(lines[index] ?? "")) paragraph.push(lines[index++] ?? "");
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  
  if (inThink && thinkText.length > 0) {
    blocks.push({ kind: "think", text: thinkText.join("\n").trim() });
  }
  
  return blocks;
}
