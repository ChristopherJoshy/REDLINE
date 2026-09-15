import { Fragment } from "react";
import MatrixText from "./MatrixText";

type Segment =
  | { kind: "plain"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "break" };

function parseMarkdown(raw: string): Segment[] {
  const segments: Segment[] = [];
  const TOKEN_RE = /(\*\*(.+?)\*\*|\*(.+?)\*|\n)/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "plain", text: raw.slice(lastIndex, match.index) });
    }
    if (match[0] === "\n") {
      segments.push({ kind: "break" });
    } else if (match[2] !== undefined) {
      segments.push({ kind: "bold", text: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ kind: "italic", text: match[3] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) {
    segments.push({ kind: "plain", text: raw.slice(lastIndex) });
  }
  return segments;
}

interface ChatMarkdownProps {
  text: string;
  useMatrix?: boolean;
  isStreaming?: boolean;
  animateOnMount?: boolean;
  accentColor?: string;
  className?: string;
}

export default function ChatMarkdown({
  text,
  useMatrix = false,
  isStreaming = false,
  animateOnMount = false,
  accentColor = "#ff1e2d",
  className = "",
}: ChatMarkdownProps): React.JSX.Element {
  const segments = parseMarkdown(text);

  return (
    <span className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {segments.map((seg, i) => {
        if (seg.kind === "break") {
          return <br key={i} />;
        }
        if (seg.kind === "bold") {
          return useMatrix ? (
            <strong key={i} className="font-bold">
              <MatrixText text={seg.text} isStreaming={isStreaming} animateOnMount={animateOnMount} accentColor={accentColor} />
            </strong>
          ) : (
            <strong key={i} className="font-bold">{seg.text}</strong>
          );
        }
        if (seg.kind === "italic") {
          return useMatrix ? (
            <em key={i} className="not-italic font-medium" style={{ color: `${accentColor}cc`, opacity: 0.88 }}>
              <MatrixText text={seg.text} isStreaming={isStreaming} animateOnMount={animateOnMount} accentColor={accentColor} />
            </em>
          ) : (
            <em key={i} className="not-italic font-medium" style={{ color: `${accentColor}cc`, opacity: 0.88 }}>{seg.text}</em>
          );
        }
        return useMatrix ? (
          <Fragment key={i}>
            <MatrixText text={seg.text} isStreaming={isStreaming} animateOnMount={animateOnMount} accentColor={accentColor} />
          </Fragment>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        );
      })}
    </span>
  );
}
