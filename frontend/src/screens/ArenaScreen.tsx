import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import { getCover, type CoverProfile } from "@/api/profiles";
import { acquireLock, getLocks, releaseLock, type BotLockMap } from "@/api/locks";
import type { BotId, InventoryDelta } from "@contracts/events";
import TypingBubble from "@/chat/TypingBubble";
import MatrixText from "@/chat/MatrixText";
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
  Radio,
  ShieldAlert,
  Check
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

  const { bots, inventory, hasSyncedInventory, credits, locks, connected, setLocks, send, say, rewind } = useBotStream(teamId);
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
    setSelectedBotId(ROSTER[nextIdx]?.id ?? "wick");
  }
  function selectPrev(): void {
    const curIdx = ROSTER.findIndex((r) => r.id === selectedBotId);
    const prevIdx = (curIdx - 1 + ROSTER.length) % ROSTER.length;
    setSelectedBotId(ROSTER[prevIdx]?.id ?? "wick");
  }

  // Keyboard navigation & Esc to close chat
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && chattingBotId !== null && !inventoryOpen && !coverOpen && !claimRelic && !celebration) {
        if (chattingBotId !== "merchant" && heldBot !== null) {
          setHeldBot(null);
          void releaseLock(chattingBotId).catch(() => {});
        }
        setChattingBotId(null);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // If NOT chatting and no modals open, cycle arrows
      if (chattingBotId === null && !inventoryOpen && !coverOpen && !claimRelic && !celebration) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          selectNext();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          selectPrev();
        } else if (e.key >= "1" && e.key <= "9") {
          const idx = parseInt(e.key, 10) - 1;
          const target = ROSTER[idx];
          if (target) setSelectedBotId(target.id);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chattingBotId, selectedBotId, inventoryOpen, coverOpen, claimRelic, celebration, heldBot]);

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
    window.dispatchEvent(
      new CustomEvent("arena:nav_visibility", { detail: { hidden: chattingBotId !== null } })
    );
  }, [chattingBotId]);

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
    if (held !== null) void releaseLock(held).catch(() => {});
  }, []);

  // Handover (claim popup) & Verification (celebration overlay) triggers on inventory change
  useEffect(() => {
    if (!hasSyncedInventory) return;
    
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
            void releaseLock(item.botId).catch(() => {});
          }
          setChattingBotId(null);
        }
        setCelebration(item.botId);
      }
    }
  }, [inventory, hasSyncedInventory, chattingBotId]);

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
      void releaseLock(heldRef.current).catch(() => {});
    }
    setHeldBot(botId);
    setLockNotice(null);
    setDraft("");
    setChattingBotId(botId);
  }

  function leaveChat(): void {
    const held = heldRef.current;
    if (held !== null) {
      setHeldBot(null);
      void releaseLock(held).catch(() => {});
    }
    setHeldBot(null);
    setLockNotice(null);
    setCelebration(null);
    setChattingBotId(null);
  }

  function engage(botId: BotId): void {
    if (getBotItemStatus(botId) === "verified") { setCelebration(botId); return; }
    if (botId === "merchant") { if (heldRef.current !== null) { void releaseLock(heldRef.current).catch(() => {}); setHeldBot(null); } setMerchantTab("counter"); setChattingBotId(botId); return; }
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
  const botAccent = CHARACTERS[chatBot]?.accent ?? "var(--color-brass)";
  const botAccentInk = CHARACTERS[chatBot]?.accentInk ?? "var(--color-bg-0)";
  const botThemeStyle = { "--accent": botAccent, "--accent-ink": botAccentInk } as React.CSSProperties;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arena:accent", { detail: { accent: botAccent, ink: botAccentInk } }));
  }, [botAccent, botAccentInk]);
  function submitChat(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked || chattingBotId === null || activeBot?.typing || activeBot?.streaming) return;
    if (getBotItemStatus(chattingBotId) === "verified") return;
    unlockAudio();
    if (send(chattingBotId, text)) setDraft("");
  }

  const merchantLore = CHARACTERS["merchant"];

  return (
    <div
      className="bot-theme relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={botThemeStyle}
    >
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
        <div className="mx-auto grid w-full max-w-[1280px] flex-1 min-h-0 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8 lg:p-8">
          <nav aria-label="Round one characters" className="min-h-0 lg:overflow-y-auto redline-scroll">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-2">Choose a character</h2>
              <span className="font-mono text-xs text-brass">{verifiedCount}/8 filed</span>
            </div>
            <div ref={markListRef} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {[ROSTER[8]!, ...ROSTER.slice(0, 8)].map((entry) => {
                const character = CHARACTERS[entry.id];
                const status = getBotItemStatus(entry.id);
                const selected = selectedBotId === entry.id;
                return (
                  <button key={entry.id} type="button" onClick={() => setSelectedBotId(entry.id)} aria-pressed={selected}
                    className={`mark-card flex min-h-[76px] items-center gap-3 rounded-[8px] border p-3 text-left ${selected ? "border-brass bg-brass-wash" : status === "verified" ? "border-moss-border bg-moss-wash" : "border-border bg-surface-1"}`}>
                    <img src={character?.avatar} alt="" className={`h-11 w-11 shrink-0 rounded-[6px] object-cover ${AVATAR_FOCUS[entry.id]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text-1">{entry.label}</span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-text-2">
                        {entry.id === "merchant" ? <><Coins className="h-3 w-3" />{credits} credits</> : status === "verified" ? <><CheckCircle2 className="h-3 w-3" />Filed</> : status === "obtained" ? <><Package className="h-3 w-3" />Held</> : <><MessageSquare className="h-3 w-3" />Open</>}
                      </span>
                    </span>
                    {selected && <ChevronRight className="hidden h-4 w-4 shrink-0 text-brass lg:block" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </nav>
          {selectedLore && <section ref={detailPanelRef} aria-labelledby="character-title" className="min-w-0 rounded-[8px] border border-border bg-surface-1 p-5 sm:p-8 lg:self-start">
            <div className="flex items-start justify-between gap-5 border-b border-border pb-6">
              <div>
                <p className="mb-3 font-mono text-xs tracking-wider text-brass">{selectedBotId === "merchant" ? "THE COUNTER" : `ROUND 01 / ${ROSTER.find((r) => r.id === selectedBotId)?.num}`}</p>
                <h1 id="character-title" className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-text-1 sm:text-4xl">{selectedLore.name}</h1>
                <p className="mt-2 text-sm text-text-2">{selectedLore.moniker}</p>
              </div>
              <img src={selectedLore.avatar} alt="" className={`h-24 w-24 shrink-0 rounded-[8px] object-cover sm:h-32 sm:w-32 ${AVATAR_FOCUS[selectedBotId]}`} />
            </div>
            <p className="max-w-[65ch] py-6 text-base leading-relaxed text-text-2">{selectedLore.backstory}</p>
            {selectedBotId !== "merchant" && <div className="flex items-center gap-5 border-y border-border py-6">
              <img src={selectedLore.targetItem.asset} alt={selectedLore.targetItem.name} className="h-24 w-24 shrink-0 object-contain sm:h-28 sm:w-28" />
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-brass">Your objective</p>
                <h2 className="text-lg font-semibold text-text-1">{selectedLore.targetItem.name}</h2>
                <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-text-2">{selectedLore.targetItem.description}</p>
              </div>
            </div>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" disabled={selectedHolder !== null || coverChecking === selectedBotId} onClick={() => engage(selectedBotId)} className="redline-cta inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[6px] px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                {getBotItemStatus(selectedBotId) === "verified" ? <><CheckCircle2 className="h-4 w-4" />Relic filed</> : selectedHolder !== null ? <><Lock className="h-4 w-4" />In use by {selectedHolder}</> : coverChecking === selectedBotId ? "Checking your cover…" : selectedBotId === "merchant" ? <><Scale className="h-4 w-4" />Visit the counter</> : <><MessageSquare className="h-4 w-4" />Start conversation</>}
              </button>
              {getBotItemStatus(selectedBotId) === "obtained" && <button type="button" onClick={() => setInventoryOpen(true)} className="min-h-[48px] rounded-[6px] border border-border-strong px-4 text-sm font-medium text-text-1">Inspect held relic</button>}
              <p className="w-full mt-2 text-xs text-text-3">{selectedBotId === "merchant" ? "Sell genuine relics and use your credits to buy clues." : "Build a cover, make your case, then bring the relic to the merchant."}</p>
            </div>
          </section>}
        </div>
      ) : (
        <div className="relative flex-1 flex flex-col min-h-0">
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Top HUD Header */}
            <header className="relative flex items-center justify-between gap-3 border-b border-border bg-surface-1 px-4 py-3 ">
              {/* Upper red tactical line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-brass-wash " />

              {/* Left Persona Dossier */}
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => leaveChat()}
                  title="Return to Marks (ESC)"
                  className="flex min-h-[44px] px-3 items-center gap-2 border border-border bg-surface-1  text-text-1 hover:text-text-1 hover:border-brass hover:bg-brass-wash transition-all group"
                >
                  <ArrowLeft className="w-4 h-4 text-brass group-hover:-translate-x-0.5 transition-transform" />
                  <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase hidden sm:inline">MARKS</span>
                </button>

                <span className="relative block w-10 h-10 overflow-hidden border border-brass bg-surface-1 shrink-0 ">
                  <img
                    src={CHARACTERS[chattingBotId]?.avatar ?? "/characters/wick.jpg"}
                    alt={chattingBotId}
                    className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`}
                  />
                  <div className="absolute inset-0 border border-border pointer-events-none" />
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-[family-name:var(--font-code)] text-[15px] sm:text-[17px] font-bold tracking-[0.12em] text-text-1 uppercase truncate">
                      {CHARACTERS[chattingBotId]?.name ?? chattingBotId}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Center/Right HUD Telemetry & Actions */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* 8-pip segmented progress bar */}
                {!isMerchant && (
                  <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 border border-border bg-surface-1 ">
                    <span className="font-mono text-[10px] font-bold tracking-[0.15em] text-text-1 uppercase">
                      COMPLETED {verifiedCount}/8
                    </span>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <span
                          key={i}
                          className={`block h-2 w-3 rounded-none transition-all ${
                            i < verifiedCount
                              ? "bg-brass-wash "
                              : "bg-surface-2"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {isMerchant ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setMerchantTab("counter")}
                      aria-pressed={merchantTab === "counter"}
                      className={`flex min-h-[44px] items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase transition ${
                        merchantTab === "counter"
                          ? "border-brass bg-brass-wash text-brass "
                          : "border-border bg-surface-1 text-text-1 hover:text-text-1 hover:border-border"
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Counter</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMerchantTab("talk")}
                      aria-pressed={merchantTab === "talk"}
                      className={`flex min-h-[44px] items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase transition ${
                        merchantTab === "talk"
                          ? "border-brass bg-brass-wash text-brass "
                          : "border-border bg-surface-1 text-text-1 hover:text-text-1 hover:border-border"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Talk</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInventoryOpen(true)}
                    className="flex min-h-[44px] items-center gap-2 border border-border bg-surface-1  px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] text-text-1 hover:text-text-1 hover:border-brass hover:bg-brass-wash transition"
                  >
                    <Package className="h-3.5 w-3.5 text-brass" />
                    <span>SATCHEL ({inventory.length}/8)</span>
                  </button>
                )}

                <RewindButton botId={chattingBotId} onRewind={rewind} />

                {!isMerchant && chattingBotId !== null && (
                  <button
                    type="button"
                    onClick={() => { openCoverFor(chattingBotId, false, null); }}
                    title="View or update your cover for this mark"
                    className="flex min-h-[44px] items-center gap-2 border border-border bg-surface-1  px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] text-text-1 hover:text-text-1 hover:border-brass hover:bg-brass-wash transition"
                  >
                    <VenetianMask className="w-3.5 h-3.5 text-brass" />
                    <span className="hidden sm:inline">COVER</span>
                    {covers[chattingBotId] && (
                      <span className="h-1.5 w-1.5 rounded-full bg-brass-wash " />
                    )}
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
                {/* Tactical Chat Container */}
                <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                  {/* Floating Objective HUD Card (Top Left) */}
                  {!isMerchant && (
                    <div className="pointer-events-none absolute top-4 left-4 z-20 hidden md:block">
                      <div className="pointer-events-auto flex items-start gap-3 p-3 bg-surface-1 border border-border  max-w-[340px] ">
                        <ShieldAlert className="w-4 h-4 text-brass shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-brass uppercase">MISSION OBJECTIVE</p>
                          <p className="text-[12px] text-text-1 font-medium leading-snug mt-0.5">
                            Gain trust and extract the <span className="text-text-1 font-bold">{CHARACTERS[chattingBotId]?.targetItem.name}</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scrollable Message Feed */}
                  <div className="redline-scroll flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 max-w-[860px] w-full mx-auto" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
                    {activeBot?.messages.map((m, idx) => {
                      const isUser = m.role === "user";
                      const canRewind = m.id !== undefined && chattingBotId !== null;
                      const isRewindingThis = m.id !== undefined && rewindingId === m.id;
                      const isLatestBotMsg = !isUser && idx === (activeBot?.messages.length ?? 0) - 1;

                      return (
                        <div
                          key={m.id ?? idx}
                          className={`chat-msg group relative flex gap-3 max-w-[85%] ${isUser ? "self-end flex-row-reverse" : "self-start"}`}
                        >
                          {/* Avatar / Badge */}
                          <span className="block w-9 h-9 overflow-hidden shrink-0 border border-border bg-surface-1 " aria-hidden="true">
                            {isUser ? (
                              <span className="flex h-full w-full items-center justify-center bg-brass-wash text-brass border border-brass">
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

                          <div className="flex flex-col gap-1.5 max-w-full">
                            {/* Message Capsule */}
                            <div
                              className={`rounded-[8px] px-4 py-3 text-[14.5px] leading-relaxed relative ${
                                isUser
                                  ? "bg-text-1 border border-text-1 text-bg-0 "
                                  : "border border-border bg-surface-1  text-text-1 "
                              }`}
                            >
                              {/* Message body */}
                              <div className="whitespace-pre-wrap">
                                {isUser ? (
                                  m.text
                                ) : (
                                  <MatrixText
                                    text={m.text}
                                    isStreaming={false}
                                    animateOnMount={false}
                                    accentColor={botAccent}
                                  />
                                )}
                              </div>
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
                                    const result = await rewind(chattingBotId, { messageId: m.id });
                                    if (!result.ok) flashLockNotice(result.error ?? "Rewind failed");
                                    else if (isUser) setDraft(m.text);
                                    setRewindingId(null);
                                  }}
                                  className="min-h-[44px] flex items-center gap-1 font-mono text-[10px] font-bold text-brass hover:brightness-125 px-1.5 py-0.5 bg-surface-1 border border-border transition"
                                  title="Rewind to this point in time (-1 ELO)"
                                >
                                  <RotateCcw className={`w-3 h-3 ${isRewindingThis ? "animate-spin" : ""}`} />
                                  <span>{isRewindingThis ? "Rewinding..." : "REWIND TO HERE"}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Bot Typing Decrypting Signal */}
                    {activeBot?.typing && activeBot.streaming === "" && (
                      <div className="self-start flex gap-3">
                        <span className="block w-9 h-9 overflow-hidden shrink-0 border border-border bg-surface-1 " aria-hidden="true">
                          <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                        </span>
                        <TypingBubble accentColor={botAccent} />
                      </div>
                    )}

                    {/* Bot Streaming Tokens with Matrix Decode */}
                    {activeBot?.streaming !== "" && activeBot?.streaming !== undefined && (
                      <div className="self-start flex gap-3 max-w-[85%]">
                        <span className="block w-9 h-9 overflow-hidden shrink-0 border border-border bg-surface-1 " aria-hidden="true">
                          <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                        </span>
                        <div className="px-4 py-3 border border-border bg-surface-1  text-text-1 text-[14.5px] leading-relaxed ">
                          <p className="whitespace-pre-wrap">
                            <MatrixText
                              text={activeBot.streaming}
                              isStreaming={true}
                              accentColor={botAccent}
                            />
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* In-page Claim Banner if relic is yielded & held */}
                {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "obtained") && (() => {
                  const item = inventory.find((i) => i.botId === chattingBotId && i.status === "obtained");
                  const lore = CHARACTERS[chattingBotId];
                  return (
                    <div className="border-y border-border bg-surface-1 p-3  sm:px-6 z-20">
                      <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 max-w-[860px]">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="relative w-11 h-11 border border-border bg-surface-1 p-1 flex items-center justify-center shrink-0">
                            <img
                              src={lore?.targetItem.asset ?? "/items/wick_medallion.svg"}
                              alt=""
                              className="w-full h-full object-contain drop-shadow"
                            />
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-gold)]">
                              <Sparkles className="w-2 h-2 text-text-1" />
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-gold-bright)] bg-surface-1 px-2 py-0.5 border border-border">
                                Relic Secured · Held
                              </span>
                              <span className="text-[12px] text-[var(--color-text-3)] font-mono">
                                ~{lore?.targetItem.merchantBounty ?? 100} credits
                              </span>
                            </div>
                            <p className="text-[14px] font-bold text-text-1 truncate">
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
                            className="flex min-h-[44px] items-center gap-1.5 border border-border bg-surface-1 px-4 py-2 text-[13px] font-bold text-[var(--color-gold-bright)] transition hover:bg-surface-1 active:scale-95 cursor-pointer font-mono"
                          >
                            <Gift className="w-4 h-4" />
                            <span>INSPECT / CLAIM</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => engage("merchant")}
                            className="flex min-h-[44px] cursor-pointer items-center gap-1.5 border border-border bg-surface-1 px-3 py-2 text-[13px] font-semibold text-text-1 transition hover:border-brass hover:bg-brass-wash font-mono"
                          >
                            <span>MERCHANT</span>
                            <ArrowRight className="w-3.5 h-3.5 text-brass" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* In-page Verified Banner if relic is already filed */}
                {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "verified") && (
                  <div className="border-t border-moss-border bg-surface-1 px-4 py-2.5 text-center text-[12px] text-text-1 flex items-center justify-center gap-2 z-20">
                    <CheckCircle2 className="w-4 h-4 text-moss" />
                    <span className="font-mono">RELIC FILED & LOCKED AT THE MERCHANT COUNTER.</span>
                    <button
                      type="button"
                      onClick={() => setCelebration(chattingBotId)}
                      className="underline text-[var(--color-gold-bright)] font-semibold hover:opacity-80 ml-1 cursor-pointer font-mono"
                    >
                      Celebrate again
                    </button>
                  </div>
                )}

                {/* Tactical Transmission Console (Bottom Bar) */}
                <form
                  onSubmit={submitChat}
                  className="relative border-t border-border bg-surface-1 p-3 sm:p-4  z-20"
                >


                  <div className="mx-auto flex flex-col gap-2 max-w-[860px] w-full">
                    <p role="status" className="text-xs text-text-3">{!connected ? "Reconnecting… Your draft is safe." : !locked ? "Resume fullscreen to continue." : activeBot?.typing ? "Waiting for a reply. You can prepare your next message." : "Messages are shared with your team."}</p>
                    {/* Input Console */}
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1 flex items-center">
                        <input
                          aria-label="Message"
                          maxLength={4000}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          disabled={!locked}
                          placeholder={locked ? `Write to ${CHARACTERS[chattingBotId]?.name}...` : "Resume fullscreen to write"}
                          className="w-full min-h-[50px] border border-border bg-surface-1 px-4 text-[14.5px] text-text-1 placeholder:text-text-1 focus:outline-none focus:border-brass  transition-all font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={!connected || !locked || draft.trim() === "" || activeBot?.typing || activeBot?.streaming !== ""}
                        className="redline-cta relative flex min-h-[50px] rounded-[6px] px-6 items-center justify-center gap-2 font-mono text-[13px] font-bold tracking-[0.15em] uppercase hover:bg-brass-wash disabled:opacity-40 transition-all  active:scale-[0.98] group overflow-hidden shrink-0"
                      >
                        <span>{activeBot?.typing ? "Replying…" : "Send"}</span>
                        <Send className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
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
