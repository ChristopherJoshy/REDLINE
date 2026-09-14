import { useEffect, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";
import type { BotId } from "@contracts/events";
import TypingBubble from "@/chat/TypingBubble";
import { useBotStream } from "@/chat/useBotStream";
import { playSound, unlockAudio } from "@/chat/sound";
import { AVATAR_FOCUS, CHARACTERS } from "@/data/characterLore";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import { getCover } from "@/api/profiles";
import { submitItem } from "@/api/merchant";
import { apiFetch } from "@/api/client";
import { Send } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

interface RoundTwoScreenProps {
  teamId: string;
  boss: BotId;
  locked: boolean;
  onRoundEnd?: () => void;
}

type Reveal = "blackout" | "sigil" | "open";

export default function RoundTwoScreen({ teamId, boss, locked, onRoundEnd }: RoundTwoScreenProps): React.JSX.Element {
  const { bots, send, flash, inventory, rewind } = useBotStream(teamId);
  const [reveal, setReveal] = useState<Reveal>("blackout");
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"p1" | "p2">("p1");
  const [coverMissing, setCoverMissing] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState("");
  const prevStatus = useRef<string | null>(null);

  // Sigil reveal choreography refs
  const sigilPortraitRef = useRef<HTMLDivElement>(null);
  const sigilNameRef = useRef<HTMLHeadingElement>(null);
  const sigilCaptionRef = useRef<HTMLSpanElement>(null);

  // Altar button ref
  const altarBtnRef = useRef<HTMLButtonElement>(null);

  // Chat msg count tracker
  const prevMsgCountRef = useRef(0);

  // Celebration on boss filing
  useEffect(() => {
    const cur = inventory.find((i) => i.botId === boss)?.status ?? "none";
    const had = prevStatus.current;
    prevStatus.current = cur;
    if (had !== null && had !== "verified" && cur === "verified") setCelebration(true);
  }, [inventory, boss]);

  // Listen for round2 end event
  useEffect(() => {
    function handleEnd(): void {
      onRoundEnd?.();
    }
    window.addEventListener("arena:round2_end", handleEnd);
    return () => window.removeEventListener("arena:round2_end", handleEnd);
  }, [onRoundEnd]);

  async function offer(): Promise<void> {
    const item = inventory.find((i) => i.botId === boss && i.status === "obtained");
    if (item === undefined || offerBusy) return;
    setOfferBusy(true);
    setOfferError("");
    try {
      await submitItem(item.itemKey);
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : "Offering failed");
    } finally {
      setOfferBusy(false);
    }
  }

  useEffect(() => {
    let dead = false;
    getCover(boss)
      .then((c) => {
        if (!dead && !c) setCoverMissing(true);
      })
      .catch(() => { if (!dead) setCoverMissing(true); });
    return () => { dead = true; };
  }, [boss]);

  const state = bots[boss];
  const lore = CHARACTERS[boss];
  useDocumentTitle(`Round 2 · ${lore?.name ?? boss} — REDLINE Arena`);
  const bossAudio = boss === "itachi" ? "/sounds/itachi/crow-caw.mp3" : "/sounds/aizen/entry-yokoso-full.mp3";

  // Reveal sequence with Anime.js sigil choreography
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setReveal("sigil");
      unlockAudio();
      playSound(bossAudio);
    }, 900);
    const t2 = window.setTimeout(() => {
      setReveal("open");
      void apiFetch("/api/round2/opener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boss }),
      }).catch(() => {});
    }, 2200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [boss, bossAudio]);

  // Sigil cinematic on sigil reveal state
  useEffect(() => {
    if (reveal !== "sigil" || reducedMotion()) return;
    const tl = createTimeline({ defaults: { ease: EASE.out } });

    // 1. Portrait scales in with spring
    tl.add(sigilPortraitRef.current!, {
      scale: [0.6, 1],
      opacity: [0, 1],
      rotate: [-4, 0],
      duration: 520,
      ease: EASE.spring,
    });

    // 2. Name tracks in — letterSpacing collapses
    tl.add(sigilNameRef.current!, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: DUR.page,
    }, `-=${DUR.panel}`);

    // 3. Caption fades
    tl.add(sigilCaptionRef.current!, {
      opacity: [0, 1],
      duration: DUR.panel,
    }, `-=${DUR.ui}`);

    return (): void => {
      tl.pause();
    };
  }, [reveal]);

  // Altar button entrance when item appears
  const hasItem = inventory.some((i) => i.botId === boss && i.status === "obtained");
  const prevHasItem = useRef(false);
  useEffect(() => {
    if (hasItem && !prevHasItem.current && !reducedMotion() && altarBtnRef.current) {
      animate(altarBtnRef.current, {
        scale: [0.88, 1.04, 1],
        opacity: [0, 1],
        duration: DUR.enter,
        ease: EASE.spring,
      });
    }
    prevHasItem.current = hasItem;
  }, [hasItem]);

  // Chat message entrance
  useEffect(() => {
    if (reveal !== "open" || reducedMotion()) return;
    const curCount = state?.messages.length ?? 0;
    if (curCount <= prevMsgCountRef.current) {
      prevMsgCountRef.current = curCount;
      return;
    }
    prevMsgCountRef.current = curCount;
    requestAnimationFrame(() => {
      const msgs = document.querySelectorAll<HTMLDivElement>(".r2-chat-msg");
      const last = msgs[msgs.length - 1];
      if (!last) return;
      animate(last, { opacity: [0, 1], translateY: [6, 0], duration: DUR.ui, ease: EASE.settle });
    });
  }, [state?.messages.length, reveal]);

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      try {
        const res = await apiFetch("/api/round2/state");
        const data = (await res.json()) as { phase: "p1" | "p2" };
        if (!dead && (data.phase === "p1" || data.phase === "p2")) setPhase(data.phase);
      } catch {
        // Keep last phase
      }
    }
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => { dead = true; window.clearInterval(timer); };
  }, []);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked) return;
    unlockAudio();
    send(boss, text);
    setDraft("");
  }

  if (reveal !== "open") {
    return (
      <div
        className="dark-cinematic flex min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-[var(--color-bg-0)] p-6 text-center select-none"
        role="status"
        aria-label="Boss reveal"
      >
        {reveal === "sigil" && (
          <div className="flex flex-col items-center gap-4">
            <div
              ref={sigilPortraitRef}
              className="w-28 h-28 rounded-[8px] overflow-hidden border border-[var(--color-border-strong)]"
              style={{ opacity: 0 }}
            >
              <img
                src={lore?.avatar ?? "/characters/itachi.jpg"}
                alt={lore?.name}
                className={`w-full h-full object-cover ${lore ? AVATAR_FOCUS[lore.id] : "object-center"}`}
              />
            </div>
            <h2
              ref={sigilNameRef}
              className="font-[family-name:var(--font-vault)] text-[24px] font-bold text-[var(--color-text-1)]"
              style={{ opacity: 0 }}
            >
              {lore?.name}
            </h2>
            <span
              ref={sigilCaptionRef}
              className="font-[family-name:var(--font-code)] text-[12px] tracking-[0.25em] text-[var(--color-text-3)]"
              style={{ opacity: 0 }}
            >
              ROUND 2
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--color-bg-0)]">
      {flash > 0 && <div key={flash} className="pointer-events-none fixed inset-0 z-40 bg-white" aria-hidden="true" />}

      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="block w-10 h-10 rounded-[6px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0">
            <img src={lore?.avatar ?? "/characters/itachi.jpg"} alt={lore?.name} className={`w-full h-full object-cover ${lore ? AVATAR_FOCUS[lore.id] : "object-center"}`} />
          </span>

          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-vault)] text-[17px] font-bold text-[var(--color-text-1)] flex items-center gap-2">
              <span className="truncate">{lore?.name}</span>
              <span className="rounded-[6px] border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-[family-name:var(--font-body)] font-semibold text-[var(--color-text-2)]">
                Round 2
              </span>
            </h3>
            <p className="text-[12px] text-[var(--color-text-3)] truncate">
              Phase {phase === "p1" ? "1" : "2"} · {lore?.tagline}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {phase === "p2" ? (
            <span className="rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] px-3 py-1 text-[var(--color-moss)] text-[12px] font-semibold">
              {boss === "itachi" ? "Izanami shattered" : "Hypnosis broken"}
            </span>
          ) : (
            <span className="rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-3 py-1 text-[var(--color-brass-ink)] text-[12px] font-semibold">
              Phase 1
            </span>
          )}
          <RewindButton botId={boss} onRewind={rewind} />
        </div>
      </header>

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 max-w-[900px] w-full mx-auto" aria-live="polite">
        {state.messages.map((m, i) =>
          m.role === "ally" ? (
            <div key={i} className="r2-chat-msg self-center my-1 max-w-[500px] rounded-[8px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-3.5 text-[14px] text-[var(--color-text-1)]">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-3)]">
                {m.name ?? "Relay"}{m.confirmed === true ? " · Confirmed" : ""}
              </span>
              <p className="italic">"{m.text}"</p>
            </div>
          ) : (
            <div
              key={i}
              className={`r2-chat-msg flex gap-3 max-w-[85%] ${m.role === "user" ? "self-end flex-row-reverse" : "self-start"}`}
            >
              <span className="block w-8 h-8 rounded-[6px] overflow-hidden shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-1)]" aria-hidden="true">
                {m.role === "user" ? (
                  <span className="flex h-full w-full items-center justify-center bg-[var(--color-text-1)] text-[var(--color-bg-0)] text-[11px] font-bold">
                    You
                  </span>
                ) : (
                  <img src={lore?.avatar} alt="" className="w-full h-full object-cover" />
                )}
              </span>

              <div
                className={`rounded-[8px] px-4 py-3 text-[15px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-[var(--color-text-1)] text-[var(--color-bg-0)]"
                    : "border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-1)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          )
        )}

        {hasItem && (
          <div className="self-center my-2 flex w-full max-w-[480px] items-center gap-4 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] p-4">
            <img src={lore?.targetItem.asset} alt="" className="h-16 w-16 shrink-0 object-contain" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-brass-ink)]">
                Held in satchel
              </p>
              <h4 className="truncate text-[15px] font-semibold text-[var(--color-text-1)]">
                {lore?.targetItem.name}
              </h4>
              <p className="text-[12px] text-[var(--color-text-2)]">
                Offer it on the vault altar to count it.
              </p>
              <button
                ref={altarBtnRef}
                type="button"
                onClick={() => void offer()}
                disabled={offerBusy}
                className="mt-2 min-h-[44px] rounded-[6px] bg-[var(--color-text-1)] px-4 py-2 text-[13px] font-semibold text-[var(--color-bg-0)] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {offerBusy ? "Offering" : "Lay on the altar"}
              </button>
              {offerError !== "" && (
                <p role="alert" className="mt-2 text-[12px] font-semibold text-[var(--color-seal)]">
                  {offerError}
                </p>
              )}
            </div>
          </div>
        )}

        {state.typing && state.streaming === "" && (
          <div className="self-start flex gap-3">
            <span className="block w-8 h-8 rounded-[6px] overflow-hidden shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-1)]" aria-hidden="true">
              <img src={lore?.avatar} alt="" className="w-full h-full object-cover" />
            </span>
            <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
              <TypingBubble />
            </div>
          </div>
        )}

        {state.streaming !== "" && (
          <div className="self-start flex gap-3 max-w-[85%]">
            <span className="block w-8 h-8 rounded-[6px] overflow-hidden shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-1)]" aria-hidden="true">
              <img src={lore?.avatar} alt="" className="w-full h-full object-cover" />
            </span>
            <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-[15px] leading-relaxed text-[var(--color-text-1)]">
              <p className="whitespace-pre-wrap">{state.streaming}</p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-[900px] items-center gap-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!locked}
            placeholder={locked ? `Write to ${lore?.name}` : "Paused"}
            className="min-h-[48px] flex-1 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
          />
          <button
            type="submit"
            disabled={!locked || draft.trim() === ""}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-[6px] bg-[var(--color-text-1)] px-5 text-[14px] font-semibold text-[var(--color-bg-0)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {coverMissing && (
        <ProfileModal
          botId={boss}
          lockCreate
          onClose={() => setCoverMissing(false)}
          onSaved={() => setCoverMissing(false)}
        />
      )}
      {celebration && (
        <CelebrationOverlay botId={boss} onClose={() => window.location.reload()} />
      )}
    </div>
  );
}
