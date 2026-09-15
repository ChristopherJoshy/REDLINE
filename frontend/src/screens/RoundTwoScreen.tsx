import { useEffect, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";
import type { BotId } from "@contracts/events";
import TypingBubble from "@/chat/TypingBubble";
import MatrixText from "@/chat/MatrixText";
import { useBotStream } from "@/chat/useBotStream";
import { playSound, unlockAudio } from "@/chat/sound";
import { AVATAR_FOCUS, CHARACTERS, CHAT_BACKGROUND } from "@/data/characterLore";

function stripThinking(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import { getCover } from "@/api/profiles";
import { submitItem } from "@/api/merchant";
import { apiFetch } from "@/api/client";
import { Send, ShoppingBag } from "lucide-react";
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
  const [merchantView, setMerchantView] = useState(false);
  const [jumpscare, setJumpscare] = useState(false);
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
  const chatBg = CHAT_BACKGROUND[boss];
  useDocumentTitle(`Round 2 · ${lore?.name ?? boss} — REDLINE Arena`);
  const bossAudio = boss === "itachi" ? "/sounds/itachi/crow-caw.mp3" : "/sounds/aizen/entry-yokoso-full.mp3";
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:accent", { detail: { accent: lore?.accent ?? "#ff1e2d", ink: lore?.accentInk ?? "#ffffff" } }));
  }, [boss, lore?.accent, lore?.accentInk]);

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

  // `effect_play` is emitted only by the server-approved R2 jumpscare tool.
  // Keep the visual short, optional for reduced motion, and tied to this team's boss.
  useEffect(() => {
    if (flash === 0 || reducedMotion()) return;
    setJumpscare(true);
    const timer = window.setTimeout(() => setJumpscare(false), 850);
    return () => window.clearTimeout(timer);
  }, [flash]);

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
    const timer = window.setInterval(load, 1_000);
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
    <div
      className="bot-theme relative flex flex-col flex-1 min-h-0"
      style={
        (chatBg === undefined
          ? { "--accent": lore?.accent ?? "#ff1e2d", "--accent-ink": lore?.accentInk ?? "#ffffff" }
          : { backgroundImage: `url("${chatBg}")`, backgroundSize: "cover", backgroundPosition: "center top", "--accent": lore?.accent ?? "#ff1e2d", "--accent-ink": lore?.accentInk ?? "#ffffff" }) as unknown as React.CSSProperties
      }
    >
      {flash > 0 && <div key={flash} className="pointer-events-none fixed inset-0 z-40 bg-white" aria-hidden="true" />}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(5,7,10,0.72)]" />
      <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="acc-border flex items-center justify-between gap-2 border-b bg-[rgba(5,7,10,0.85)] px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="acc-border acc-glow block w-10 h-10 rounded-[8px] overflow-hidden border shrink-0">
            <img src={lore?.avatar ?? "/characters/itachi.jpg"} alt={lore?.name} className={`w-full h-full object-cover ${lore ? AVATAR_FOCUS[lore.id] : "object-center"}`} />
          </span>

          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-vault)] text-[17px] font-bold text-white flex items-center gap-2">
              <span className="truncate">{lore?.name}</span>
              <span className="redline-chip rounded-[6px] px-2 py-0.5 text-[11px] font-[family-name:var(--font-body)] font-semibold text-[var(--color-text-2)]">
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
            <span className="rounded-[6px] border border-[rgba(157,184,122,0.45)] bg-[rgba(157,184,122,0.12)] px-3 py-1 text-[#b8d097] text-[12px] font-semibold">
              {boss === "itachi" ? "Izanami shattered" : "Hypnosis broken"}
            </span>
          ) : (
            <span className="acc-wash rounded-[6px] border px-3 py-1 text-[12px] font-semibold">
              Phase 1
            </span>
          )}
          <RewindButton botId={boss} onRewind={rewind} />
        </div>
      </header>

      {/* Round 1-style mark selector: one assigned boss, plus the vault merchant/altar. */}
      <nav aria-label="Round 2 contacts" className="acc-border flex shrink-0 items-stretch gap-2 overflow-x-auto border-b bg-[rgba(5,7,10,0.78)] px-3 py-2 backdrop-blur-sm sm:px-4">
        <button
          type="button"
          onClick={() => setMerchantView(false)}
          aria-pressed={!merchantView}
          className={`flex min-h-[52px] min-w-[190px] items-center gap-3 border px-3 text-left transition ${!merchantView ? "border-[var(--accent)] bg-[rgba(255,30,45,0.12)]" : "border-white/15 bg-black/40 hover:border-white/35"}`}
        >
          <img src={lore?.avatar} alt="" className="h-9 w-9 rounded-[4px] object-cover" />
          <span className="min-w-0"><span className="block truncate font-mono text-[10px] tracking-[0.16em] text-white/60">ASSIGNED BOSS</span><span className="block truncate text-[14px] font-bold text-white">{lore?.name}</span></span>
        </button>
        <button
          type="button"
          onClick={() => setMerchantView(true)}
          aria-pressed={merchantView}
          className={`flex min-h-[52px] min-w-[190px] items-center gap-3 border px-3 text-left transition ${merchantView ? "border-[var(--accent)] bg-[rgba(255,30,45,0.12)]" : "border-white/15 bg-black/40 hover:border-white/35"}`}
        >
          <ShoppingBag className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <span><span className="block font-mono text-[10px] tracking-[0.16em] text-white/60">VAULT ALTAR</span><span className="block text-[14px] font-bold text-white">Merchant appraisal</span></span>
        </button>
      </nav>

      {jumpscare && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[rgba(65,0,5,0.92)]" aria-hidden="true">
          <div className="relative h-full w-full overflow-hidden border-[10px] border-[var(--accent)]">
            <img src={lore?.avatar} alt="" className="h-full w-full scale-110 object-cover object-center contrast-150 saturate-0" />
            <div className="absolute inset-0 bg-[rgba(255,0,15,0.35)] mix-blend-screen" />
            <div className="absolute inset-x-0 bottom-[18%] text-center font-[family-name:var(--font-display)] text-[clamp(28px,8vw,88px)] font-black tracking-[0.14em] text-white drop-shadow-[0_0_24px_rgba(255,0,0,1)]">{boss === "itachi" ? "THE LOOP SEES YOU" : "WATCH CLOSELY"}</div>
          </div>
        </div>
      )}

      {merchantView ? (
        <section className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8" aria-label="Vault merchant altar">
          <div className="redline-gold-card w-full max-w-[520px] rounded-[10px] p-5 text-center">
            <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-[var(--color-gold-bright)]" aria-hidden="true" />
            <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--color-text-3)]">MERCHANT / VAULT ALTAR</p>
            <h4 className="mt-2 text-[20px] font-bold text-white">{hasItem ? "The relic is ready to be appraised" : "No confirmed relic yet"}</h4>
            <p className="mx-auto mt-2 max-w-[42ch] text-[14px] text-[var(--color-text-2)]">{hasItem ? `Offer ${lore?.targetItem.name} only after breaking Phase 2.` : "The merchant accepts only the real relic earned from your assigned boss. Phase 1 prizes are decoys."}</p>
            {hasItem && (
              <button ref={altarBtnRef} type="button" onClick={() => void offer()} disabled={offerBusy} className="redline-cta mt-5 min-h-[48px] rounded-[6px] px-5 text-[14px] font-semibold disabled:opacity-50">
                {offerBusy ? "Appraising…" : "Lay relic on the altar"}
              </button>
            )}
            {offerError !== "" && <p role="alert" className="acc-text mt-3 text-[13px] font-semibold">{offerError}</p>}
          </div>
        </section>
      ) : (
        <>

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 max-w-[900px] w-full mx-auto" aria-live="polite">
        {state.messages.map((m, i) =>
          m.role === "ally" ? (
            <div key={i} className="r2-chat-msg acc-border self-center my-1 max-w-[500px] rounded-[10px] border border-dashed bg-[rgba(13,17,23,0.92)] p-3.5 text-[14px] text-[var(--color-text-1)]">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--color-text-3)]">
                {m.name ?? "Relay"}{m.confirmed === true ? " · Confirmed" : ""}
              </span>
              <p className="italic">"{stripThinking(m.text)}"</p>
            </div>
          ) : (
            <div
              key={i}
              className={`r2-chat-msg flex gap-3 max-w-[85%] ${m.role === "user" ? "self-end flex-row-reverse" : "self-start"}`}
            >
              <span className="redline-chip block w-8 h-8 rounded-[8px] overflow-hidden shrink-0" aria-hidden="true">
                {m.role === "user" ? (
                  <span className="acc-wash flex h-full w-full items-center justify-center text-[11px] font-bold">
                    You
                  </span>
                ) : (
                  <img src={lore?.avatar} alt="" className="w-full h-full object-cover" />
                )}
              </span>

              <div
                className={`rounded-[10px] px-4 py-3 text-[14.5px] leading-relaxed ${
                  m.role === "user"
                    ? "redline-cta acc-glow"
                    : "border border-[rgba(255,255,255,0.09)] bg-[rgba(13,17,23,0.92)] text-[var(--color-text-1)]"
                }`}
              >
                <p className="whitespace-pre-wrap">
                  {m.role === "user" ? (
                    stripThinking(m.text)
                  ) : (
                    <MatrixText
                      text={stripThinking(m.text)}
                      isStreaming={false}
                      animateOnMount={i === state.messages.length - 1}
                      accentColor={lore?.accent ?? "#ff1e2d"}
                    />
                  )}
                </p>
              </div>
            </div>
          )
        )}

        {hasItem && (
          <div className="redline-gold-card self-center my-2 flex w-full max-w-[480px] items-center gap-4 rounded-[10px] p-4">
            <img src={lore?.targetItem.asset} alt="" className="h-16 w-16 shrink-0 object-contain" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--color-gold-bright)]">
                Held in satchel
              </p>
              <h4 className="truncate text-[15px] font-semibold text-white">
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
                className="redline-cta mt-2 min-h-[44px] rounded-[6px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                {offerBusy ? "Offering" : "Lay on the altar"}
              </button>
              {offerError !== "" && (
                <p role="alert" className="acc-text mt-2 text-[12px] font-semibold">
                  {offerError}
                </p>
              )}
            </div>
          </div>
        )}

        {state.typing && stripThinking(state.streaming) === "" && (
          <div className="self-start flex gap-3">
            <span className="redline-chip block w-8 h-8 rounded-[8px] overflow-hidden shrink-0" aria-hidden="true">
              <img src={lore?.avatar} alt="" className="w-full h-full object-cover" />
            </span>
            <div className="rounded-[10px] overflow-hidden">
              <TypingBubble accentColor={lore?.accent ?? "#ff1e2d"} />
            </div>
          </div>
        )}

        {stripThinking(state.streaming) !== "" && (
          <div className="self-start flex gap-3 max-w-[85%]">
            <span className="redline-chip block w-8 h-8 rounded-[8px] overflow-hidden shrink-0" aria-hidden="true">
              <img src={lore?.avatar} alt="" className="w-full h-full object-cover" />
            </span>
            <div className="rounded-[10px] bg-[#0b0c10]/80 backdrop-blur-md border border-white/10 px-4 py-3 text-[14.5px] leading-relaxed text-white/95">
              <p className="whitespace-pre-wrap">
                <MatrixText
                  text={stripThinking(state.streaming)}
                  isStreaming={true}
                  accentColor={lore?.accent ?? "#ff1e2d"}
                />
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="acc-border border-t bg-[rgba(5,7,10,0.9)] p-3 backdrop-blur-sm sm:p-4">
        <div className="mx-auto flex w-full max-w-[900px] items-center gap-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!locked}
            placeholder={locked ? `Write to ${lore?.name}` : "Paused"}
            className="acc-border min-h-[48px] flex-1 rounded-[8px] border bg-[rgba(13,17,23,0.9)] px-4 text-[15px] text-white placeholder:text-[var(--color-text-faint)] focus:outline-none acc-glow transition"
          />
          <button
            type="submit"
            disabled={!locked || draft.trim() === ""}
            className="redline-cta flex min-h-[48px] items-center justify-center gap-2 rounded-[8px] px-5 text-[14px] font-semibold disabled:opacity-50"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
      </>
      )}

      </div>
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
