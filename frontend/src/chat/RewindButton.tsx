import { useEffect, useRef, useState } from "react";
import type { BotId } from "@contracts/events";
import { RotateCcw } from "lucide-react";

interface RewindButtonProps {
  botId: BotId;
  onRewind: (botId: BotId, options?: { messageId?: number; turns?: number }) => Promise<{ ok: boolean; error?: string }>;
}

// Player rewind: rolls back turns or wipes conversation server-side for 1 ELO.
export default function RewindButton({ botId, onRewind }: RewindButtonProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "confirm_turn" | "confirm_all" | "busy" | "error">("idle");
  const timer = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  async function executeRewind(options?: { turns?: number }): Promise<void> {
    if (phase === "busy") return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPhase("busy");
    setMenuOpen(false);
    const result = await onRewind(botId, options);
    setPhase(result.ok ? "idle" : "error");
    if (!result.ok) {
      timer.current = window.setTimeout(() => setPhase("idle"), 4000);
    }
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      {phase === "confirm_turn" ? (
        <button
          type="button"
          onClick={() => void executeRewind({ turns: 1 })}
          className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-seal)] animate-pulse"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Confirm: −1 Turn (−1 ELO)</span>
        </button>
      ) : phase === "confirm_all" ? (
        <button
          type="button"
          onClick={() => void executeRewind()}
          className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-seal)] animate-pulse"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Confirm: Wipe All (−1 ELO)</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={phase === "busy"}
          title="Rewind conversation (-1 ELO)"
          className={`flex min-h-[44px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-60 ${
            menuOpen
              ? "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-1)]"
              : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
          }`}
        >
          <RotateCcw className="h-4 w-4" />
          <span>{phase === "busy" ? "Rewinding..." : phase === "error" ? "Rewind Failed" : "Rewind"}</span>
        </button>
      )}

      {menuOpen && phase === "idle" && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-3)]">
            Cost: 1 ELO
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPhase("confirm_turn");
              timer.current = window.setTimeout(() => setPhase("idle"), 5000);
            }}
            className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-2 text-left text-[12px] font-semibold text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] transition"
          >
            <span>Rewind Last Turn</span>
            <span className="text-[10px] text-[var(--color-text-3)] font-mono">1 turn</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPhase("confirm_all");
              timer.current = window.setTimeout(() => setPhase("idle"), 5000);
            }}
            className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-2 text-left text-[12px] font-semibold text-[var(--color-seal)] hover:bg-[var(--color-seal-wash)] transition"
          >
            <span>Rewind Entire Chat</span>
            <span className="text-[10px] opacity-80 font-mono">Full</span>
          </button>
        </div>
      )}
    </div>
  );
}
