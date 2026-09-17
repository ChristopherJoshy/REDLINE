import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import ChatMessageFrame, { CHAT_FEED } from "@/chat/ChatMessageFrame";
import ChatComposer from "@/chat/ChatComposer";
import type { BotId } from "@contracts/events";
import TypingBubble from "@/chat/TypingBubble";
import ChatMarkdown from "@/chat/ChatMarkdown";
import MatrixText from "@/chat/MatrixText";
import { useBotStream } from "@/chat/useBotStream";
import { unlockAudio } from "@/chat/sound";
import { AVATAR_FOCUS, CHARACTERS, CHAT_BACKGROUND } from "@/data/characterLore";



import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import MerchantCounter from "@/components/MerchantCounter";
import BossCutscene from "@/portal/BossCutscene";
import { useCinematicMotion } from "@/portal/useCinematicMotion";
import { getCover } from "@/api/profiles";
import { submitItem } from "@/api/merchant";
import { apiFetch } from "@/api/client";
import { ArrowDown, CheckCircle2, Shield, ArrowLeft, VenetianMask, RotateCcw } from "lucide-react";
import { DUR } from "@/lib/motionTokens";

interface RoundTwoScreenProps {
  teamId: string;
  displayName: string;
  boss: BotId;
  locked: boolean;
  onRoundEnd?: () => void;
  onBack?: () => void;
}

type Reveal = "arrival" | "open";

export default function RoundTwoScreen({ teamId, displayName, boss, locked, onRoundEnd, onBack }: RoundTwoScreenProps): React.JSX.Element {
  const { bots, send, flash, inventory, hasSyncedInventory, credits, rewind } = useBotStream(teamId, displayName);
  const [reveal, setReveal] = useState<Reveal>(() => {
    try { return localStorage.getItem(`redline:r2-intro:${teamId}:${boss}`) === "1" ? "open" : "arrival"; } catch { return "arrival"; }
  });
  const [draft, setDraft] = useState("");
  const [coverMissing, setCoverMissing] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<BotId>(boss);
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
  const selectedLore = CHARACTERS[selectedBotId];
  const visualLore = chatting ? (merchantView ? CHARACTERS.merchant : lore) : selectedLore;
  const chatBg = CHAT_BACKGROUND[chatting && merchantView ? "merchant" : chatting ? boss : selectedBotId];
  const roster: Array<{ id: BotId; label: string; num: string }> = [
    { id: boss, label: lore?.name ?? boss, num: "01" },
    { id: "merchant", label: "The Merchant", num: "02" },
  ];

  useEffect(() => {
    setSelectedBotId(boss);
  }, [boss]);

  function openBossChat(): void {
    setSelectedBotId(boss);
    setMerchantView(false);
    setChatting(true);
  }

  function openMerchant(): void {
    setSelectedBotId("merchant");
    setMerchantView(true);
    setChatting(true);
  }

  function returnToSelector(): void {
    setMerchantView(false);
    setChatting(false);
  }

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
    const current = inventory.find((i) => i.botId === boss);
    const cur = current?.status ?? "none";
    const had = prevStatus.current;
    prevStatus.current = cur;
    if (had !== null && had !== "verified" && cur === "verified" && current?.obtainedBy === displayName) setCelebration(true);
  }, [inventory, boss, hasSyncedInventory, displayName]);

  // Listen for round2 end event
  useEffect(() => {
    function handleEnd(): void {
      onRoundEnd?.();
    }
    window.addEventListener("arena:round2_end", handleEnd);
    return () => window.removeEventListener("arena:round2_end", handleEnd);
  }, [onRoundEnd]);

  async function offer(): Promise<void> {
    const item = inventory.find((i) => i.botId === boss && i.status === "obtained" && i.obtainedBy === displayName);
    if (item === undefined || offerBusy || !locked) return;
    setOfferBusy(true);
    setOfferError("");
    try {
      const result = await submitItem(item.itemKey);
      if (result.result !== "verified") {
        setOfferError(result.line);
      } else {
        setCelebration(false);
        onRoundEnd?.();
      }
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

  const hasItem = inventory.some((item) => item.botId === boss && item.status === "obtained" && item.obtainedBy === displayName);
  const verified = inventory.some((item) => item.botId === boss && item.status === "verified" && item.obtainedBy === displayName);

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
        const data = (await res.json()) as { phase: "p1" | "p2"; completed?: boolean };
        if (dead) return;
        if (data.completed === true) {
          onRoundEnd?.();
          return;
        }
        if (data.phase === "p1" || data.phase === "p2") {
          if (previousPhase.current === "p1" && data.phase === "p2") setPhaseReveal(true);
          previousPhase.current = data.phase;
        }
      } catch {
        // Keep last phase
      }
    }
    void load();
    // Phase flips are pushed via game_tick (server ticks the exact unlock
    // turn); the 10s timer is only a safety net.
    const timer = window.setInterval(load, 10_000);
    function onTick(): void {
      void load();
    }
    window.addEventListener("arena:game_tick", onTick);
    return () => { dead = true; window.clearInterval(timer); window.removeEventListener("arena:game_tick", onTick); };
  }, [onRoundEnd]);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked || state.typing || state.streaming !== "") return;
    unlockAudio();
    send(boss, text);
    setDraft("");
  }


  return (
    <div
      ref={rootRef}
      data-motion-off={motionOff}
      className="bot-theme relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={
        (chatBg === undefined
          ? { "--accent": visualLore?.accent ?? "var(--color-redline)", "--accent-ink": visualLore?.accentInk ?? "var(--color-text-1)" }
          : { backgroundImage: `url("${chatBg}")`, backgroundSize: "cover", backgroundPosition: "center top", "--accent": visualLore?.accent ?? "var(--color-redline)", "--accent-ink": visualLore?.accentInk ?? "var(--color-text-1)" }) as unknown as React.CSSProperties
      }
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(5,7,10,0.42)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(5,7,10,0.35)] via-transparent to-[rgba(5,7,10,0.6)]" />
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
      {!chatting ? (
        <div className="relative flex-1 flex flex-col justify-between min-h-0 overflow-hidden p-4 sm:p-6 pb-2">
          <div className="relative z-10 flex flex-1 items-start justify-start gap-6 min-h-0">
            <aside
              className="relative max-w-[430px] w-full rounded-[12px] border border-white/10 bg-[rgba(10,14,20,0.55)] backdrop-blur-xl p-5 sm:p-7 flex flex-col gap-6 shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-code)] text-[12px] font-bold tracking-[0.2em] text-white/60">
                  ROUND 02 / VAULT
                </span>
                {onBack && (
                  <button type="button" onClick={onBack} className="min-h-[44px] px-2 text-[12px] font-bold text-white/50 hover:text-white uppercase tracking-widest font-mono">
                    Close
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="font-[family-name:var(--font-display)] text-[34px] font-bold tracking-[0.04em] text-white leading-none uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                  {selectedLore.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedBotId === "merchant" ? (
                    <span className="rounded-[4px] border border-[var(--color-redline-dim)] bg-[var(--color-bg-0)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] text-[var(--color-redline)] uppercase">
                      MERCHANT DESK
                    </span>
                  ) : (
                    <>
                      <span className="rounded-[4px] border border-[var(--color-redline-dim)] bg-[var(--color-bg-0)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] text-[var(--color-redline)] uppercase">
                        ASSIGNED BOSS
                      </span>
                      {verified && <span className="rounded-[4px] border border-[rgba(157,184,122,0.4)] bg-[rgba(157,184,122,0.15)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] text-[#b8d097] uppercase">FILED</span>}
                    </>
                  )}
                </div>
                <p className="text-[14px] font-medium text-[var(--color-text-2)] italic">
                  {selectedLore.tagline}
                </p>
              </div>

              <div className="text-[13px] leading-[1.65] text-white/85 whitespace-pre-wrap">
                {selectedLore.backstory}
              </div>

              <div className="pt-2 border-t border-white/10">
                <p className="font-[family-name:var(--font-code)] text-[10.5px] font-bold tracking-[0.15em] text-[var(--accent)] mb-4 uppercase">
                  {selectedBotId === "merchant" ? "Counter Function" : "Extraction Target"}
                </p>
                <div className="flex items-start gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[8px] border border-[#ff1e2d]/40 bg-black/40 p-2 shadow-[inset_0_0_12px_rgba(255,30,45,0.15)]">
                    <img src={selectedLore.targetItem.asset} alt={selectedLore.targetItem.name} className="h-full w-full object-contain drop-shadow-[0_0_8px_rgba(255,30,45,0.3)]" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <span className="font-semibold text-[14px] text-white leading-tight">{selectedLore.targetItem.name}</span>
                    <p className="text-[12px] leading-relaxed text-white/70">{selectedLore.targetItem.description}</p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={selectedBotId === "merchant" ? openMerchant : openBossChat}
                  disabled={selectedBotId !== "merchant" && verified}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[8px] border border-[var(--accent)]/50 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-white font-bold text-[13.5px] tracking-[0.12em] backdrop-blur-md transition-all cursor-pointer disabled:cursor-default disabled:opacity-50"
                >
                  <span>{selectedBotId === "merchant" ? "OPEN MERCHANT COUNTER" : verified ? "RELIC FILED" : "ENGAGE BOSS"}</span>
                </button>
              </div>
            </aside>
          </div>

          <div className="relative z-10 w-full pt-4 mt-auto">
            <div
              className="flex w-full overflow-x-auto gap-2 sm:gap-3 lg:gap-4 px-4 lg:px-8 pb-2 lg:pb-4 items-center xl:justify-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ maskImage: "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)" }}
            >
              {roster.map((item) => {
                const itemLore = CHARACTERS[item.id];
                const isSelected = item.id === selectedBotId;
                return (
                  <div key={item.id} className="relative flex-1 shrink-0 min-w-[80px] sm:min-w-[95px] lg:min-w-[110px] max-w-[130px] xl:max-w-[145px] pt-5">
                    <button
                      type="button"
                      onClick={() => setSelectedBotId(item.id)}
                      onDoubleClick={() => item.id === "merchant" ? openMerchant() : openBossChat()}
                      aria-current={isSelected ? "true" : undefined}
                      className={`mark-card group relative block h-[130px] w-full -skew-x-[12deg] overflow-hidden cursor-pointer select-none transition-all duration-300 transform outline-none focus-visible:ring-2 focus-visible:ring-white ${
                        isSelected
                          ? "z-10 scale-[1.08] -translate-y-2 border-2 border-[#ff1e2d] shadow-[0_0_15px_rgba(255,30,45,0.6)]"
                          : "border border-white/15 hover:border-white/40 hover:scale-[1.03] hover:-translate-y-1 bg-black/60"
                      }`}
                    >
                      <div className="absolute top-0 bottom-0 skew-x-[12deg] flex flex-col justify-end" style={{ left: "-20px", right: "-20px", width: "calc(100% + 40px)" }}>
                        <img
                          src={itemLore?.heroImage ?? itemLore?.avatar ?? "/characters/wick.jpg"}
                          alt={item.label}
                          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.08] ${isSelected ? "brightness-110" : "brightness-75 group-hover:brightness-100"} ${itemLore ? AVATAR_FOCUS[itemLore.id] : "object-center"}`}
                        />
                        <div className="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-[rgba(5,7,10,0.95)] via-[rgba(5,7,10,0.7)] to-transparent z-10" />
                        <div className="relative z-20 flex flex-col items-center justify-end pb-2 sm:pb-3 px-1 h-full gap-1 sm:gap-1.5">
                          <span className={`absolute top-2 left-3 sm:left-4 font-[family-name:var(--font-code)] text-[9px] font-bold tracking-[0.1em] ${isSelected ? "text-[#ff1e2d]" : "text-white/40"}`}>
                            {item.num}
                          </span>
                          <span className={`font-[family-name:var(--font-display)] text-[10px] sm:text-[11px] font-bold tracking-[0.05em] truncate w-full text-center ${isSelected ? "text-white" : "text-[var(--color-text-2)]"}`}>
                            {item.label.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-y border-white/10 border-t-redline bg-bg-0/95 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={returnToSelector} className="flex min-h-[44px] items-center gap-2 border border-white/15 px-3 font-mono text-xs font-bold uppercase tracking-wider text-text-2 hover:border-redline focus-visible:outline-2 focus-visible:outline-redline">
            <ArrowLeft className="h-4 w-4 text-redline" />
            Selector
          </button>
          <img src={merchantView ? CHARACTERS.merchant?.avatar : lore?.avatar} alt="" className={`h-11 w-11 shrink-0 border border-redline/40 object-cover ${AVATAR_FOCUS[boss]}`} />
          <h2 className="truncate font-mono text-base font-bold uppercase tracking-[0.16em] text-white sm:text-lg">{merchantView ? "Vault merchant" : lore?.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {!merchantView && <RewindButton botId={boss} onRewind={rewind} />}
          {!merchantView && <button type="button" onClick={() => setCoverOpen(true)} className="flex min-h-[44px] items-center gap-2 border border-white/15 px-3 font-mono text-xs font-bold uppercase tracking-wider text-text-2 hover:border-redline focus-visible:outline-2 focus-visible:outline-redline"><VenetianMask className="h-4 w-4 text-redline" />Cover</button>}
        </div>
      </header>

      {phaseReveal && !celebration && <BossCutscene boss={boss} scene="phase" motionOff={motionOff} onDone={() => setPhaseReveal(false)} />}

      {jumpscare && (
        <div className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center ${boss === "itachi" ? "r2-jumpscare-itachi" : "r2-jumpscare-aizen"}`} aria-hidden="true">
          <div className="relative h-full w-full overflow-hidden border-[10px] border-[var(--accent)]">
            <img src={lore?.avatar} alt="" className="h-full w-full scale-110 object-cover object-center contrast-150 saturate-0" />
            <div className="absolute inset-0 bg-[rgba(255,0,15,0.35)] mix-blend-screen" />
            <div className="absolute inset-x-0 bottom-[18%] text-center font-[family-name:var(--font-display)] text-[clamp(28px,8vw,88px)] font-black tracking-[0.14em] text-white drop-shadow-[0_0_24px_rgba(255,0,0,1)]">{boss === "itachi" ? "THE LOOP SEES YOU" : "WATCH CLOSELY"}</div>
          </div>
        </div>
      )}

      {merchantView ? (
        <section data-r2-panel className="flex min-h-0 flex-1 overflow-y-auto items-start justify-center p-4 sm:p-8" aria-label="Vault merchant altar">
          <div className="w-full max-w-[860px]">
            <MerchantCounter inventory={inventory} credits={credits} say={send} displayName={displayName} allowedBotIds={[boss]} onVerified={() => { setCelebration(false); onRoundEnd?.(); }} />
          </div>
        </section>
      ) : (
        <>
      <div ref={feedRef} onScroll={(e) => { const el = e.currentTarget; nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96; if (nearBottomRef.current) setShowLatest(false); }} data-r2-panel className={CHAT_FEED} role="log" aria-label={`${lore?.name} conversation`} aria-live="polite">
        {state.messages.map((message, index) => {
          const isError = message.retryable === true;
          return (
          <ChatMessageFrame key={message.id ?? index} botId={boss} isUser={message.role === "user"} className={message.role === "user" ? "" : "r2-reply-signal"} actions={isError ? (() => {
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
          <ChatMessageFrame botId={boss} className="r2-reply-signal">
            <MatrixText text={state.streaming} isStreaming accentColor={lore?.accent} />
          </ChatMessageFrame>
        )}

      </div>

      {showLatest && <button type="button" onClick={() => { const feed = feedRef.current; if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "auto" }); nearBottomRef.current = true; setShowLatest(false); }} className="absolute bottom-[88px] right-4 z-20 inline-flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[var(--accent)] bg-[rgba(5,7,10,0.95)] px-3 text-xs font-semibold text-white shadow-lg"><ArrowDown className="h-4 w-4" /> Jump to latest</button>}
      {openerError && <div role="alert" className="flex items-center justify-center gap-3 bg-bg-1 px-4 text-sm text-text-2">{openerError}<button type="button" onClick={() => void requestOpener()} className="min-h-[44px] underline">Retry</button></div>}
      {verified && <p className="flex items-center justify-center gap-2 border-t border-moss-border bg-bg-1 p-3 text-xs font-mono"><CheckCircle2 className="h-4 w-4 text-moss" /> RELIC FILED AT THE VAULT ALTAR</p>}
      <ChatComposer draft={draft} onDraft={setDraft} onSubmit={submit} disabled={!locked || state.typing || state.streaming !== ""} name={lore?.name ?? boss} />
      </>
      )}
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
