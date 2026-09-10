import { useEffect, useRef, useState } from "react";
import type { BotId } from "@contracts/events";
import { RotateCcw } from "lucide-react";

interface RewindButtonProps {
  botId: BotId;
  onRewind: (botId: BotId) => Promise<{ ok: boolean; error?: string }>;
}

// Player rewind: wipes this bot's transcript server-side for 1 ELO.
// Two-tap confirm so the cost is never a misclick.
export default function RewindButton({ botId, onRewind }: RewindButtonProps): React.JSX.Element {
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy" | "error">("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  async function handleClick(): Promise<void> {
    if (phase === "busy") return;
    if (phase === "idle") {
      setPhase("confirm");
      timer.current = window.setTimeout(() => setPhase("idle"), 4000);
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPhase("busy");
    const result = await onRewind(botId);
    setPhase(result.ok ? "idle" : "error");
    if (!result.ok) {
      timer.current = window.setTimeout(() => setPhase("idle"), 4000);
    }
  }

  const label =
    phase === "confirm" ? "Confirm rewind" : phase === "busy" ? "Rewinding" : phase === "error" ? "Retry rewind" : "Rewind";

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={phase === "busy"}
      title="Wipe this conversation and start over (-1 ELO)"
      className={`flex min-h-[44px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60 ${
        phase === "confirm"
          ? "border-[var(--color-seal)] bg-[var(--color-seal-wash)] text-[var(--color-seal)]"
          : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
      }`}
    >
      <RotateCcw className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{phase === "idle" ? "Rewind" : label}</span>
    </button>
  );
}
