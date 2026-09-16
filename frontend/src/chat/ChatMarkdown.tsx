import { useMemo } from "react";
import type { ReactNode } from "react";
import { blockMarkdown, inlineMarkdown, type Inline } from "./markdown";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === "text") return node.text;
    if (node.kind === "code") return <code key={index} className="rounded-sm border border-white/10 bg-black/25 px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>;
    if (node.kind === "bold") return <strong key={index} className="font-bold">{renderInline(node.children)}</strong>;
    if (node.kind === "italic") return <em key={index}>{renderInline(node.children)}</em>;
    return <del key={index}>{renderInline(node.children)}</del>;
  });
}

export default function ChatMarkdown({ text, isStreaming = false, className = "" }: {
  text: string;
  isStreaming?: boolean;
  className?: string;
}): React.JSX.Element {
  const blocks = useMemo(() => blockMarkdown(text), [text]);
  return (
    <div aria-busy={isStreaming} className={`space-y-2 whitespace-normal leading-relaxed [overflow-wrap:anywhere] ${className}`}>
      {blocks.map((block, index) => {
        if (block.kind === "code") return <pre key={index} className="max-w-full overflow-x-auto rounded border border-white/15 bg-black/30 p-3 text-xs leading-relaxed"><code>{block.text}</code></pre>;
        if (block.kind === "ul" || block.kind === "ol") {
          const Tag = block.kind;
          return <Tag key={index} className={`space-y-1 pl-5 ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(inlineMarkdown(item))}</li>)}</Tag>;
        }
        if (block.kind === "think") {
          return (
            <div key={index} className="border-l-[3px] border-white/20 bg-black/20 pl-3 pr-2 py-2 my-2 text-[13px] text-white/60 italic rounded-r-md">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-widest text-white/40 mb-1">Deliberation</span>
              <p className="whitespace-pre-wrap">{renderInline(inlineMarkdown(block.text))}</p>
            </div>
          );
        }
        const body = renderInline(inlineMarkdown(block.text));
        if (block.kind === "quote") return <blockquote key={index} className="border-l-2 border-white/30 pl-3 whitespace-pre-wrap opacity-90">{body}</blockquote>;
        return <p key={index} className={`whitespace-pre-wrap ${block.kind === "heading" ? "font-bold" : ""}`}>{body}{isStreaming && index === blocks.length - 1 && <span aria-hidden="true" className="ml-1 inline-block h-3 w-0.5 bg-current opacity-60" />}</p>;
      })}
    </div>
  );
}
