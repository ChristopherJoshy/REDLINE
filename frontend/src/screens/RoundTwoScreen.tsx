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

function stripThinking(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import BossCutscene from "@/portal/BossCutscene";
import { getCover } from "@/api/profiles";
import { submitItem } from "@/api/merchant";
import { apiFetch } from "@/api/client";
import { ShoppingBag, Volume2, VolumeX, ArrowDown, CheckCircle2, Shield, Pause, Play } from "lucide-react";
import { DUR, reducedMotion } from "@/lib/motionTokens";

interface RoundTwoScreenProps {
  teamId: string;
  boss: BotId;
  locked: boolean;
  onRoundEnd?: () => void;
}

type Reveal = "arrival" | "open";

function readPref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export default function RoundTwoScreen({ teamId, boss, locked, onRoundEnd }: RoundTwoScreenProps): React.JSX.Element {
  const { bots, send, flash, inventory, hasSyncedInventory, credits, rewind } = useBotStream(teamId);
  const [reveal, setReveal] = useState<Reveal>(() => {
    try { return sessionStorage.getItem(`redline:r2-intro:${teamId}:${boss}`) === "1" ? "open" : "arrival"; } catch { return "arrival"; }
  });
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"p1" | "p2">("p1");
  const [coverMissing, setCoverMissing] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [merchantView, setMerchantView] = useState(false);
  const [jumpscare, setJumpscare] = useState(false);
  const [phaseReveal, setPhaseReveal] = useState(false);
  const [musicMuted, setMusicMuted] = useState(() => readPref("redline_music_muted", "0") === "1");
  const [musicVolume, setMusicVolume] = useState(() => {
    const value = Number(readPref("redline_music_volume", "0.18"));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.18;
  });
  const [motionPaused, setMotionPaused] = useState(() => readPref("redline_r2_motion", "1") === "0");
  const [systemReduced, setSystemReduced] = useState(reducedMotion);
  const motionOff = motionPaused || systemReduced;
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
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("redline_r2_motion", motionPaused ? "0" : "1"); } catch { /* optional preference */ }
  }, [motionPaused]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:credits", { detail: credits }));
  }, [credits]);

  useEffect(() => {
    const audio = new Audio(boss === "itachi" ? "/sounds/round2/long-note-one.mp3" : "/sounds/round2/long-note-three.mp3");
    audio.loop = true;
    musicRef.current = audio;
    audio.volume = musicMuted ? 0 : musicVolume;
    if (reveal === "open" && locked && !musicMuted) void audio.play().catch(() => {});
    return () => { audio.pause(); audio.src = ""; musicRef.current = null; };
  }, [boss]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.volume = musicMuted ? 0 : musicVolume;
    if (reveal === "open" && locked && !musicMuted) void audio.play().catch(() => {});
    else audio.pause();
    try { localStorage.setItem("redline_music_muted", musicMuted ? "1" : "0"); localStorage.setItem("redline_music_volume", String(musicVolume)); } catch { /* preferences are optional */ }
  }, [musicMuted, musicVolume, reveal, locked]);

  useEffect(() => {
    if (reveal === "open") {
      try { sessionStorage.setItem(`redline:r2-intro:${teamId}:${boss}`, "1"); } catch { /* optional */ }
    }
  }, [reveal, teamId, boss]);

  useEffect(() => {
    if (reveal !== "open") return;
    const feed = feedRef.current;
    if (!feed) return;
    if (nearBottomRef.current) feed.scrollTo({ top: feed.scrollHeight, behavior: "auto" });
    else setShowLatest(true);
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
          setPhase(data.phase);
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
      <header className="acc-border flex flex-wrap items-center justify-between gap-2 border-b bg-[rgba(5,7,10,0.85)] px-4 py-3 backdrop-blur-sm">
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
              {lore?.tagline}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {phase === "p2" && (
            <span className="rounded-[6px] border border-moss-border bg-moss-wash px-3 py-1 text-moss text-[12px] font-semibold">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{boss === "itachi" ? "Izanami shattered" : "Hypnosis broken"}
            </span>
          )}
          <RewindButton botId={boss} onRewind={rewind} />
          <button type="button" aria-pressed={motionOff} aria-label={motionOff ? "Enable effects" : "Reduce effects"} disabled={systemReduced} onClick={() => setMotionPaused((value) => !value)} className="flex min-h-[44px] items-center gap-2 border border-white/15 px-3 text-xs text-text-2 disabled:opacity-60">
            {motionOff ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} Effects {motionOff ? "off" : "on"}
          </button>
          <button type="button" onClick={() => setMusicMuted((v) => !v)} aria-label={musicMuted ? "Unmute music" : "Mute music"} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border border-white/15 px-2 text-white/80 hover:border-white/40">
            {musicMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        <label className="flex items-center gap-2 font-mono text-[11px] text-text-3">
          MUSIC <input type="range" aria-label="Music volume" min="0" max="1" step="0.05" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} className="h-11 w-24 accent-redline" />
        </label>
      </header>

      {phaseReveal && !celebration && <BossCutscene boss={boss} scene="phase" motionOff={motionOff} onDone={() => setPhaseReveal(false)} />}

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
        <section data-r2-panel className="flex min-h-0 flex-1 overflow-y-auto items-center justify-center p-4 sm:p-8" aria-label="Vault merchant altar">
          <div className="redline-gold-card w-full max-w-[520px] rounded-[10px] p-5 text-center">
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

      {/* Chat Messages Feed */}
      <div ref={feedRef} onScroll={(e) => { const el = e.currentTarget; nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96; if (nearBottomRef.current) setShowLatest(false); }} data-r2-panel className={CHAT_FEED} role="log" aria-label={`${lore?.name} conversation`} aria-live="polite">
        {state.messages.map((message, index) => (
          <ChatMessageFrame key={message.id ?? index} botId={boss} isUser={message.role === "user"}>
            {message.role === "ally" && <p className="mb-1 text-xs text-text-3">{message.name ?? "Relay"}{message.confirmed ? " · Confirmed" : ""}</p>}
            <ChatMarkdown text={stripThinking(message.text)} useMatrix={false} animateOnMount={false} />
          </ChatMessageFrame>
        ))}

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

        {state.typing && stripThinking(state.streaming) === "" && <TypingBubble accentColor={lore?.accent} />}
        {stripThinking(state.streaming) !== "" && (
          <ChatMessageFrame botId={boss}>
            <ChatMarkdown text={stripThinking(state.streaming)} useMatrix={false} isStreaming />
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
      {coverMissing && (
        <ProfileModal
          botId={boss}
          lockCreate
          onClose={() => setCoverMissing(false)}
          onSaved={() => setCoverMissing(false)}
        />
      )}
      {celebration && (
        <BossCutscene boss={boss} scene="victory" motionOff={motionOff} onDone={() => { setCelebration(false); setPhaseReveal(false); }} />
      )}
    </div>
  );
}
