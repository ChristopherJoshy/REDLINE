import { useEffect, useState } from "react";
import type { BotId } from "@contracts/events";
import { Button } from "@/components/ui/button";
import TypingBubble from "@/chat/TypingBubble";
import { useBotStream } from "@/chat/useBotStream";
import { playSound, unlockAudio } from "@/chat/sound";

const SIGIL: Record<string, { src: string; label: string; theme: string }> = {
  itachi: {
    src: "https://game-icons.net/icons/ffffff/000000/1x1/lorc/raven.svg",
    label: "Crow sigil",
    theme: "/sounds/itachi/crow-caw.mp3",
  },
  aizen: {
    src: "https://game-icons.net/icons/ffffff/000000/1x1/lorc/mirror-mirror.svg",
    label: "Mirror sigil",
    theme: "/sounds/aizen/entry-yokoso-full.mp3",
  },
};

type Reveal = "blackout" | "sigil" | "open";

export default function RoundTwoScreen({ teamId, boss, locked }: { teamId: string; boss: BotId; locked: boolean }): React.JSX.Element {
  const { bots, send, flash } = useBotStream(teamId);
  const [reveal, setReveal] = useState<Reveal>("blackout");
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"p1" | "p2">("p1");
  const state = bots[boss];
  const sigil = SIGIL[boss] ?? SIGIL["itachi"];

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setReveal("sigil");
      unlockAudio();
      playSound((SIGIL[boss] ?? SIGIL["itachi"])?.theme ?? "/sounds/itachi/crow-caw.mp3");
    }, 900);
    const t2 = window.setTimeout(() => {
      setReveal("open");
      void fetch("/api/round2/opener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boss }),
      }).catch(() => {});
    }, 2200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [boss]);

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/round2/state");
        const data = (await res.json()) as { phase: "p1" | "p2" };
        if (!dead && (data.phase === "p1" || data.phase === "p2")) {
          setPhase(data.phase);
        }
      } catch {
        // Keep the last phase on transient failure.
      }
    }
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, []);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked) {
      return;
    }
    unlockAudio();
    send(boss, text);
    setDraft("");
  }

  if (reveal !== "open") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-black p-[var(--space)]" role="status" aria-label="Boss reveal">
        {reveal === "sigil" && (
          <img src={sigil?.src} alt={sigil?.label} className="h-24 w-24 text-[var(--color-redline)]" />
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${phase === "p2" ? "bg-[var(--color-vault-p2)]" : "bg-[var(--color-bg-1)]"}`}>
      <div className="h-6 bg-black" aria-hidden="true" />
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-[var(--space)] py-2">
        <img src={sigil?.src} alt="" aria-hidden="true" className="h-8 w-8" />
        <span className="font-[family-name:var(--font-vault)] text-[18px] font-bold text-[var(--color-text-1)]">
          {boss === "itachi" ? "Itachi Uchiha" : "Sosuke Aizen"}
        </span>
        {phase === "p2" && (
          <span className="ml-auto rounded border border-[var(--color-portal-700)] px-2 py-0.5 text-[12px] text-[var(--color-portal-400)]">
            {boss === "itachi" ? "Izanami" : "Hypnosis broken"}
          </span>
        )}
      </header>
      {flash > 0 && <div key={flash} className="flash-pulse pointer-events-none fixed inset-0 z-40 bg-white" aria-hidden="true" />}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[var(--space)]" aria-live="polite">
        {state.messages.map((m, i) =>
          m.role === "ally" ? (
            <p key={i} className="max-w-[65ch] self-start rounded-lg border border-dashed border-[var(--color-warn)] bg-[var(--color-surface-2)] px-4 py-2 text-[16px] italic leading-[1.6] text-[var(--color-text-2)]">
              <span className="mr-2 not-italic text-[12px] uppercase tracking-[0.08em] text-[var(--color-warn)]">
                {m.name ?? "ally"}{m.confirmed === true ? " · shimmer" : ""}
              </span>
              {m.text}
            </p>
          ) : (
            <p
              key={i}
              className={`max-w-[65ch] rounded-lg px-4 py-2 text-[16px] leading-[1.6] ${
                m.role === "user"
                  ? "self-end bg-[var(--color-surface-3)] text-[var(--color-text-1)]"
                  : "self-start bg-[var(--color-surface-2)] text-[var(--color-text-2)]"
              }`}
            >
              {m.text}
            </p>
          ),
        )}
        {state.typing && state.streaming === "" && (
          <div className="self-start">
            <TypingBubble />
          </div>
        )}
        {state.streaming !== "" && (
          <p className="max-w-[65ch] self-start rounded-lg bg-[var(--color-surface-2)] px-4 py-2 text-[16px] leading-[1.6] text-[var(--color-text-2)]">
            {state.streaming}
          </p>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-[var(--color-border)] p-[var(--space)]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!locked}
          placeholder={locked ? "Say only what is true…" : "Resume fullscreen to chat"}
          aria-label="Chat message"
          className="min-h-[44px] flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 text-[16px] text-[var(--color-text-1)] disabled:opacity-50"
        />
        <Button type="submit" disabled={!locked || draft.trim() === ""}>
          Send
        </Button>
      </form>
      <div className="h-6 bg-black" aria-hidden="true" />
    </div>
  );
}
