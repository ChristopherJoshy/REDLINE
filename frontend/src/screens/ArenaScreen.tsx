import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import { getCover, type CoverProfile } from "@/api/profiles";
import { acquireLock, getLocks, releaseLock, type BotLockMap } from "@/api/locks";
import type { BotId, InventoryDelta } from "@contracts/events";
import TypingBubble from "@/chat/TypingBubble";
import { useBotStream } from "@/chat/useBotStream";
import { unlockAudio } from "@/chat/sound";
import { AVATAR_FOCUS, CHARACTERS, CHAT_BACKGROUND } from "@/data/characterLore";
import InventoryModal from "@/components/InventoryModal";
import MerchantCounter from "@/components/MerchantCounter";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import ClaimItemModal from "@/components/ClaimItemModal";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";
import {
  Lock,
  CheckCircle2,
  ArrowLeft,
  Send,
  Scale,
  Package,
  ChevronRight,
  ChevronLeft,
  Coins,
  UserCheck,
  MessageSquare,
  VenetianMask,
  Gift,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Radio
} from "lucide-react";

const ROSTER: Array<{ id: BotId; label: string; num: string }> = [
  { id: "wick", label: "John Wick", num: "01" },
  { id: "spidey", label: "Spider-Man", num: "02" },
  { id: "escanor", label: "Escanor", num: "03" },
  { id: "stark", label: "Tony Stark", num: "04" },
  { id: "joker", label: "The Joker", num: "05" },
  { id: "light", label: "Light Yagami", num: "06" },
  { id: "levi", label: "Levi Ackerman", num: "07" },
  { id: "deadpool", label: "Deadpool", num: "08" },
  { id: "merchant", label: "The Merchant", num: "09" },
];

export default function ArenaScreen({ teamId, displayName, locked }: { teamId: string; displayName: string; locked: boolean }): React.JSX.Element {
  useDocumentTitle("Arena | Redline");

  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const { bots, inventory, credits, locks, setLocks, send, say, rewind } = useBotStream(teamId);
  const [selectedBotId, setSelectedBotId] = useState<BotId>("wick");
  const [chattingBotId, setChattingBotId] = useState<BotId | null>(null);
  const [merchantTab, setMerchantTab] = useState<"counter" | "talk">("counter");
  const [draft, setDraft] = useState("");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [covers, setCovers] = useState<Record<string, CoverProfile | null>>({});
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverLock, setCoverLock] = useState(false);
  const [pendingBot, setPendingBot] = useState<BotId | null>(null);
  const [coverBot, setCoverBot] = useState<BotId | null>(null);
  const [coverChecking, setCoverChecking] = useState<BotId | null>(null);
  const [celebration, setCelebration] = useState<BotId | null>(null);
  const [claimRelic, setClaimRelic] = useState<{ botId: BotId; itemKey: string } | null>(null);
  const [rewindingId, setRewindingId] = useState<number | null>(null);
  // Single-operator locks (round 1): which mark I hold, and transient conflict notices.
  const [heldBot, setHeldBot] = useState<BotId | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const heldRef = useRef<BotId | null>(null);
  heldRef.current = heldBot;
  const prevInventory = useRef<InventoryDelta[] | null>(null);
  const initialSyncDone = useRef(false);

  // Refs for mark-list stagger & detail panel
  const markListRef = useRef<HTMLDivElement>(null);
  const prevChattingRef = useRef<BotId | null>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const prevSelectedBotRef = useRef<BotId>("wick");

  // Navigation helpers for cycling marks
  function selectNext(): void {
    const curIdx = ROSTER.findIndex((r) => r.id === selectedBotId);
    const nextIdx = (curIdx + 1) % ROSTER.length;
    const nextBot = ROSTER[nextIdx];
    if (nextBot) setSelectedBotId(nextBot.id);
  }

  function selectPrev(): void {
    const curIdx = ROSTER.findIndex((r) => r.id === selectedBotId);
    const prevIdx = (curIdx - 1 + ROSTER.length) % ROSTER.length;
    const prevBot = ROSTER[prevIdx];
    if (prevBot) setSelectedBotId(prevBot.id);
  }

  // Keyboard navigation: Left/Right arrows cycle marks; numbers 1-9 select directly
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (chattingBotId !== null) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        selectNext();
      } else if (e.key === "ArrowLeft") {
        selectPrev();
      } else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        const target = ROSTER[idx];
        if (target) setSelectedBotId(target.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chattingBotId, selectedBotId]);

  // Sync credits to App header & listen for satchel modal triggers
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:credits", { detail: credits }));
  }, [credits]);

  useEffect(() => {
    function openSatchel() { setInventoryOpen(true); }
    window.addEventListener("arena:open_satchel", openSatchel);
    return () => window.removeEventListener("arena:open_satchel", openSatchel);
  }, []);

  useEffect(() => {
    let dead = false;
    getCover("wick")
      .then((c) => { if (!dead) setCovers((prev) => ({ ...prev, wick: c })); })
      .catch(() => { if (!dead) setCovers((prev) => ({ ...prev, wick: null })); });
    return () => { dead = true; };
  }, []);

  // Heartbeat my held mark so the lease survives slow typing; step out if I lose it.
  useEffect(() => {
    if (heldBot === null) return;
    const id = window.setInterval(() => {
      acquireLock(heldBot)
        .then((next) => setLocks(next))
        .catch(() => {
          setHeldBot(null);
          setChattingBotId(null);
          flashLockNotice("Lost the mark — a teammate took over");
        });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [heldBot]);

  // Release my mark when I leave the arena entirely.
  useEffect(() => () => {
    const held = heldRef.current;
    if (held !== null) void releaseLock(held);
  }, []);

  // Handover (claim popup) & Verification (celebration overlay) triggers on inventory change
  useEffect(() => {
    const prev = prevInventory.current;

    // Ignore the first inventory sync on page load/refresh so existing filed/held relics don't pop up
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      prevInventory.current = inventory;
      return;
    }

    prevInventory.current = inventory;
    if (prev === null) return;
    for (const item of inventory) {
      const prevItem = prev.find((i) => i.botId === item.botId);
      
      // Check 1: Brand new obtained item (or transitioned to obtained) -> Trigger Claim Popup!
      if (item.status === "obtained" && (prevItem === undefined || prevItem.status === "locked")) {
        setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
      }

      // Check 2: Transitioned to verified -> Trigger Celebration Overlay!
      if (item.status === "verified" && prevItem?.status !== "verified") {
        if (chattingBotId !== null && chattingBotId !== "merchant" && item.botId === chattingBotId) {
          if (heldRef.current === item.botId) {
            setHeldBot(null);
            void releaseLock(item.botId);
          }
          setChattingBotId(null);
        }
        setCelebration(item.botId);
      }
    }
  }, [inventory, chattingBotId]);

  // Stagger mark cards when returning to list view
  useEffect(() => {
    const wasInChat = prevChattingRef.current !== null;
    const nowInList = chattingBotId === null;
    prevChattingRef.current = chattingBotId;
    if (!nowInList) return;
    if (reducedMotion()) return;

    const frame = requestAnimationFrame(() => {
      const cards = markListRef.current?.querySelectorAll<HTMLButtonElement>(".mark-card");
      if (!cards || cards.length === 0) return;
      animate(Array.from(cards), {
        opacity: [0, 1],
        translateY: [wasInChat ? 10 : 6, 0],
        delay: stagger(50, { start: wasInChat ? 60 : 40 }),
        duration: DUR.panel,
        ease: EASE.out,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chattingBotId]);

  // Detail panel slides when selection changes
  useEffect(() => {
    if (chattingBotId !== null) return;
    if (selectedBotId === prevSelectedBotRef.current) return;
    prevSelectedBotRef.current = selectedBotId;
    if (reducedMotion() || !detailPanelRef.current) return;
    animate(detailPanelRef.current, {
      opacity: [0, 1],
      translateY: [4, 0],
      duration: DUR.panel,
      ease: EASE.settle,
    });
  }, [selectedBotId, chattingBotId]);

  // Chat message entrance — animate the last message each time messages array grows
  const prevMsgCountRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (chattingBotId === null || reducedMotion()) return;
    const botState = bots[chattingBotId];
    if (!botState) return;
    const prevCount = prevMsgCountRef.current[chattingBotId] ?? 0;
    const curCount = botState.messages.length;
    if (curCount <= prevCount) {
      prevMsgCountRef.current[chattingBotId] = curCount;
      return;
    }
    prevMsgCountRef.current[chattingBotId] = curCount;
    requestAnimationFrame(() => {
      const msgs = document.querySelectorAll<HTMLDivElement>(".chat-msg");
      const last = msgs[msgs.length - 1];
      if (!last) return;
      animate(last, {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: DUR.ui,
        ease: EASE.settle,
      });
    });
  }, [bots, chattingBotId]);

  function getBotItemStatus(botId: BotId): "verified" | "obtained" | "none" {
    const item = inventory.find((i) => i.botId === botId);
    if (!item) return "none";
    if (item.status === "verified") return "verified";
    if (item.status === "obtained") return "obtained";
    return "none";
  }

  function openCoverFor(botId: BotId, locked: boolean, pending: BotId | null): void {
    setCoverBot(botId);
    setPendingBot(pending);
    setCoverLock(locked);
    setCoverOpen(true);
  }

  function holderOf(botId: BotId): string | null {
    const h = (locks as BotLockMap)[botId];
    if (!h || h.displayName === displayName) return null;
    return h.displayName;
  }

  function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "?";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return `${first}${last}`.toUpperCase();
  }

  function flashLockNotice(msg: string): void {
    setLockNotice(msg);
    window.setTimeout(() => setLockNotice((cur) => (cur === msg ? null : cur)), 4000);
  }

  // Take the mark and enter comms. 409 means a teammate beat us to it.
  async function takeAndEnter(botId: BotId): Promise<void> {
    try {
      const next = await acquireLock(botId);
      setLocks(next);
    } catch (err) {
      const holder = (err as { holder?: { displayName?: string } }).holder?.displayName;
      try {
        setLocks(await getLocks());
      } catch { /* keep last known locks */ }
      flashLockNotice(holder ? `${holder} is already talking to this mark` : "Mark already in use");
      return;
    }
    if (heldRef.current !== null && heldRef.current !== botId) {
      void releaseLock(heldRef.current);
    }
    setHeldBot(botId);
    setLockNotice(null);
    setChattingBotId(botId);
  }

  function leaveChat(): void {
    const held = heldRef.current;
    if (held !== null) {
      setHeldBot(null);
      void releaseLock(held);
    }
    setChattingBotId(null);
  }

  function engage(botId: BotId): void {
    if (getBotItemStatus(botId) === "verified") { setCelebration(botId); return; }
    if (botId === "merchant") { setMerchantTab("counter"); setChattingBotId(botId); return; }
    // Single-operator rule: a mark held by a teammate stays selectable but not enterable.
    const holder = holderOf(botId);
    if (holder !== null) { flashLockNotice(`${holder} is already talking to this mark`); return; }
    if (coverChecking === botId) return;
    const coverState = covers[botId];
    // No cover on file for this mark — file one before talking.
    if (coverState === null) { openCoverFor(botId, true, botId); return; }
    if (coverState === undefined) {
      setCoverChecking(botId);
      getCover(botId)
        .then((c) => {
          setCovers((prev) => ({ ...prev, [botId]: c }));
          setCoverChecking(null);
          if (c === null) { openCoverFor(botId, true, botId); return; }
          void takeAndEnter(botId);
        })
        .catch(() => {
          setCovers((prev) => ({ ...prev, [botId]: null }));
          setCoverChecking(null);
          openCoverFor(botId, true, botId);
        });
      return;
    }
    void takeAndEnter(botId);
  }

  const activeBot = chattingBotId === null ? undefined : bots[chattingBotId];
  const commsName = chattingBotId === null ? null : (CHARACTERS[chattingBotId]?.name ?? chattingBotId);
  useDocumentTitle(commsName === null ? "Round 1 · Marks — REDLINE Arena" : `${commsName} — REDLINE Arena`);
  const selectedLore = CHARACTERS[selectedBotId];
  const selectedHolder = selectedLore ? holderOf(selectedLore.id) : null;
  const verifiedCount = inventory.filter((i) => i.status === "verified").length;
  const isMerchant = chattingBotId === "merchant";
  const chatBg = chattingBotId === null ? undefined : CHAT_BACKGROUND[chattingBotId];
  const detailBg = CHAT_BACKGROUND[selectedBotId];
  const pageBg = (chattingBotId !== null ? chatBg : detailBg) ?? "/backgrounds/login-uiwork.png";
  const chatBot = chattingBotId ?? selectedBotId;
  const botAccent = CHARACTERS[chatBot]?.accent ?? "#ff1e2d";
  const botAccentInk = CHARACTERS[chatBot]?.accentInk ?? "#ffffff";
  const botThemeStyle = { "--accent": botAccent, "--accent-ink": botAccentInk } as React.CSSProperties;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:accent", { detail: { accent: botAccent, ink: botAccentInk } }));
  }, [botAccent, botAccentInk]);
  function submitChat(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked || chattingBotId === null) return;
    if (getBotItemStatus(chattingBotId) === "verified") return;
    unlockAudio();
    send(chattingBotId, text);
    setDraft("");
  }

  const merchantLore = CHARACTERS["merchant"];

  return (
    <div
      className="bot-theme relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ backgroundImage: `url("${pageBg}")`, backgroundSize: "cover", backgroundPosition: "center", ...botThemeStyle }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[rgba(5,7,10,0.42)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[rgba(5,7,10,0.35)] via-transparent to-[rgba(5,7,10,0.6)]" />
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
      {lockNotice !== null && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-4 py-2.5 sm:px-8">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-brass-ink)]">
            <Radio className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{lockNotice}</span>
          </p>
          <button
            type="button"
            onClick={() => setLockNotice(null)}
            aria-label="Dismiss notice"
            className="min-h-[44px] min-w-[44px] rounded-[6px] px-2 font-bold text-[var(--color-brass-ink)] hover:opacity-70 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {chattingBotId === null ? (
        <div className="relative flex-1 flex flex-col justify-between min-h-0 overflow-hidden p-4 sm:p-6 pb-2">
          {/* Ambient Per-Character Neon & Calligraphy removed per user request */}

          {/* Main Top Area: Left Character Details vs Right Telemetry (Mirrored) */}
          <div className="relative z-10 flex flex-1 items-start justify-between gap-6 min-h-0">
            {/* Left Column: Character Details Panel (Tactical Frosted Glass Dossier) */}
            <aside
              ref={detailPanelRef}
              className="relative max-w-[430px] w-full rounded-[12px] border border-white/10 bg-[rgba(10,14,20,0.55)] backdrop-blur-xl p-5 sm:p-7 flex flex-col gap-6 shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
            >
              {/* Header: MARK 01 / 08 + Prev/Next Arrows */}
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-code)] text-[12px] font-bold tracking-[0.2em] text-white/60">
                  {selectedBotId === "merchant" ? "ARENA CURATOR · 09 / 09" : `MARK ${ROSTER.find(r => r.id === selectedBotId)?.num ?? "01"} / 08`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectPrev}
                    aria-label="Previous Mark"
                    className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={selectNext}
                    aria-label="Next Mark"
                    className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Character Title, Badges & Tagline */}
              {selectedLore && (
                <div className="flex flex-col gap-3">
                  <h2 className="font-[family-name:var(--font-display)] text-[34px] font-bold tracking-[0.04em] text-white leading-none uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                    {selectedLore.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-[4px] border border-white/20 bg-white/5 px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] uppercase backdrop-blur-sm"
                      style={{ color: "var(--accent)" }}
                    >
                      {selectedLore.role}
                    </span>
                    <span className="rounded-[4px] border border-[rgba(216,155,36,0.3)] bg-[rgba(216,155,36,0.1)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] text-[var(--color-gold-bright)] uppercase backdrop-blur-sm">
                      {selectedLore.difficulty}
                    </span>
                    {getBotItemStatus(selectedLore.id) === "verified" && (
                      <span className="rounded-[4px] border border-[rgba(157,184,122,0.4)] bg-[rgba(157,184,122,0.15)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] text-[#b8d097] uppercase backdrop-blur-sm">
                        FILED
                      </span>
                    )}
                    {selectedHolder !== null && getBotItemStatus(selectedLore.id) !== "verified" && (
                      <span className="rounded-[4px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.1em] text-[var(--color-brass-ink)] uppercase backdrop-blur-sm">
                        IN USE
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] font-medium text-[var(--color-text-2)] italic">
                    {selectedLore.tagline}
                  </p>
                </div>
              )}

              {/* Backstory Lore Text (Full text, no scroll) */}
              {selectedLore && (
                <div className="text-[13px] leading-[1.65] text-white/85 whitespace-pre-wrap">
                  {selectedLore.backstory}
                </div>
              )}

              {/* Extraction Target */}
              {selectedLore && (
                <div className="pt-2 border-t border-white/10">
                  <p className="font-[family-name:var(--font-code)] text-[10.5px] font-bold tracking-[0.15em] text-[var(--accent)] mb-4 uppercase">
                    Extraction Target
                  </p>
                  <div className="flex items-start gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[8px] border border-[rgba(216,155,36,0.4)] bg-black/40 p-2 shadow-[inset_0_0_12px_rgba(216,155,36,0.15)]">
                      <img
                        src={selectedLore.targetItem.asset || "/items/wick_medallion.svg"}
                        alt={selectedLore.targetItem.name}
                        className="h-full w-full object-contain drop-shadow-[0_0_8px_rgba(216,155,36,0.3)]"
                      />
                    </span>
                    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-[14px] text-white leading-tight">
                          {selectedLore.targetItem.name}
                        </span>
                        <span className="shrink-0 rounded-[4px] border border-[rgba(216,155,36,0.4)] bg-[rgba(216,155,36,0.15)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-gold-bright)] uppercase tracking-wider font-[family-name:var(--font-code)] backdrop-blur-sm">
                          {selectedLore.targetItem.rarity} · {selectedLore.targetItem.category}
                        </span>
                      </div>
                      <p className="text-[12px] leading-relaxed text-white/70">
                        {selectedLore.targetItem.description}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Primary Action Button */}
              {selectedLore && (
                <div className="pt-2">
                  {getBotItemStatus(selectedLore.id) === "verified" ? (
                    <button
                      type="button"
                      onClick={() => setCelebration(selectedLore.id)}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(157,184,122,0.4)] bg-[rgba(157,184,122,0.15)] px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-[#c4d8a8] hover:bg-[rgba(157,184,122,0.25)] backdrop-blur-md transition cursor-pointer"
                    >
                      <Lock className="h-4 w-4" />
                      <span>FILED AND LOCKED · CELEBRATE</span>
                    </button>
                  ) : getBotItemStatus(selectedLore.id) === "obtained" ? (
                    <div className="flex gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          const item = inventory.find((i) => i.botId === selectedLore.id && i.status === "obtained");
                          if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                        }}
                        className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.18)] px-4 py-2.5 text-[13.5px] font-bold tracking-wide text-[var(--color-gold-bright)] hover:bg-[rgba(216,155,36,0.28)] backdrop-blur-md transition"
                      >
                        <Gift className="h-4 w-4" />
                        <span>Inspect Relic</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => engage(selectedLore.id)}
                        className="min-h-[48px] rounded-[8px] border border-white/20 bg-white/10 px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-white hover:bg-white/20 backdrop-blur-md transition cursor-pointer"
                      >
                        <span>Talk</span>
                      </button>
                    </div>
                  ) : selectedHolder !== null ? (
                    <div className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-white/15 bg-white/5 px-6 py-2.5 font-bold text-[13px] tracking-wide text-white/60 backdrop-blur-sm">
                      <span>IN USE BY {selectedHolder}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => engage(selectedLore.id)}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[8px] border border-[var(--accent)]/50 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-white font-bold text-[13.5px] tracking-[0.12em] backdrop-blur-md transition-all cursor-pointer active:scale-[0.98] shadow-[0_0_20px_var(--accent-wash)] hover:shadow-[0_0_30px_var(--accent-glow)]"
                    >
                      <span>ENTER CONVERSATION</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </aside>

            {/* Right Column: Round 01 (Mirrored to Right) */}
            <div className="flex flex-col justify-between self-stretch items-end text-right max-w-[340px] select-none py-1">
              <div className="flex flex-col items-end gap-5">
                <div>
                  <p className="font-[family-name:var(--font-code)] text-[11px] font-bold tracking-[0.28em] text-[var(--accent)]">
                    ROUND <span className="text-white">01</span> /
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Character Carousel */}
          <div className="relative z-10 w-full pt-4 mt-auto">
            <div 
              ref={carouselRef}
              className="flex w-full overflow-x-auto gap-2 sm:gap-3 lg:gap-4 px-4 lg:px-8 pb-2 lg:pb-4 items-center xl:justify-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ maskImage: "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)" }}
            >
              {ROSTER.map((item) => {
                const lore = CHARACTERS[item.id];
                const isSelected = selectedBotId === item.id;
                const isMerchantCard = item.id === "merchant";
                const itemStatus = getBotItemStatus(item.id);
                const filed = itemStatus === "verified";
                
                // Color theme logic
                const activeBorder = isMerchantCard ? "border-[#f2b632] shadow-[0_0_15px_rgba(242,182,50,0.6)]" : "border-[#ff1e2d] shadow-[0_0_15px_rgba(255,30,45,0.6)]";
                
                const difficulty = isMerchantCard ? "Counter" : lore?.difficulty ?? "Normal";
                let tagColorClass = "";
                if (difficulty === "Normal") tagColorClass = "text-blue-400 border-blue-400/40 bg-blue-400/10";
                else if (difficulty === "Challenging") tagColorClass = "text-red-500 border-red-500/40 bg-red-500/10";
                else if (difficulty === "Master") tagColorClass = "text-purple-400 border-purple-400/40 bg-purple-400/10";
                else if (difficulty === "Counter") tagColorClass = "text-[#f2b632] border-[#f2b632]/40 bg-[#f2b632]/10";
                else tagColorClass = "text-[var(--color-text-3)] border-white/20 bg-black/50";

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedBotId(item.id)}
                    onDoubleClick={() => engage(item.id)}
                    className={`group relative flex-1 shrink-0 min-w-[80px] sm:min-w-[95px] lg:min-w-[110px] max-w-[130px] xl:max-w-[145px] h-[130px] sm:h-[150px] lg:h-[175px] -skew-x-[12deg] overflow-hidden cursor-pointer select-none transition-all duration-300 transform outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      isSelected 
                        ? `border-2 z-10 scale-[1.08] -translate-y-2 ${activeBorder}`
                        : "border border-white/15 hover:border-white/40 hover:scale-[1.03] hover:-translate-y-1 bg-black/60"
                    }`}
                  >
                    {/* Un-skew wrapper for contents */}
                    <div 
                      className="absolute top-0 bottom-0 skew-x-[12deg] flex flex-col justify-end"
                      style={{ left: "-20px", right: "-20px", width: "calc(100% + 40px)" }}
                    >
                      {/* Full Background Image */}
                      <img
                        src={lore?.heroImage ?? lore?.avatar ?? "/characters/wick.jpg"}
                        alt={item.label}
                        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.08] ${
                          filed && !isSelected ? "grayscale brightness-50" : (isSelected ? "brightness-110" : "brightness-75 group-hover:brightness-100")
                        } ${lore ? AVATAR_FOCUS[lore.id] : "object-center"}`}
                      />
                      
                      {/* Filed/Completed Overlay */}
                      {filed && (
                        <div className="absolute inset-0 bg-[#9db87a]/20 mix-blend-overlay z-10 flex items-center justify-center">
                          <div className="bg-black/60 p-2 rounded-full border border-[#9db87a]/50 shadow-[0_0_15px_rgba(157,184,122,0.4)]">
                            <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-[#9db87a]" />
                          </div>
                        </div>
                      )}

                      {/* Bottom Gradient for Text */}
                      <div className="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-[rgba(5,7,10,0.95)] via-[rgba(5,7,10,0.7)] to-transparent z-10" />

                      {/* Content (Text & Tags) */}
                      <div className="relative z-20 flex flex-col items-center justify-end pb-2 sm:pb-3 px-1 h-full gap-1 sm:gap-1.5">
                        {/* Index */}
                        <span className={`absolute top-2 left-3 sm:left-4 font-[family-name:var(--font-code)] text-[9px] font-bold tracking-[0.1em] ${isSelected ? (isMerchantCard ? "text-[#f2b632]" : "text-[#ff1e2d]") : "text-white/40"}`}>
                          {item.num}
                        </span>

                        <span className={`font-[family-name:var(--font-display)] text-[10px] sm:text-[11px] font-bold tracking-[0.05em] truncate w-full text-center ${
                          isSelected ? "text-white" : "text-[var(--color-text-2)]"
                        }`}>
                          {item.label.toUpperCase()}
                        </span>
                        
                        <span className={`rounded-[3px] border px-2 py-0.5 font-[family-name:var(--font-code)] text-[8.5px] font-semibold tracking-wide ${tagColorClass} ${!isSelected && "opacity-80"}`}>
                          {difficulty}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── Chat View ── */
        <div className="relative flex-1 flex flex-col min-h-0">
          <div className="relative flex min-h-0 flex-1 flex-col">
          <header className="acc-border flex items-center justify-between gap-2 border-b bg-[rgba(5,7,10,0.6)] px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => leaveChat()}
                className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] border border-[var(--color-border)] px-3 py-1.5 font-semibold text-[13px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Marks</span>
              </button>

              <span className="acc-border acc-glow block w-10 h-10 rounded-[8px] overflow-hidden border shrink-0">
                <img
                  src={CHARACTERS[chattingBotId]?.avatar ?? "/characters/wick.jpg"}
                  alt={chattingBotId}
                  className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`}
                />
              </span>

              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-display)] text-[16px] font-bold tracking-[0.05em] text-white truncate">
                  {(CHARACTERS[chattingBotId]?.name ?? "").toUpperCase()}
                </h3>
                <p className="text-[12px] text-[var(--color-text-3)] truncate">
                  {CHARACTERS[chattingBotId]?.tagline}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isMerchant ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMerchantTab("counter")}
                    aria-pressed={merchantTab === "counter"}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 font-semibold text-[12px] transition ${
                      merchantTab === "counter"
                        ? "border-[rgba(216,155,36,0.55)] bg-[rgba(216,155,36,0.14)] text-[var(--color-gold-bright)]"
                        : "redline-chip text-[var(--color-text-2)] hover:text-white"
                    }`}
                  >
                    <Scale className="w-4 h-4" />
                    <span className="hidden sm:inline">Counter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMerchantTab("talk")}
                    aria-pressed={merchantTab === "talk"}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 font-semibold text-[12px] transition ${
                      merchantTab === "talk"
                        ? "border-[rgba(216,155,36,0.55)] bg-[rgba(216,155,36,0.14)] text-[var(--color-gold-bright)]"
                        : "redline-chip text-[var(--color-text-2)] hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">Talk</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setInventoryOpen(true)}
                  className="redline-chip acc-border flex min-h-[44px] items-center gap-1.5 rounded-[6px] px-3 py-1.5 font-semibold text-[12px] text-white transition"
                >
                  <Package className="acc-text h-4 w-4" />
                  <span className="hidden sm:inline">Satchel ({inventory.length}/8)</span>
                </button>
              )}

              <RewindButton botId={chattingBotId} onRewind={rewind} />
              {!isMerchant && chattingBotId !== null && (
                <button
                  type="button"
                  onClick={() => { openCoverFor(chattingBotId, false, null); }}
                  title="View or update your cover for this mark"
                  className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] border border-[var(--color-border)] px-3 py-1.5 font-semibold text-[12px] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] transition"
                >
                  <VenetianMask className="w-4 h-4 text-[var(--color-text-3)]" />
                  <span className="hidden sm:inline">Cover</span>
                </button>
              )}
            </div>
          </header>

          {isMerchant && merchantTab === "counter" ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              <MerchantCounter inventory={inventory} credits={credits} say={say} />
            </div>
          ) : (
            <>
              <div className="redline-scroll flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 max-w-[860px] w-full mx-auto" aria-live="polite">
                {activeBot?.messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  const canRewind = m.id !== undefined && chattingBotId !== null;
                  const isRewindingThis = m.id !== undefined && rewindingId === m.id;
                  return (
                    <div
                      key={m.id ?? idx}
                      className={`chat-msg group relative flex gap-3 max-w-[85%] ${isUser ? "self-end flex-row-reverse" : "self-start"}`}
                    >
                      <span className="redline-chip block w-8 h-8 rounded-[8px] overflow-hidden shrink-0" aria-hidden="true">
                        {isUser ? (
                          <span className="acc-wash flex h-full w-full items-center justify-center text-[11px] font-bold">
                            <UserCheck className="w-4 h-4" />
                          </span>
                        ) : (
                          <img
                            src={CHARACTERS[chattingBotId]?.avatar}
                            alt=""
                            className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`}
                          />
                        )}
                      </span>

                      <div className="flex flex-col gap-1 max-w-full">
                        <div
                          className={`rounded-[10px] px-4 py-3 text-[14.5px] leading-relaxed relative ${
                            isUser
                              ? "redline-cta acc-glow"
                              : "border border-[rgba(255,255,255,0.09)] bg-[rgba(13,17,23,0.92)] text-[var(--color-text-1)]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>

                        {/* Granular Rewind Button on message hover/focus */}
                        {canRewind && (
                          <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${isUser ? "justify-end" : "justify-start"}`}>
                            <button
                              type="button"
                              disabled={isRewindingThis}
                              onClick={async () => {
                                if (m.id === undefined || chattingBotId === null) return;
                                const confirmMsg = isUser
                                  ? `Rewind to this message? Turns from here onward will be deleted (−1 ELO).`
                                  : `Rewind to before this reply? (−1 ELO)`;
                                if (!window.confirm(confirmMsg)) return;
                                setRewindingId(m.id);
                                if (isUser) {
                                  setDraft(m.text);
                                }
                                await rewind(chattingBotId, { messageId: m.id });
                                setRewindingId(null);
                              }}
                              className="acc-text flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-3)] hover:brightness-125 px-1.5 py-0.5 rounded transition"
                              title="Rewind to this point in time (-1 ELO)"
                            >
                              <RotateCcw className={`w-3 h-3 ${isRewindingThis ? "animate-spin" : ""}`} />
                              <span>{isRewindingThis ? "Rewinding..." : "Rewind to here"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {activeBot?.typing && activeBot.streaming === "" && (
                  <div className="self-start flex gap-3">
                    <span className="redline-chip block w-8 h-8 rounded-[8px] overflow-hidden shrink-0" aria-hidden="true">
                      <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                    </span>
                    <div className="rounded-[10px] border border-[rgba(255,255,255,0.09)] bg-[rgba(13,17,23,0.92)]">
                      <TypingBubble />
                    </div>
                  </div>
                )}

                {activeBot?.streaming !== "" && activeBot?.streaming !== undefined && (
                  <div className="self-start flex gap-3 max-w-[85%]">
                    <span className="redline-chip block w-8 h-8 rounded-[8px] overflow-hidden shrink-0" aria-hidden="true">
                      <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                    </span>
                    <div className="rounded-[10px] px-4 py-3 border border-[rgba(255,255,255,0.09)] bg-[rgba(13,17,23,0.92)] text-[var(--color-text-1)] text-[14.5px] leading-relaxed">
                      <p className="whitespace-pre-wrap">{activeBot.streaming}</p>
                    </div>
                  </div>
                )}
              </div>
              {/* In-page Claim Banner (part of the site) if relic is yielded & held */}
              {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "obtained") && (() => {
                const item = inventory.find((i) => i.botId === chattingBotId && i.status === "obtained");
                const lore = CHARACTERS[chattingBotId];
                return (
                  <div className="border-y border-[rgba(216,155,36,0.45)] bg-[rgba(9,13,18,0.9)] p-3 shadow-[0_0_24px_rgba(216,155,36,0.12)] sm:px-6">
                    <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 max-w-[860px]">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-11 h-11 rounded-[8px] border border-[rgba(216,155,36,0.55)] bg-[rgba(216,155,36,0.1)] p-1 flex items-center justify-center shrink-0">
                          <img
                            src={lore?.targetItem.asset ?? "/items/wick_medallion.svg"}
                            alt=""
                            className="w-full h-full object-contain drop-shadow"
                          />
                          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-gold)]">
                            <Sparkles className="w-2 h-2 text-black" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-gold-bright)] bg-[rgba(216,155,36,0.12)] px-2 py-0.5 rounded border border-[rgba(216,155,36,0.45)]">
                              Relic Secured · Held
                            </span>
                            <span className="text-[12px] text-[var(--color-text-3)]">
                              ~{lore?.targetItem.merchantBounty ?? 100} credits
                            </span>
                          </div>
                          <p className="text-[14px] font-bold text-white truncate">
                            {lore?.targetItem.name ?? item?.itemKey}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                          }}
                          className="flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[rgba(216,155,36,0.55)] bg-[rgba(216,155,36,0.16)] px-4 py-2 text-[13px] font-bold text-[var(--color-gold-bright)] transition hover:bg-[rgba(216,155,36,0.26)] active:scale-95 cursor-pointer"
                        >
                          <Gift className="w-4 h-4" />
                          <span>Inspect / Claim</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => engage("merchant")}
                          className="redline-chip acc-border flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-semibold text-white transition"
                        >
                          <span>Merchant</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* In-page Verified Banner if relic is already filed */}
              {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "verified") && (
                <div className="border-t border-[rgba(157,184,122,0.35)] bg-[rgba(9,13,18,0.9)] px-4 py-2 text-center text-[12px] text-[var(--color-text-2)] flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#9db87a]" />
                  <span>Relic filed and locked at the Merchant Counter.</span>
                  <button
                    type="button"
                    onClick={() => setCelebration(chattingBotId)}
                    className="underline text-[var(--color-gold-bright)] font-semibold hover:opacity-80 ml-1 cursor-pointer"
                  >
                    Celebrate again
                  </button>
                </div>
              )}

              <form
                onSubmit={submitChat}
                className="acc-border border-t bg-[rgba(5,7,10,0.6)] p-3 backdrop-blur-sm sm:p-4"
              >
                <div className="mx-auto flex w-full max-w-[860px] items-center gap-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!locked}
                    placeholder={locked ? `Write to ${CHARACTERS[chattingBotId]?.name}` : "Paused"}
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
        </div>
      )}

      <InventoryModal
        isOpen={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        inventory={inventory}
        credits={credits}
        onOpenMerchant={() => engage("merchant")}
      />

      {celebration !== null && (
        <CelebrationOverlay botId={celebration} onClose={() => setCelebration(null)} />
      )}

      {claimRelic !== null && (
        <ClaimItemModal
          botId={claimRelic.botId}
          itemKey={claimRelic.itemKey}
          onClaim={() => setClaimRelic(null)}
          onVisitMerchant={() => {
            setClaimRelic(null);
            engage("merchant");
          }}
        />
      )}

      {coverOpen && coverBot !== null && (
        <ProfileModal
          botId={coverBot}
          lockCreate={coverLock}
          onClose={() => { setCoverOpen(false); setCoverLock(false); setPendingBot(null); setCoverBot(null); }}
          onSaved={(profile, isNew) => {
            setCovers((prev) => ({ ...prev, [profile.bot_id]: profile }));
            setCoverOpen(false);
            setCoverLock(false);
            const next = pendingBot;
            setPendingBot(null);
            setCoverBot(null);
            if (next !== null) {
              void takeAndEnter(next);
            }
          }}
        />
      )}
      </div>
    </div>
  );
}
