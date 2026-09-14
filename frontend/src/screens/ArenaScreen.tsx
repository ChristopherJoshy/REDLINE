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
import { AVATAR_FOCUS, CHARACTERS } from "@/data/characterLore";
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
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--color-bg-0)]">
      {/* Sub-header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 sm:px-8">
        <div>
          <p className="font-[family-name:var(--font-code)] text-[11px] tracking-[0.2em] text-[var(--color-text-3)]">
            ROUND 1
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-wide text-[var(--color-text-1)]">
            Marks
          </h2>
          <p className="text-[13px] text-[var(--color-text-3)]">
            Talk to each mark. Bring what they give you to the merchant.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInventoryOpen(true)}
            className="flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[var(--color-border)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] transition"
          >
            <Package className="w-4 h-4 text-[var(--color-brass)]" />
            <span>Satchel ({inventory.length}/8)</span>
          </button>

          <button
            type="button"
            onClick={() => engage("merchant")}
            className="flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-brass-ink)] hover:opacity-90 transition-opacity"
          >
            <Coins className="w-4 h-4" />
            <span>Counter · {credits}</span>
          </button>
        </div>
      </div>

      {chattingBotId === null ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 gap-6 max-w-[1200px] w-full mx-auto">
          {/* Mark list */}
          <section className="lg:col-span-5 flex flex-col gap-3">
            {/* Merchant card — always visible, always stagger-item-0 */}
            <button
              type="button"
              onClick={() => engage("merchant")}
              className="mark-card relative flex items-center gap-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] p-3 text-left transition hover:opacity-95"
            >
              <span className="relative block w-14 h-14 rounded-[6px] overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shrink-0">
                <img
                  src={merchantLore?.avatar ?? "/characters/merchant.jpg"}
                  alt="The Merchant"
                  className="w-full h-full object-cover object-center"
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[var(--color-text-1)] truncate">
                    The Merchant
                  </span>
                  <span className="rounded-[6px] border border-[var(--color-border-strong)] px-2 py-0.5 text-[var(--color-brass-ink)] text-[11px] font-semibold shrink-0">
                    Counter
                  </span>
                </span>
                <span className="block text-[12px] text-[var(--color-text-2)] truncate mt-0.5">
                  Sell relics · buy clues · {credits} credits
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-[var(--color-brass)] shrink-0" aria-hidden="true" />
            </button>

            <div className="flex items-center justify-between pb-1 pt-2">
              <span className="text-[13px] font-semibold text-[var(--color-text-2)]">
                Marks ({ROSTER.length})
              </span>
              <span className="text-[12px] font-semibold text-[var(--color-moss)]">
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
                    className={`mark-card relative flex items-center gap-3 p-3 rounded-[8px] border text-left transition ${
                      filed
                        ? "border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] hover:opacity-95"
                        : isSelected
                          ? "border-[var(--color-border-strong)] bg-[var(--color-surface-1)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    <span className="relative block w-14 h-14 rounded-[6px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0">
                      <img
                        src={lore?.avatar ?? "/characters/wick.jpg"}
                        alt={b.label}
                        className={`w-full h-full object-cover ${lore ? AVATAR_FOCUS[lore.id] : "object-center"}`}
                      />
                      {filed && (
                        <span className="absolute inset-0 bg-black/40 flex items-center justify-center" aria-hidden="true">
                          <Lock className="w-5 h-5 text-[var(--color-surface-1)]" />
                        </span>
                      )}
                    </span>

                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[var(--color-text-1)] truncate">
                          {b.label}
                        </span>
                        {filed ? (
                          <span className="flex items-center gap-1 rounded-[6px] bg-[var(--color-moss)] px-2 py-0.5 text-white text-[11px] font-semibold shrink-0">
                            <Lock className="w-3 h-3" />
                            <span>Filed</span>
                          </span>
                        ) : status === "obtained" ? (
                          <span className="rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-2 py-0.5 text-[var(--color-brass-ink)] text-[11px] font-semibold shrink-0">
                            Held
                          </span>
                        ) : (
                          <span className="rounded-[6px] border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text-3)] text-[11px] font-medium shrink-0">
                            {lore?.difficulty}
                          </span>
                        )}
                      </span>

                      <span className="block text-[12px] text-[var(--color-text-3)] truncate mt-0.5">
                        {filed ? "Closed. Tap to celebrate." : `${lore?.moniker} · ${lore?.role}`}
                      </span>
                      {!filed && (
                        <span className="block text-[12px] font-medium text-[var(--color-text-2)] truncate mt-0.5">
                          {lore?.targetItem.name}
                        </span>
                      )}
                    </span>

                    <ChevronRight className="w-5 h-5 text-[var(--color-text-faint)] shrink-0" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Detail panel */}
          <section ref={detailPanelRef} className="lg:col-span-7 flex flex-col rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 justify-between">
            {selectedLore && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-5 border-b border-[var(--color-border)]">
                  <span className="block w-24 h-24 sm:w-28 sm:h-28 rounded-[8px] overflow-hidden border border-[var(--color-border-strong)] shrink-0 bg-[var(--color-surface-2)]">
                    <img
                      src={selectedLore.heroImage}
                      alt={selectedLore.name}
                      className={`w-full h-full object-cover ${AVATAR_FOCUS[selectedLore.id]}`}
                    />
                  </span>

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="rounded-[6px] border border-[var(--color-border)] px-2.5 py-0.5 text-[var(--color-text-2)] text-[11px] font-medium">
                        {selectedLore.role}
                      </span>
                      <span className="rounded-[6px] border border-[var(--color-border)] px-2.5 py-0.5 text-[var(--color-text-3)] text-[11px]">
                        {selectedLore.difficulty}
                      </span>
                      {getBotItemStatus(selectedLore.id) === "verified" && (
                        <span className="flex items-center gap-1 rounded-[6px] bg-[var(--color-moss)] px-2.5 py-0.5 text-white text-[11px] font-semibold">
                          <Lock className="w-3 h-3" />
                          <span>Filed</span>
                        </span>
                      )}
                    </div>

                    <h2 className="font-[family-name:var(--font-display)] text-[26px] sm:text-[30px] font-bold text-[var(--color-text-1)] leading-tight">
                      {selectedLore.name}
                    </h2>
                    <p className="text-[14px] text-[var(--color-text-2)]">
                      {selectedLore.tagline}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)] flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    <span>RECORD</span>
                  </h4>
                  <p className="text-[14px] leading-relaxed text-[var(--color-text-2)] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-0)] p-4">
                    {selectedLore.backstory}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <h4 className="text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                    ITEM TO BRING BACK
                  </h4>

                  <div className="flex flex-col sm:flex-row items-center gap-4 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] p-4">
                    <img
                      src={selectedLore.targetItem.asset}
                      alt={selectedLore.targetItem.name}
                      className="w-16 h-16 object-contain shrink-0"
                    />
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <span className="font-semibold text-[16px] text-[var(--color-text-1)]">
                          {selectedLore.targetItem.name}
                        </span>
                        <span className="rounded-[6px] border border-[var(--color-border-strong)] px-2 py-0.5 text-[var(--color-brass-ink)] text-[10px] font-semibold">
                          {selectedLore.targetItem.rarity} · {selectedLore.targetItem.category}
                        </span>
                      </div>
                      <p className="text-[13px] text-[var(--color-text-2)] mt-1">
                        {selectedLore.targetItem.description}
                      </p>
                      <p className="mt-2 text-[12px] text-[var(--color-text-2)]">
                        <span className="font-semibold">Tell: </span>
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
                      className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-[6px] bg-[var(--color-moss)] px-6 py-4 font-semibold text-[16px] text-white hover:opacity-90 active:scale-[0.99] transition-opacity"
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
                        className="flex-1 min-h-[52px] flex items-center justify-center gap-2 rounded-[6px] bg-[var(--color-brass)] px-6 py-4 font-bold text-[15px] text-[var(--color-bg-0)] hover:opacity-90 active:scale-[0.99] transition shadow cursor-pointer"
                      >
                        <Gift className="w-5 h-5" />
                        <span>Inspect / Claim Relic</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => engage(selectedLore.id)}
                        className="min-h-[52px] rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-6 py-4 font-semibold text-[15px] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] active:scale-[0.99] transition"
                      >
                        <span>Talk</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => engage(selectedLore.id)}
                      className="w-full min-h-[52px] rounded-[6px] bg-[var(--color-text-1)] px-6 py-4 font-semibold text-[16px] text-[var(--color-bg-0)] hover:opacity-90 active:scale-[0.99] transition-opacity"
                    >
                      <span>Talk to {selectedLore.name}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ── Chat View ── */
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-0)]">
          <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setChattingBotId(null)}
                className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] border border-[var(--color-border)] px-3 py-1.5 font-semibold text-[13px] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Marks</span>
              </button>

              <span className="block w-10 h-10 rounded-[6px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0">
                <img
                  src={CHARACTERS[chattingBotId]?.avatar ?? "/characters/wick.jpg"}
                  alt={chattingBotId}
                  className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`}
                />
              </span>

              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[var(--color-text-1)] truncate">
                  {CHARACTERS[chattingBotId]?.name}
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
                        ? "border-[var(--color-brass)] bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]"
                        : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
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
                        ? "border-[var(--color-brass)] bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]"
                        : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
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
                  className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] border border-[var(--color-border)] px-3 py-1.5 font-semibold text-[12px] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] transition"
                >
                  <Package className="w-4 h-4 text-[var(--color-brass)]" />
                  <span className="hidden sm:inline">Satchel ({inventory.length}/8)</span>
                </button>
              )}

              <RewindButton botId={chattingBotId} onRewind={rewind} />
              {!isMerchant && (
                <button
                  type="button"
                  onClick={() => { setCoverLock(false); setCoverOpen(true); }}
                  title="View or update your cover"
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
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 max-w-[860px] w-full mx-auto" aria-live="polite">
                {activeBot?.messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  const canRewind = m.id !== undefined && chattingBotId !== null;
                  const isRewindingThis = m.id !== undefined && rewindingId === m.id;
                  return (
                    <div
                      key={m.id ?? idx}
                      className={`chat-msg group relative flex gap-3 max-w-[85%] ${isUser ? "self-end flex-row-reverse" : "self-start"}`}
                    >
                      <span className="block w-8 h-8 rounded-[6px] overflow-hidden shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-1)]" aria-hidden="true">
                        {isUser ? (
                          <span className="flex h-full w-full items-center justify-center bg-[var(--color-text-1)] text-[var(--color-bg-0)] text-[11px] font-bold">
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
                          className={`rounded-[8px] px-4 py-3 text-[15px] leading-relaxed relative ${
                            isUser
                              ? "bg-[var(--color-text-1)] text-[var(--color-bg-0)]"
                              : "border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-1)]"
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
                              className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-3)] hover:text-[var(--color-seal)] px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-2)] transition"
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
                    <span className="block w-8 h-8 rounded-[6px] overflow-hidden shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-1)]" aria-hidden="true">
                      <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                    </span>
                    <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                      <TypingBubble />
                    </div>
                  </div>
                )}

                {activeBot?.streaming !== "" && activeBot?.streaming !== undefined && (
                  <div className="self-start flex gap-3 max-w-[85%]">
                    <span className="block w-8 h-8 rounded-[6px] overflow-hidden shrink-0 border border-[var(--color-border)] bg-[var(--color-surface-1)]" aria-hidden="true">
                      <img src={CHARACTERS[chattingBotId]?.avatar} alt="" className={`w-full h-full object-cover ${CHARACTERS[chattingBotId] ? AVATAR_FOCUS[chattingBotId] : "object-center"}`} />
                    </span>
                    <div className="rounded-[8px] px-4 py-3 border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-1)] text-[15px] leading-relaxed">
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
                  <div className="border-t border-b border-[var(--color-brass)] bg-[var(--color-surface-2)] p-3 sm:px-6 shadow-inner">
                    <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 max-w-[860px]">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-11 h-11 rounded-[8px] border border-[var(--color-brass)] bg-[var(--color-surface-1)] p-1 flex items-center justify-center shrink-0">
                          <img
                            src={lore?.targetItem.asset ?? "/items/wick_medallion.svg"}
                            alt=""
                            className="w-full h-full object-contain drop-shadow"
                          />
                          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-brass)]">
                            <Sparkles className="w-2 h-2 text-[var(--color-bg-0)]" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brass-ink)] bg-[var(--color-brass-wash)] px-2 py-0.5 rounded border border-[var(--color-border-strong)]">
                              Relic Secured · Held
                            </span>
                            <span className="text-[12px] text-[var(--color-text-3)]">
                              ~{lore?.targetItem.merchantBounty ?? 100} credits
                            </span>
                          </div>
                          <p className="text-[14px] font-bold text-[var(--color-text-1)] truncate">
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
                          className="flex min-h-[40px] items-center gap-1.5 rounded-[6px] bg-[var(--color-brass)] px-4 py-2 text-[13px] font-bold text-[var(--color-bg-0)] hover:opacity-90 active:scale-95 transition shadow-sm cursor-pointer"
                        >
                          <Gift className="w-4 h-4" />
                          <span>Inspect / Claim</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => engage("merchant")}
                          className="flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-3 py-2 text-[13px] font-semibold text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] transition cursor-pointer"
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
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-center text-[12px] text-[var(--color-text-2)] flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-moss)]" />
                  <span>Relic filed and locked at the Merchant Counter.</span>
                  <button
                    type="button"
                    onClick={() => setCelebration(chattingBotId)}
                    className="underline text-[var(--color-brass-ink)] font-semibold hover:opacity-80 ml-1 cursor-pointer"
                  >
                    Celebrate again
                  </button>
                </div>
              )}

              <form
                onSubmit={submitChat}
                className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 sm:p-4"
              >
                <div className="mx-auto flex w-full max-w-[860px] items-center gap-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!locked}
                    placeholder={locked ? `Write to ${CHARACTERS[chattingBotId]?.name}` : "Paused"}
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
            </>
          )}
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
  );
}
