import ChatMessageFrame, { CHAT_FEED } from "@/chat/ChatMessageFrame";
import ChatComposer from "@/chat/ChatComposer";
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
import ChatMarkdown from "@/chat/ChatMarkdown";
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

const CHAT_PULSES = [
  "border-[#E10600]/30 shadow-[0_0_20px_rgba(225,6,0,0.2)]",
  "border-[#E10600]/10 shadow-[0_0_10px_rgba(225,6,0,0.05)]",
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

  const { bots, inventory, hasSyncedInventory, credits, locks, setLocks, send, say, rewind } = useBotStream(teamId, displayName);
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
      if (e.key === "Escape" && chattingBotId !== null) {
        if (chattingBotId !== "merchant" && heldBot !== null) {
          setHeldBot(null);
          void releaseLock(chattingBotId);
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
    if (held !== null) void releaseLock(held);
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
      if (item.status === "obtained" && (prevItem === undefined || prevItem.status === "locked") && item.obtainedBy === displayName) {
        setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
      }

      // Check 2: Transitioned to verified -> Trigger Celebration Overlay!
      if (item.status === "verified" && prevItem?.status !== "verified" && item.obtainedBy === displayName) {
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

  function lockHolderFromError(err: unknown): string | undefined {
    if (typeof err !== "object" || err === null || !("holder" in err)) return undefined;
    const holder = err.holder;
    if (typeof holder !== "object" || holder === null || !("displayName" in holder)) return undefined;
    return typeof holder.displayName === "string" ? holder.displayName : undefined;
  }

  // Acquire the mark as soon as the operator starts an attempt. 409 means a
  // teammate beat us to it; the server broadcasts the winning holder to the room.
  async function acquireAttempt(botId: BotId): Promise<boolean> {
    try {
      const next = await acquireLock(botId);
      setLocks(next);
    } catch (err) {
      const holder = lockHolderFromError(err);
      try {
        setLocks(await getLocks());
      } catch { /* keep last known locks */ }
      flashLockNotice(holder ? `${holder} is already talking to this mark` : "Mark already in use");
      return false;
    }
    if (heldRef.current !== null && heldRef.current !== botId) {
      void releaseLock(heldRef.current);
    }
    setHeldBot(botId);
    setLockNotice(null);
    return true;
  }

  async function takeAndEnter(botId: BotId): Promise<void> {
    if (!(await acquireAttempt(botId))) return;
    setChattingBotId(botId);
  }

  function leaveChat(): void {
    const held = heldRef.current;
    if (held !== null) {
      setHeldBot(null);
      void releaseLock(held);
    }
    setHeldBot(null);
    setLockNotice(null);
    setCelebration(null);
    setChattingBotId(null);
  }

  function engage(botId: BotId): void {
    if (getBotItemStatus(botId) === "verified") {
      const item = inventory.find((entry) => entry.botId === botId);
      if (item?.obtainedBy === displayName) setCelebration(botId);
      return;
    }
    if (botId === "merchant") { setMerchantTab("counter"); setChattingBotId(botId); return; }
    // Single-operator rule: a mark held by a teammate stays selectable but not enterable.
    const holder = holderOf(botId);
    if (holder !== null) { flashLockNotice(`${holder} is already talking to this mark`); return; }
    if (coverChecking === botId) return;
    void (async () => {
      // Lock before checking or creating a cover so the whole attempt is visible
      // to teammates, including the required dossier step.
      if (!(await acquireAttempt(botId))) return;
      const coverState = covers[botId];
      // No cover on file for this mark — file one before talking.
      if (coverState === null) { openCoverFor(botId, true, null); return; }
      if (coverState === undefined) {
        setCoverChecking(botId);
        try {
          const c = await getCover(botId);
          setCovers((prev) => ({ ...prev, [botId]: c }));
          if (c === null) {
            openCoverFor(botId, true, null);
          } else {
            setChattingBotId(botId);
          }
        } catch {
          setCovers((prev) => ({ ...prev, [botId]: null }));
          openCoverFor(botId, true, null);
        } finally {
          setCoverChecking(null);
        }
        return;
      }
      setChattingBotId(botId);
    })();
  }

  const activeBot = chattingBotId === null ? undefined : bots[chattingBotId];
  const commsName = chattingBotId === null ? null : (CHARACTERS[chattingBotId]?.name ?? chattingBotId);
  useDocumentTitle(commsName === null ? "Round 1 · Marks — REDLINE Arena" : `${commsName} — REDLINE Arena`);
  const selectedLore = CHARACTERS[selectedBotId];
  const selectedAttempt = selectedLore && getBotItemStatus(selectedLore.id) !== "verified"
    ? locks[selectedLore.id]
    : undefined;
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
  const chatFeedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [activeBot?.messages, activeBot?.streaming, activeBot?.typing]);
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

              {/* Character Title, Attempt Status & Tagline */}
              {selectedLore && (
                <div className="flex flex-col gap-3">
                  {selectedAttempt !== undefined && (
                    <div role="status" className="flex min-h-[30px] items-center gap-2 border border-[var(--color-redline-dim)] bg-[var(--color-bg-0)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.12em] text-[var(--color-redline)] uppercase">
                      <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">CURRENTLY ATTEMPTING BY {selectedAttempt.displayName.toUpperCase()}</span>
                    </div>
                  )}
                  <h2 className="font-[family-name:var(--font-display)] text-[34px] font-bold tracking-[0.04em] text-white leading-none uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                    {selectedLore.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Removed Role and Difficulty Tags */}
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
                  {(() => {
                    const item = inventory.find((i) => i.botId === selectedLore.id);
                    if (item && (item.status === "verified" || item.status === "obtained") && item.obtainedBy && item.obtainedBy !== displayName) {
                      return (
                        <div className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.18)] px-6 py-2.5 font-bold text-[13px] tracking-wide text-[var(--color-gold-bright)] backdrop-blur-sm">
                          <Lock className="h-4 w-4" />
                          <span>DEFEATED BY {item.obtainedBy.toUpperCase()}</span>
                        </div>
                      );
                    }
                    if (item?.status === "verified") {
                      if (item.obtainedBy !== displayName) {
                        return (
                          <div className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(157,184,122,0.3)] bg-[rgba(157,184,122,0.08)] px-6 py-2.5 font-bold text-[13px] tracking-wide text-[#c4d8a8]/80 backdrop-blur-md">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>FILED BY {item.obtainedBy?.toUpperCase() ?? "TEAM"}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => setCelebration(selectedLore.id)}
                          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(157,184,122,0.4)] bg-[rgba(157,184,122,0.15)] px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-[#c4d8a8] hover:bg-[rgba(157,184,122,0.25)] backdrop-blur-md transition cursor-pointer"
                        >
                          <Lock className="h-4 w-4" />
                          <span>FILED AND LOCKED · CELEBRATE</span>
                        </button>
                      );
                    }
                    if (item?.status === "obtained") {
                      return (
                        <div className="flex gap-2 w-full">
                          <button
                            type="button"
                            onClick={() => {
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
                      );
                    }
                    if (selectedHolder !== null) {
                      return (
                        <button
                          type="button"
                          disabled
                          aria-label={`Currently attempting by ${selectedHolder}`}
                          className="flex min-h-[48px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-[8px] border border-[var(--color-redline-dim)] bg-[var(--color-bg-0)] px-6 py-2.5 font-[family-name:var(--font-code)] text-[11px] font-bold tracking-[0.1em] text-[var(--color-redline)] uppercase"
                        >
                          <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">CURRENTLY ATTEMPTING BY {selectedHolder.toUpperCase()}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => engage(selectedLore.id)}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[8px] border border-[var(--accent)]/50 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-white font-bold text-[13.5px] tracking-[0.12em] backdrop-blur-md transition-all cursor-pointer active:scale-[0.98] shadow-[0_0_20px_var(--accent-wash)] hover:shadow-[0_0_30px_var(--accent-glow)]"
                      >
                        <span>ENTER CONVERSATION</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    );
                  })()}
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
                const attempt = !isMerchantCard && !filed ? locks[item.id] : undefined;
                const activeBorder = isMerchantCard ? "border-[#f2b632] shadow-[0_0_15px_rgba(242,182,50,0.6)]" : "border-[#ff1e2d] shadow-[0_0_15px_rgba(255,30,45,0.6)]";

                return (
                  <div
                    key={item.id}
                    className="relative flex-1 shrink-0 min-w-[80px] sm:min-w-[95px] lg:min-w-[110px] max-w-[130px] xl:max-w-[145px] pt-5"
                  >
                    {attempt !== undefined && (
                      <div role="status" className="absolute inset-x-0 top-0 z-30 flex min-h-[18px] items-center justify-center gap-1 overflow-hidden border border-[var(--color-redline-dim)] bg-[var(--color-bg-0)] px-1.5 py-0.5 font-[family-name:var(--font-code)] text-[8px] font-bold tracking-[0.08em] text-[var(--color-redline)] uppercase">
                        <Radio className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">CURRENTLY ATTEMPTING BY {attempt.displayName.toUpperCase()}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedBotId(item.id)}
                      onDoubleClick={() => engage(item.id)}
                      className={`group relative block h-[130px] w-full -skew-x-[12deg] overflow-hidden cursor-pointer select-none transition-all duration-300 transform outline-none focus-visible:ring-2 focus-visible:ring-white ${
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
        <div className="relative flex-1 flex flex-col min-h-0">
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Top HUD Header */}
            <header className="relative flex items-center justify-between gap-3 border-b border-white/10 bg-[#050709]/85 px-4 py-3 backdrop-blur-md">
              {/* Upper red tactical line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#ff1e2d] shadow-[0_0_8px_rgba(255,30,45,0.7)]" />

              {/* Left Persona Dossier */}
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => leaveChat()}
                  title="Return to Marks (ESC)"
                  className="flex h-10 px-3 items-center gap-2 border border-white/15 bg-black/60 backdrop-blur-md text-white/70 hover:text-white hover:border-[#ff1e2d] hover:bg-[#ff1e2d]/10 transition-all group"
                >
                  <ArrowLeft className="w-4 h-4 text-[#ff1e2d] group-hover:-translate-x-0.5 transition-transform" />
                  <span className="font-mono text-[11px] font-bold tracking-[0.15em] uppercase hidden sm:inline">MARKS</span>
                </button>

                <span className="relative block w-10 h-10 overflow-hidden border border-[#ff1e2d]/60 bg-black/70 shrink-0 shadow-[0_0_12px_rgba(255,30,45,0.35)]">
                  <img
                    src={CHARACTERS[chattingBotId]?.avatar ?? "/characters/wick.jpg"}
                    alt={chattingBotId}
                    className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`}
                  />
                  <div className="absolute inset-0 border border-white/10 pointer-events-none" />
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-[family-name:var(--font-code)] text-[15px] sm:text-[17px] font-bold tracking-[0.12em] text-white uppercase truncate">
                      {CHARACTERS[chattingBotId]?.name ?? chattingBotId}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Center/Right HUD Telemetry & Actions */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* 8-pip segmented progress bar */}
                {!isMerchant && (
                  <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 border border-white/10 bg-black/60 backdrop-blur-md">
                    <span className="font-mono text-[10px] font-bold tracking-[0.15em] text-white/50 uppercase">
                      COMPLETED {verifiedCount}/8
                    </span>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <span
                          key={i}
                          className={`block h-2 w-3 rounded-none transition-all ${
                            i < verifiedCount
                              ? "bg-[#ff1e2d] shadow-[0_0_8px_rgba(255,30,45,0.8)]"
                              : "bg-white/10"
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
                      className={`flex min-h-[40px] items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase transition ${
                        merchantTab === "counter"
                          ? "border-[#f5b301] bg-[#f5b301]/15 text-[#f5b301] shadow-[0_0_12px_rgba(245,179,1,0.3)]"
                          : "border-white/15 bg-black/50 text-white/60 hover:text-white hover:border-white/30"
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Counter</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMerchantTab("talk")}
                      aria-pressed={merchantTab === "talk"}
                      className={`flex min-h-[40px] items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase transition ${
                        merchantTab === "talk"
                          ? "border-[#f5b301] bg-[#f5b301]/15 text-[#f5b301] shadow-[0_0_12px_rgba(245,179,1,0.3)]"
                          : "border-white/15 bg-black/50 text-white/60 hover:text-white hover:border-white/30"
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
                    className="flex min-h-[40px] items-center gap-2 border border-white/15 bg-black/60 backdrop-blur-md px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] text-white/80 hover:text-white hover:border-[#ff1e2d] hover:bg-[#ff1e2d]/10 transition"
                  >
                    <Package className="h-3.5 w-3.5 text-[#ff1e2d]" />
                    <span>SATCHEL ({inventory.length}/8)</span>
                  </button>
                )}

                <RewindButton botId={chattingBotId} onRewind={rewind} />

                {!isMerchant && chattingBotId !== null && (
                  <button
                    type="button"
                    onClick={() => { openCoverFor(chattingBotId, false, null); }}
                    title="View or update your cover for this mark"
                    className="flex min-h-[40px] items-center gap-2 border border-white/15 bg-black/60 backdrop-blur-md px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.1em] text-white/80 hover:text-white hover:border-[#ff1e2d] hover:bg-[#ff1e2d]/10 transition"
                  >
                    <VenetianMask className="w-3.5 h-3.5 text-[#ff1e2d]" />
                    <span className="hidden sm:inline">COVER</span>
                    {covers[chattingBotId] && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#ff1e2d] shadow-[0_0_6px_rgba(255,30,45,0.9)]" />
                    )}
                  </button>
                )}
              </div>
            </header>

            {isMerchant && merchantTab === "counter" ? (
              <div className="flex-1 overflow-y-auto min-h-0">
                <MerchantCounter inventory={inventory} credits={credits} say={say} displayName={displayName} />
              </div>
            ) : (
              <>
                {/* Tactical Chat Container */}
                <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                  {/* Floating Objective HUD Card (Top Left) */}
                  {!isMerchant && (
                    <div className="pointer-events-none absolute top-4 left-4 z-20 hidden md:block">
                      <div className="pointer-events-auto flex items-start gap-3 p-3 bg-black/80 border border-white/12 backdrop-blur-md max-w-[340px] shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
                        <ShieldAlert className="w-4 h-4 text-[#ff1e2d] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-[#ff5b64] uppercase">MISSION OBJECTIVE</p>
                          <p className="text-[12px] text-white/90 font-medium leading-snug mt-0.5">
                            Gain trust and extract the <span className="text-white font-bold">{CHARACTERS[chattingBotId]?.targetItem.name}</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ambient Telemetry Watermarks */}
                  <div className="pointer-events-none absolute top-4 right-6 z-10 hidden xl:flex flex-col items-end gap-1 font-mono text-[10px] text-white/20 tracking-[0.2em] uppercase select-none">
                    <span>SECURE FREQ // 894.2 MHz</span>
                    <span>ENCRYPT: SHA-256</span>
                  </div>
                  <div className="pointer-events-none absolute bottom-6 right-6 z-10 hidden xl:flex flex-col items-end gap-0.5 font-mono text-[10px] text-white/15 tracking-[0.2em] uppercase select-none">
                    <span>SAME TARGET</span>
                    <span>DIFFERENT MASKS</span>
                  </div>

                  {/* Scrollable Message Feed */}
                  <div className={CHAT_FEED} aria-live="polite" ref={chatFeedRef}>
                    {activeBot?.messages.map((m, idx) => {
                      const isUser = m.role === "user";
                      const canRewind = m.id !== undefined && chattingBotId !== null;
                      const isRewindingThis = m.id !== undefined && rewindingId === m.id;
                      const isLatestBotMsg = !isUser && idx === (activeBot?.messages.length ?? 0) - 1;
                      const isError = m.retryable === true;

                      return (
                        <ChatMessageFrame key={m.id ?? idx} botId={chattingBotId} isUser={isUser} actions={<>
                            {/* Retry button for inference errors */}
                            {isError && chattingBotId !== null && (() => {
                              // Find the last user message before this error
                              let lastUserText = "";
                              for (let j = idx - 1; j >= 0; j--) {
                                if (activeBot.messages[j]?.role === "user") {
                                  lastUserText = activeBot.messages[j]!.text;
                                  break;
                                }
                              }
                              return lastUserText ? (
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity justify-start">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      unlockAudio();
                                      send(chattingBotId, lastUserText);
                                    }}
                                    className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-400 hover:brightness-125 px-1.5 py-0.5 bg-black/60 border border-amber-500/30 transition"
                                    title="Retry this message"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>RETRY</span>
                                  </button>
                                </div>
                              ) : null;
                            })()}
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
                                  className="flex items-center gap-1 font-mono text-[10px] font-bold text-[#ff5b64] hover:brightness-125 px-1.5 py-0.5 bg-black/60 border border-white/10 transition"
                                  title="Rewind to this point in time (-1 ELO)"
                                >
                                  <RotateCcw className={`w-3 h-3 ${isRewindingThis ? "animate-spin" : ""}`} />
                                  <span>{isRewindingThis ? "Rewinding..." : "REWIND TO HERE"}</span>
                                </button>
                              </div>
                            )}
                        </>}>
                          <ChatMarkdown text={m.text} />
                        </ChatMessageFrame>
                      );
                    })}

                    {/* Bot Typing Decrypting Signal */}
                    {activeBot?.typing && activeBot?.streaming === "" && (
                      <div className="self-start flex gap-3">
                        <span className="block w-9 h-9 overflow-hidden shrink-0 border border-white/15 bg-black/60 shadow-[0_0_10px_rgba(0,0,0,0.5)]" aria-hidden="true">
                          <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                        </span>
                        <TypingBubble accentColor={botAccent} />
                      </div>
                    )}

                    {/* Bot Streaming Tokens with Matrix Decode */}
                    {activeBot?.streaming !== "" && activeBot?.streaming !== undefined && (
                      <div className="self-start flex gap-3 max-w-[85%]">
                        <span className="block w-9 h-9 overflow-hidden shrink-0 border border-white/15 bg-black/60 shadow-[0_0_10px_rgba(0,0,0,0.5)]" aria-hidden="true">
                          <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                        </span>
                        <div className="px-4 py-3 border border-white/12 bg-[#080b0f]/85 backdrop-blur-md text-white text-[14.5px] leading-relaxed shadow-[0_8px_32px_rgba(0,0,0,0.7)]">
                          <div className="whitespace-pre-wrap">
                            <ChatMarkdown
                              text={activeBot?.streaming}
                              isStreaming={true}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* In-page Claim Banner if relic is yielded & held */}
                {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "obtained" && i.obtainedBy === displayName) && (() => {
                  const item = inventory.find((i) => i.botId === chattingBotId && i.status === "obtained" && i.obtainedBy === displayName);
                  const lore = CHARACTERS[chattingBotId];
                  return (
                    <div className="border-y border-[rgba(216,155,36,0.55)] bg-[rgba(9,13,18,0.95)] p-3 shadow-[0_0_24px_rgba(216,155,36,0.15)] sm:px-6 z-20">
                      <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 max-w-[860px]">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="relative w-11 h-11 border border-[rgba(216,155,36,0.65)] bg-[rgba(216,155,36,0.15)] p-1 flex items-center justify-center shrink-0">
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
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-gold-bright)] bg-[rgba(216,155,36,0.15)] px-2 py-0.5 border border-[rgba(216,155,36,0.45)]">
                                Relic Secured · Held
                              </span>
                              <span className="text-[12px] text-[var(--color-text-3)] font-mono">
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
                            className="flex min-h-[40px] items-center gap-1.5 border border-[rgba(216,155,36,0.65)] bg-[rgba(216,155,36,0.2)] px-4 py-2 text-[13px] font-bold text-[var(--color-gold-bright)] transition hover:bg-[rgba(216,155,36,0.3)] active:scale-95 cursor-pointer font-mono"
                          >
                            <Gift className="w-4 h-4" />
                            <span>INSPECT / CLAIM</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => engage("merchant")}
                            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 border border-white/20 bg-black/60 px-3 py-2 text-[13px] font-semibold text-white transition hover:border-[#ff1e2d] hover:bg-[#ff1e2d]/10 font-mono"
                          >
                            <span>MERCHANT</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#ff1e2d]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* In-page Verified Banner if relic is already filed */}
                {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "verified" && i.obtainedBy === displayName) && (
                  <div className="border-t border-[#9db87a]/40 bg-[#090d12]/95 px-4 py-2.5 text-center text-[12px] text-white/80 flex items-center justify-center gap-2 z-20">
                    <CheckCircle2 className="w-4 h-4 text-[#9db87a]" />
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

                <ChatComposer draft={draft} onDraft={setDraft} onSubmit={submitChat} disabled={!locked} name={CHARACTERS[chattingBotId]?.name ?? "contact"} />
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
