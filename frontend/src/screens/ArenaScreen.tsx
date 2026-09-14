import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import RewindButton from "@/chat/RewindButton";
import ProfileModal from "@/components/ProfileModal";
import { getCover, type CoverProfile } from "@/api/profiles";
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
  Coins,
  UserCheck,
  MessageSquare,
  VenetianMask,
  Gift,
  Sparkles,
  ArrowRight,
  RotateCcw
} from "lucide-react";

const ROSTER: Array<{ id: BotId; label: string }> = [
  { id: "wick", label: "John Wick" },
  { id: "spidey", label: "Spider-Man" },
  { id: "escanor", label: "Escanor" },
  { id: "stark", label: "Tony Stark" },
  { id: "joker", label: "The Joker" },
  { id: "light", label: "Light Yagami" },
  { id: "levi", label: "Levi Ackerman" },
  { id: "deadpool", label: "Deadpool" },
];

export default function ArenaScreen({ teamId, locked }: { teamId: string; locked: boolean }): React.JSX.Element {
  const { bots, inventory, credits, send, say, rewind } = useBotStream(teamId);
  const [selectedBotId, setSelectedBotId] = useState<BotId>("wick");
  const [chattingBotId, setChattingBotId] = useState<BotId | null>(null);
  const [merchantTab, setMerchantTab] = useState<"counter" | "talk">("counter");
  const [draft, setDraft] = useState("");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [covers, setCovers] = useState<Record<string, CoverProfile | null>>({});
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverLock, setCoverLock] = useState(false);
  const [pendingBot, setPendingBot] = useState<BotId | null>(null);
  const [celebration, setCelebration] = useState<BotId | null>(null);
  const [claimRelic, setClaimRelic] = useState<{ botId: BotId; itemKey: string } | null>(null);
  const [rewindingId, setRewindingId] = useState<number | null>(null);
  const prevInventory = useRef<InventoryDelta[] | null>(null);
  const initialSyncDone = useRef(false);

  // Refs for mark-list stagger
  const markListRef = useRef<HTMLDivElement>(null);
  const prevChattingRef = useRef<BotId | null>(null);

  // Refs for detail panel
  const detailPanelRef = useRef<HTMLElement>(null);
  const prevSelectedBotRef = useRef<BotId>("wick");

  useEffect(() => {
    let dead = false;
    getCover("wick")
      .then((c) => { if (!dead) setCovers((prev) => ({ ...prev, wick: c })); })
      .catch(() => { if (!dead) setCovers((prev) => ({ ...prev, wick: null })); });
    return () => { dead = true; };
  }, []);

  // Handover (claim popup) & Verification (celebration overlay) triggers on inventory change
  useEffect(() => {
    const prev = prevInventory.current;
    prevInventory.current = inventory;
    
    // Ignore the first inventory sync on page load/refresh so existing filed/held relics don't pop up
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      return;
    }

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

  function engage(botId: BotId): void {
    if (getBotItemStatus(botId) === "verified") { setCelebration(botId); return; }
    if (botId === "merchant") { setMerchantTab("counter"); setChattingBotId(botId); return; }
    const coverState = covers[botId];
    if (coverState === null) { setPendingBot(botId); setCoverLock(true); setCoverOpen(true); return; }
    if (coverState === undefined) {
      getCover(botId)
        .then((c) => { setCovers((prev) => ({ ...prev, [botId]: c })); setChattingBotId(botId); })
        .catch(() => { setCovers((prev) => ({ ...prev, [botId]: null })); setPendingBot(botId); setCoverLock(true); setCoverOpen(true); });
      return;
    }
    setChattingBotId(botId);
  }

  const activeBot = chattingBotId === null ? undefined : bots[chattingBotId];
  const commsName = chattingBotId === null ? null : (CHARACTERS[chattingBotId]?.name ?? chattingBotId);
  useDocumentTitle(commsName === null ? "Round 1 · Marks — REDLINE Arena" : `${commsName} — REDLINE Arena`);
  const selectedLore = CHARACTERS[selectedBotId];
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
      <div className="acc-border flex flex-wrap items-center justify-between gap-3 border-b bg-[rgba(5,7,10,0.55)] px-4 py-3 backdrop-blur-sm sm:px-6" style={{ borderBottomColor: "var(--accent-border)" }}>
        <div className="flex items-stretch gap-3">
          <span aria-hidden="true" className="acc-bar block w-[3px] rounded-full" />
          <div>
          <p className="acc-text font-[family-name:var(--font-code)] text-[11px] font-bold tracking-[0.24em]">
            ROUND 1
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-[26px] font-bold tracking-[0.08em] text-white leading-tight">
            MARKS
          </h2>
          <p className="text-[13px] text-[var(--color-text-3)]">
            Talk to each mark. Bring what they give you to the merchant.
          </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInventoryOpen(true)}
            className="redline-panel acc-border flex min-h-[44px] items-center gap-2 rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold text-white transition"
          >
            <Package className="acc-text h-4 w-4" />
            <span>Satchel ({inventory.length}/8)</span>
          </button>

          <button
            type="button"
            onClick={() => engage("merchant")}
            className="redline-gold-card flex min-h-[44px] items-center gap-2 rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-gold-bright)] transition hover:shadow-[0_0_20px_rgba(216,155,36,0.3)]"
          >
            <Coins className="h-4 w-4" />
            <span>Counter · {credits}</span>
          </button>
        </div>
      </div>
      {chattingBotId === null ? (
        <div className="redline-scroll flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto p-4 sm:p-5 gap-4 w-full">
          {/* Mark list */}
          <section className="lg:col-span-5 flex flex-col gap-3">
            {/* Merchant card — always visible, always stagger-item-0 */}
            <button
              type="button"
              onClick={() => engage("merchant")}
              className="mark-card redline-gold-card relative flex items-center gap-3 rounded-[10px] p-3 text-left"
            >
              <span className="relative block w-14 h-14 rounded-[8px] overflow-hidden border border-[rgba(216,155,36,0.5)] shrink-0">
                <img
                  src={merchantLore?.avatar ?? "/characters/merchant.jpg"}
                  alt="The Merchant"
                  className="w-full h-full object-cover object-center"
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-[family-name:var(--font-display)] text-[16px] font-bold tracking-[0.06em] text-white truncate">
                    THE MERCHANT
                  </span>
                  <span className="rounded-[6px] border border-[rgba(216,155,36,0.5)] bg-[rgba(216,155,36,0.12)] px-2 py-0.5 text-[var(--color-gold-bright)] text-[11px] font-semibold shrink-0">
                    Counter
                  </span>
                </span>
                <span className="block text-[12px] text-[var(--color-text-3)] truncate mt-0.5">
                  Sell relics · buy clues · {credits} credits
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-[var(--color-gold-bright)] shrink-0" aria-hidden="true" />
            </button>

            <div className="flex items-center justify-between pb-1 pt-2">
              <span className="text-[13px] font-semibold text-[var(--color-text-2)]">
                Marks ({ROSTER.length})
              </span>
              <span className="font-[family-name:var(--font-code)] text-[12px] font-semibold text-[#9db87a]">
                {verifiedCount} filed
              </span>
            </div>
            <div ref={markListRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              {ROSTER.map((b) => {
                const lore = CHARACTERS[b.id];
                const status = getBotItemStatus(b.id);
                const isSelected = selectedBotId === b.id;
                const filed = status === "verified";

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => (filed ? setCelebration(b.id) : setSelectedBotId(b.id))}
                    onDoubleClick={() => engage(b.id)}
                    aria-pressed={isSelected}
                    className={`mark-card relative flex items-center gap-3 p-3 rounded-[10px] border text-left ${
                      filed
                        ? "border-[rgba(157,184,122,0.35)] bg-[rgba(157,184,122,0.07)]"
                        : isSelected
                          ? "redline-selected"
                          : "redline-panel acc-border"
                    }`}
                  >
                    <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border border-[rgba(255,255,255,0.12)]">
                      <img
                        src={lore?.avatar ?? "/characters/wick.jpg"}
                        alt={b.label}
                        className={`h-full w-full object-cover ${lore ? AVATAR_FOCUS[lore.id] : "object-center"}`}
                      />
                      {filed && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55" aria-hidden="true">
                          <Lock className="h-5 w-5 text-[#9db87a]" />
                        </span>
                      )}
                      {isSelected && !filed && (
                        <span aria-hidden="true" className="acc-bar absolute inset-y-0 left-0 w-[3px]" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-[family-name:var(--font-display)] text-[15px] font-bold tracking-[0.05em] text-white">
                          {b.label.toUpperCase()}
                        </span>
                        {filed ? (
                          <span className="flex shrink-0 items-center gap-1 rounded-[6px] border border-[rgba(157,184,122,0.45)] bg-[rgba(157,184,122,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#b8d097]">
                            <Lock className="h-3 w-3" />
                            <span>Filed</span>
                          </span>
                        ) : status === "obtained" ? (
                          <span className="shrink-0 rounded-[6px] border border-[rgba(216,155,36,0.5)] bg-[rgba(216,155,36,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-gold-bright)]">
                            Held
                          </span>
                        ) : lore?.difficulty === "Normal" ? (
                          <span className="shrink-0 rounded-[6px] border border-[rgba(138,180,214,0.4)] bg-[rgba(138,180,214,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#9cc3e5]">
                            Normal
                          </span>
                        ) : lore?.difficulty === "Master" ? (
                          <span className="shrink-0 rounded-[6px] border border-[rgba(168,130,255,0.45)] bg-[rgba(168,130,255,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#c4a8ff]">
                            Master
                          </span>
                        ) : lore?.difficulty === "Legendary" ? (
                          <span className="shrink-0 rounded-[6px] border border-[rgba(216,155,36,0.5)] bg-[rgba(216,155,36,0.12)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-gold-bright)]">
                            Legendary
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-[6px] border border-[rgba(255,30,45,0.45)] bg-[rgba(255,30,45,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#ff8087]">
                            {lore?.difficulty}
                          </span>
                        )}
                      </span>

                      <span className="mt-0.5 block truncate text-[12px] text-[var(--color-text-3)]">
                        {filed ? "Closed. Tap to celebrate." : `${lore?.moniker} · ${lore?.role}`}
                      </span>
                      {!filed && (
                        <span className={`mt-0.5 block truncate text-[12px] font-medium ${isSelected ? "acc-text" : "text-[var(--color-text-2)]"}`}>
                          {lore?.targetItem.name}
                        </span>
                      )}
                    </span>

                    <ChevronRight className={`h-5 w-5 shrink-0 ${isSelected ? "acc-text" : "text-[var(--color-text-faint)]"}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Detail panel */}
          <section
            ref={detailPanelRef}
            className="relative lg:col-span-7 flex flex-col rounded-[12px] justify-between overflow-hidden border border-[rgba(255,255,255,0.1)] bg-[rgba(9,13,18,0.35)] backdrop-blur-[2px]"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={
                detailBg === undefined
                  ? { background: "radial-gradient(900px 320px at 85% 0%, var(--accent-glow), transparent 65%)" }
                  : { backgroundImage: `url("${detailBg}")`, backgroundSize: "cover", backgroundPosition: "center 20%" }
              }
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(5,7,10,0.55)] via-[rgba(5,7,10,0.25)] to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(5,7,10,0.55)] via-transparent to-[rgba(5,7,10,0.15)]" />
            {selectedLore && (
              <div className="relative flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start gap-4 pb-4 border-b border-[rgba(255,255,255,0.08)]">
                  <span className="acc-border acc-glow block w-20 h-20 sm:w-24 sm:h-24 rounded-[10px] overflow-hidden border shrink-0">
                    <img
                      src={selectedLore.heroImage}
                      alt={selectedLore.name}
                      className={`w-full h-full object-cover ${AVATAR_FOCUS[selectedLore.id]}`}
                    />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="redline-chip rounded-[6px] px-2.5 py-0.5 text-[var(--color-text-2)] text-[11px] font-semibold">
                        {selectedLore.role}
                      </span>
                      <span className="acc-wash rounded-[6px] border px-2.5 py-0.5 text-[11px] font-semibold">
                        {selectedLore.difficulty}
                      </span>
                      {getBotItemStatus(selectedLore.id) === "verified" && (
                        <span className="flex items-center gap-1 rounded-[6px] border border-[rgba(157,184,122,0.45)] bg-[rgba(157,184,122,0.12)] px-2.5 py-0.5 text-[#b8d097] text-[11px] font-semibold">
                          <Lock className="w-3 h-3" />
                          <span>Filed</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-4">
                    <h2 className="font-[family-name:var(--font-display)] text-[30px] sm:text-[36px] font-bold tracking-[0.04em] text-white leading-none">
                      {selectedLore.name.toUpperCase()}
                    </h2>
                    <span aria-hidden="true" className="acc-text hidden max-w-[180px] pt-1 text-right font-[family-name:var(--font-code)] text-[10px] leading-relaxed tracking-[0.28em] opacity-70 sm:block">
                      {(selectedLore.moniker.toUpperCase().split("·")[0] ?? "").trim()}
                    </span>
                    </div>
                    <p className="mt-1 text-[14px] text-[var(--color-text-2)]">
                      {selectedLore.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.22em] text-[var(--color-text-3)]">
                    <MessageSquare className="acc-text h-4 w-4" />
                    <span>RECORD</span>
                  </h4>
                  <p className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(5,7,10,0.45)] p-4 text-[13.5px] leading-relaxed text-[var(--color-text-2)] backdrop-blur-sm">
                    {selectedLore.backstory}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-[11px] font-bold tracking-[0.22em] text-[var(--color-text-3)]">
                    ✦ ITEM TO BRING BACK
                  </h4>
                  <div className="flex flex-col sm:flex-row items-center gap-4 rounded-[10px] border border-[rgba(216,155,36,0.35)] bg-[rgba(9,13,18,0.55)] p-4 backdrop-blur-sm">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.08)] p-2 shadow-[0_0_18px_rgba(216,155,36,0.2)]">
                    <img
                      src={selectedLore.targetItem.asset}
                      alt={selectedLore.targetItem.name}
                      className="h-full w-full object-contain"
                    />
                    </span>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <span className="font-semibold text-[16px] text-white">
                          {selectedLore.targetItem.name}
                        </span>
                        <span className="rounded-[6px] border border-[rgba(216,155,36,0.5)] bg-[rgba(216,155,36,0.12)] px-2 py-0.5 text-[var(--color-gold-bright)] text-[10px] font-semibold">
                          {selectedLore.targetItem.rarity} · {selectedLore.targetItem.category}
                        </span>
                      </div>
                      <p className="text-[13px] text-[var(--color-text-2)] mt-1">
                        {selectedLore.targetItem.description}
                      </p>
                      <p className="mt-2 text-[12px] text-[var(--color-text-3)]">
                        <span className="font-semibold text-[var(--color-text-2)]">Tell: </span>
                        {selectedLore.targetItem.authenticityTell}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  {getBotItemStatus(selectedLore.id) === "verified" ? (
                    <button
                      type="button"
                      onClick={() => setCelebration(selectedLore.id)}
                      className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-[8px] border border-[rgba(157,184,122,0.45)] bg-[rgba(157,184,122,0.12)] px-6 py-4 font-semibold text-[15px] text-[#c4d8a8] transition hover:bg-[rgba(157,184,122,0.2)] active:scale-[0.99]"
                    >
                      <Lock className="w-5 h-5" />
                      <span>Filed and locked · celebrate again</span>
                    </button>
                  ) : getBotItemStatus(selectedLore.id) === "obtained" ? (
                    <div className="flex flex-col sm:flex-row gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          const item = inventory.find((i) => i.botId === selectedLore.id && i.status === "obtained");
                          if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                        }}
                        className="flex min-h-[52px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[rgba(216,155,36,0.55)] bg-[rgba(216,155,36,0.14)] px-6 py-4 text-[15px] font-bold text-[var(--color-gold-bright)] shadow-[0_0_20px_rgba(216,155,36,0.2)] transition hover:bg-[rgba(216,155,36,0.22)] active:scale-[0.99]"
                      >
                        <Gift className="w-5 h-5" />
                        <span>Inspect / Claim Relic</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => engage(selectedLore.id)}
                        className="redline-panel acc-border min-h-[52px] rounded-[8px] px-6 py-4 font-semibold text-[15px] text-white transition active:scale-[0.99]"
                      >
                        <span>Talk</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => engage(selectedLore.id)}
                      className="redline-cta flex w-full min-h-[52px] items-center justify-between rounded-[8px] px-6 py-4 font-semibold text-[16px]"
                    >
                      <span className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        <span>Talk to {selectedLore.name}</span>
                      </span>
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ── Chat View ── */
        <div className="relative flex-1 flex flex-col min-h-0">
          <div className="relative flex min-h-0 flex-1 flex-col">
          <header className="acc-border flex items-center justify-between gap-2 border-b bg-[rgba(5,7,10,0.6)] px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setChattingBotId(null)}
                className="redline-chip acc-border flex min-h-[44px] items-center gap-1.5 rounded-[6px] px-3 py-1.5 font-semibold text-[13px] text-[var(--color-text-2)] transition hover:text-white"
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
              {!isMerchant && (
                <button
                  type="button"
                  onClick={() => { setCoverLock(false); setCoverOpen(true); }}
                  title="View or update your cover"
                  className="redline-chip acc-border flex min-h-[44px] items-center gap-1.5 rounded-[6px] px-3 py-1.5 font-semibold text-[12px] text-white transition"
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

      {coverOpen && pendingBot !== null && (
        <ProfileModal
          botId={pendingBot}
          lockCreate={coverLock}
          onClose={() => { setCoverOpen(false); setCoverLock(false); setPendingBot(null); }}
          onSaved={(profile, isNew) => {
            setCovers((prev) => ({ ...prev, [profile.bot_id]: profile }));
            setCoverOpen(false);
            setCoverLock(false);
            if (pendingBot !== null) {
              setChattingBotId(pendingBot);
              setPendingBot(null);
            }
          }}
        />
      )}
      </div>
    </div>
  );
}
