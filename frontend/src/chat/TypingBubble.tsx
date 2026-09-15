import { MessageSquare } from "lucide-react";

export default function TypingBubble({ thinking = true }: {
  thinking?: boolean;
  accentColor?: string;
}): React.JSX.Element {
  return (
    <div role="status" className="flex items-center gap-2 rounded-[8px] border border-border bg-surface-1 px-4 py-3 text-sm text-text-2">
      <MessageSquare className="h-4 w-4 text-brass" aria-hidden="true" />
      <span>{thinking ? "Preparing a reply…" : "Writing…"}</span>
    </div>
  );
}
