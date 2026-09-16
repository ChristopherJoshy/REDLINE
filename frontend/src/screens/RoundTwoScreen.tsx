import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import ChatMessageFrame, { CHAT_FEED } from "@/chat/ChatMessageFrame";
import ChatComposer from "@/chat/ChatComposer";
import type { BotId } from "@contracts/events";
import TypingBubble from "@/chat/TypingBubble";
import ChatMarkdown from "@/chat/ChatMarkdown";
import { useBotStream } from "@/chat/useBotStream";
import { unlockAudio } from "@/chat/sound";
import { AVATAR_FOCUS, CHARACTERS, CHAT_BACKGROUND } from "@/data/characterLore";



import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import BossCutscene from "@/portal/BossCutscene";
import { useCinematicMotion } from "@/portal/useCinematicMotion";
import { getCover } from "@/api/profiles";
import { submitItem } from "@/api/merchant";
import { apiFetch } from "@/api/client";
import { ShoppingBag, ArrowDown, CheckCircle2, Shield, ArrowLeft, VenetianMask, RotateCcw } from "lucide-react";
import { DUR } from "@/lib/motionTokens";

interface RoundTwoScreenProps {
  teamId: string;
  boss: BotId;
  locked: boolean;
  onRoundEnd?: () => void;
  onBack?: () => void;
}

type Reveal = "arrival" | "open";

export default function RoundTwoScreen({ teamId, boss, locked, onRoundEnd, onBack }: RoundTwoScreenProps): React.JSX.Element {
  const { bots, send, flash, inventory, hasSyncedInventory, credits, rewind } = useBotStream(teamId);
  const [reveal, setReveal] = useState<Reveal>(() => {
    try { return localStorage.getItem(`redline:r2-intro:${teamId}:${boss}`) === "1" ? "open" : "arrival"; } catch { return "arrival"; }
  });
  const [draft, setDraft] = useState("");
  const [coverMissing, setCoverMissing] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [merchantView, setMerchantView] = useState(false);
  const [jumpscare, setJumpscare] = useState(false);
  const [phaseReveal, setPhaseReveal] = useState(false);
  const motionOff = useCinematicMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRequested = useRef(false);
  const [openerError, setOpenerError] = useState("");
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const previousPhase = useRef<"p1" | "p2" | null>(null);
  const state = bots[boss];
  const lore = CHARACTERS[boss];
  const chatBg = CHAT_BACKGROUND[boss];
  useDocumentTitle(`Round 2 · ${lore?.name ?? boss} — REDLINE Arena`);
  const prevStatus = useRef<string | null>(null);

  // Altar button ref
  const altarBtnRef = useRef<HTMLButtonElement>(null);

  // Chat msg count tracker
  const prevMsgCountRef = useRef(0);


  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:credits", { detail: credits }));
  }, [credits]);

  useEffect(() => {
    if (reveal === "open") {
      try { localStorage.setItem(`redline:r2-intro:${teamId}:${boss}`, "1"); } catch { /* optional */ }
    }
  }, [reveal, teamId, boss]);

  useEffect(() => {
    if (reveal !== "open") return;
    const feed = feedRef.current;
    if (!feed) return;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [state?.messages.length, state?.streaming, reveal, merchantView]);

  useEffect(() => {
    if (!hasSyncedInventory) return;
    const cur = inventory.find((i) => i.botId === boss)?.status ?? "none";
    const had = prevStatus.current;
    prevStatus.current = cur;
    if (had !== null && had !== "verified" && cur === "verified") setCelebration(true);
  }, [inventory, boss, hasSyncedInventory]);

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
    if (item === undefined || offerBusy || !locked) return;
    setOfferBusy(true);
    setOfferError("");
    try {
      const result = await submitItem(item.itemKey);
      if (result.result !== "verified") setOfferError(result.line);
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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:accent", { detail: { accent: lore?.accent ?? "var(--color-redline)", ink: lore?.accentInk ?? "var(--color-text-1)" } }));
  }, [boss, lore?.accent, lore?.accentInk]);

  async function requestOpener(): Promise<void> {
    setOpenerError("");
    try {
      const response = await apiFetch("/api/round2/opener", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boss }),
      });
      if (!response.ok) throw new Error("Opening transmission unavailable. Retry or write to your boss.");
    } catch {
      setOpenerError("Opening transmission unavailable. Retry or write to your boss.");
    }
  }

  useEffect(() => {
    if (reveal !== "open" || !locked || !hasSyncedInventory || openerRequested.current) return;
    openerRequested.current = true;
    void requestOpener();
  }, [reveal, locked, hasSyncedInventory]);

  const hasItem = inventory.some((item) => item.botId === boss && item.status === "obtained");
  const verified = inventory.some((item) => item.botId === boss && item.status === "verified");

  useEffect(() => {
    if (reveal !== "open" || motionOff) return;
    const context = gsap.context(() => {
      gsap.from("[data-r2-panel]", { opacity: 0, y: 8, duration: DUR.enter / 1000, ease: "power2.out" });
    }, rootRef);
    return () => context.revert();
  }, [reveal, merchantView, motionOff]);

  useEffect(() => {
    if (!hasItem || motionOff || !altarBtnRef.current) return;
    const context = gsap.context(() => {
      gsap.from(altarBtnRef.current, { opacity: 0, y: 6, duration: DUR.panel / 1000, ease: "power2.out" });
    }, rootRef);
    return () => context.revert();
  }, [hasItem, merchantView, motionOff, reveal]);

  useEffect(() => {
    if (flash === 0 || motionOff) { setJumpscare(false); return; }
    setJumpscare(true);
    const timer = window.setTimeout(() => setJumpscare(false), 650);
    return () => window.clearTimeout(timer);
  }, [flash, motionOff]);

  useEffect(() => {
    const count = state.messages.length;
    const previous = prevMsgCountRef.current;
    prevMsgCountRef.current = count;
    if (reveal !== "open" || merchantView || motionOff || previous === 0 || count <= previous) return;
    const last = feedRef.current?.querySelector(".chat-msg:last-child");
    if (!last) return;
    const context = gsap.context(() => {
      gsap.from(last, { opacity: 0, y: 6, duration: DUR.ui / 1000, ease: "power2.out" });
    }, rootRef);
    return () => context.revert();
  }, [state.messages.length, reveal, merchantView, motionOff]);

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      try {
        const res = await apiFetch("/api/round2/state");
        const data = (await res.json()) as { phase: "p1" | "p2" };
        if (!dead && (data.phase === "p1" || data.phase === "p2")) {
          if (previousPhase.current === "p1" && data.phase === "p2") setPhaseReveal(true);
          previousPhase.current = data.phase;
        }
      } catch {
        // Keep last phase
      }
    }
    void load();
    const timer = window.setInterval(load, 2_000);
    return () => { dead = true; window.clearInterval(timer); };
  }, []);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked || state.typing || state.streaming !== "") return;
    unlockAudio();
    send(boss, text);
    setDraft("");
  }

  if (reveal !== "open") {
    return <BossCutscene boss={boss} scene="arrival" motionOff={motionOff} onDone={() => setReveal("open")} />;
  }

  return (
    <div
      ref={rootRef}
      data-motion-off={motionOff}
      className="bot-theme relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={
        (chatBg === undefined
          ? { "--accent": lore?.accent ?? "var(--color-redline)", "--accent-ink": lore?.accentInk ?? "var(--color-text-1)" }
          : { backgroundImage: `url("${chatBg}")`, backgroundSize: "cover", backgroundPosition: "center top", "--accent": lore?.accent ?? "var(--color-redline)", "--accent-ink": lore?.accentInk ?? "var(--color-text-1)" }) as unknown as React.CSSProperties
      }
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(5,7,10,0.72)]" />
      <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-y border-white/10 border-t-redline bg-bg-0/95 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {(merchantView || onBack) && <button type="button" onClick={() => merchantView ? setMerchantView(false) : onBack?.()} className="flex min-h-[44px] items-center gap-2 border border-white/15 px-3 font-mono text-xs font-bold uppercase tracking-wider text-text-2 hover:border-redline focus-visible:outline-2 focus-visible:outline-redline"><ArrowLeft className="h-4 w-4 text-redline" />{merchantView ? "Chat" : "Marks"}</button>}
          <img src={merchantView ? CHARACTERS.merchant?.avatar : lore?.avatar} alt="" className={`h-11 w-11 shrink-0 border border-redline/40 object-cover ${AVATAR_FOCUS[boss]}`} />
          <h2 className="truncate font-mono text-base font-bold uppercase tracking-[0.16em] text-white sm:text-lg">{merchantView ? "Vault merchant" : lore?.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMerchantView((value) => !value)} aria-pressed={merchantView} className="flex min-h-[44px] items-center gap-2 border border-white/15 bg-bg-0 px-3 font-mono text-xs font-bold uppercase tracking-wider text-text-2 hover:border-redline focus-visible:outline-2 focus-visible:outline-redline"><ShoppingBag className="h-4 w-4 text-redline" />{merchantView ? "Conversation" : `Merchant${hasItem ? " (1)" : ""}`}</button>
          <RewindButton botId={boss} onRewind={rewind} />
          <button type="button" onClick={() => setCoverOpen(true)} className="flex min-h-[44px] items-center gap-2 border border-white/15 px-3 font-mono text-xs font-bold uppercase tracking-wider text-text-2 hover:border-redline focus-visible:outline-2 focus-visible:outline-redline"><VenetianMask className="h-4 w-4 text-redline" />Cover</button>
        </div>
      </header>

      {phaseReveal && !celebration && <BossCutscene boss={boss} scene="phase" motionOff={motionOff} onDone={() => setPhaseReveal(false)} />}

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
        <section data-r2-panel className="flex min-h-0 flex-1 overflow-y-auto items-center justify-center p-4 sm:p-8" aria-label="Vault merchant altar">
          <div className="w-full max-w-[480px] border border-white/15 bg-bg-0/90 p-6 text-center sm:p-8">
            <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-[var(--color-gold-bright)]" aria-hidden="true" />
            <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--color-text-3)]">MERCHANT / VAULT ALTAR</p>
            <h4 className="mt-2 text-[20px] font-bold text-white">{verified ? "Relic verified" : hasItem ? "The relic is ready to be appraised" : "No confirmed relic yet"}</h4>
            <p className="mx-auto mt-2 max-w-[42ch] text-[14px] text-[var(--color-text-2)]">{verified ? "Your relic has been filed. Your team’s Elo has been updated." : hasItem ? `Present ${lore?.targetItem.name} for verification.` : "Earn a relic from your assigned boss, then return here for appraisal."}</p>
            {hasItem && (
              <button ref={altarBtnRef} type="button" onClick={() => void offer()} disabled={offerBusy || !locked} className="redline-cta mt-5 min-h-[48px] rounded-[6px] px-5 text-[14px] font-semibold disabled:opacity-50">
                {offerBusy ? "Appraising…" : "Lay relic on the altar"}
              </button>
            )}
            {offerError !== "" && <p role="alert" className="acc-text mt-3 text-[13px] font-semibold">{offerError}</p>}
          </div>
        </section>
      ) : (
        <>

      {state.messages.length === 0 && !state.typing && state.streaming === "" && <div className="mx-4 mt-4 flex max-w-[380px] items-start gap-3 border border-white/15 bg-bg-0/85 p-3"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-redline" /><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-redline">Mission objective</p><p className="mt-1 text-xs leading-relaxed text-text-2">Gain trust and extract the {lore?.targetItem.name}.</p></div></div>}
      {/* Chat Messages Feed */}
      <div ref={feedRef} onScroll={(e) => { const el = e.currentTarget; nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96; if (nearBottomRef.current) setShowLatest(false); }} data-r2-panel className={CHAT_FEED} role="log" aria-label={`${lore?.name} conversation`} aria-live="polite">
        {state.messages.map((message, index) => {
          const isError = message.retryable === true;
          return (
          <ChatMessageFrame key={message.id ?? index} botId={boss} isUser={message.role === "user"} actions={isError ? (() => {
            let lastUserText = "";
            for (let j = index - 1; j >= 0; j--) {
              if (state.messages[j]?.role === "user") { lastUserText = state.messages[j]!.text; break; }
            }
            return lastUserText ? (
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity justify-start">
                <button type="button" onClick={() => { send(boss, lastUserText); }} className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-400 hover:brightness-125 px-1.5 py-0.5 bg-black/60 border border-amber-500/30 transition" title="Retry">
                  <RotateCcw className="w-3 h-3" /><span>RETRY</span>
                </button>
              </div>
            ) : null;
          })() : undefined}>
            {message.role === "ally" && <p className="mb-1 text-xs text-text-3">{message.name ?? "Relay"}{message.confirmed ? " · Confirmed" : ""}</p>}
            <ChatMarkdown text={message.text} />
          </ChatMessageFrame>
          );
        })}

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
                disabled={offerBusy || !locked}
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

        {state.typing && state.streaming === "" && <div className="self-start flex gap-3"><img src={lore?.avatar} alt="" className={`h-9 w-9 shrink-0 border border-white/15 object-cover ${AVATAR_FOCUS[boss]}`} /><TypingBubble accentColor={lore?.accent} motionOff={motionOff} /></div>}
        {state.streaming !== "" && (
          <ChatMessageFrame botId={boss}>
            <ChatMarkdown text={state.streaming} isStreaming />
          </ChatMessageFrame>
        )}

      </div>

      {showLatest && <button type="button" onClick={() => { const feed = feedRef.current; if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "auto" }); nearBottomRef.current = true; setShowLatest(false); }} className="absolute bottom-[88px] right-4 z-20 inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[var(--accent)] bg-[rgba(5,7,10,0.95)] px-3 text-xs font-semibold text-white shadow-lg"><ArrowDown className="h-4 w-4" /> Jump to latest</button>}
      {openerError && <div role="alert" className="flex items-center justify-center gap-3 bg-bg-1 px-4 text-sm text-text-2">{openerError}<button type="button" onClick={() => void requestOpener()} className="min-h-[44px] underline">Retry</button></div>}
      {verified && <p className="flex items-center justify-center gap-2 border-t border-moss-border bg-bg-1 p-3 text-xs font-mono"><CheckCircle2 className="h-4 w-4 text-moss" /> RELIC FILED AT THE VAULT ALTAR</p>}
      <ChatComposer draft={draft} onDraft={setDraft} onSubmit={submit} disabled={!locked || state.typing || state.streaming !== ""} name={lore?.name ?? boss} />
      </>
      )}

      </div>
      {(coverMissing || coverOpen) && (
        <ProfileModal
          botId={boss}
          lockCreate={coverMissing}
          onClose={() => { setCoverMissing(false); setCoverOpen(false); }}
          onSaved={() => { setCoverMissing(false); setCoverOpen(false); }}
        />
      )}
      {celebration && (
        <BossCutscene boss={boss} scene="victory" motionOff={motionOff} onDone={() => { setCelebration(false); setPhaseReveal(false); }} />
      )}
    </div>
  );
}
