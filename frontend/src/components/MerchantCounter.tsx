import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import type { BotId, InventoryDelta } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import { buyClue, merchantState, submitItem } from "@/api/merchant";
import { AlertTriangle, CheckCircle2, Coins } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

const R1_MARKS: BotId[] = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool"];
const TIERS = [
  { tier: 1, label: "Angle", cost: 30 },
  { tier: 2, label: "Decisive detail", cost: 60 },
];

interface Receipt {
  ok: boolean;
  title: string;
  line: string;
  flash: string;
  detail?: string;
}

export default function MerchantCounter({
  inventory,
  credits,
  say,
}: {
  inventory: InventoryDelta[];
  credits: number;
  say: (botId: BotId, text: string) => void;
}): React.JSX.Element {
  const [owned, setOwned] = useState<Record<string, Record<number, string>>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [shopError, setShopError] = useState("");

  const receiptRef = useRef<HTMLDivElement>(null);
  const receiptIconRef = useRef<HTMLElement>(null);
  const eloRef = useRef<HTMLParagraphElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    merchantState()
      .then((s) => {
        if (dead) return;
        const map: Record<string, Record<number, string>> = {};
        for (const c of s.clues) {
          map[c.botId] = { ...(map[c.botId] ?? {}), [c.tier]: "" };
        }
        setOwned(map);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (!reducedMotion() && rowsRef.current) {
      animate(Array.from(rowsRef.current.children), {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: DUR.panel,
        delay: stagger(40),
        ease: EASE.out,
      });
    }
  }, []);

  useEffect(() => {
    if (receipt === null || reducedMotion()) return;
    const rEl = receiptRef.current;
    const iEl = receiptIconRef.current;
    if (rEl) {
      animate(rEl, {
        scale: [0.94, 1],
        opacity: [0, 1],
        duration: DUR.panel,
        ease: EASE.snap,
      });
    }
    if (iEl) {
      animate(iEl, {
        rotate: [receipt.ok ? -12 : 10, 0],
        scale: [0.5, 1],
        duration: DUR.panel,
        ease: EASE.spring,
      });
    }
    if (receipt.ok && receipt.flash !== "" && eloRef.current) {
      animate(eloRef.current, {
        scale: [1.4, 1],
        opacity: [0, 1],
        duration: DUR.slow,
        ease: EASE.spring,
      });
    }
  }, [receipt]);

  const held = inventory.filter((i) => i.status === "obtained");

  function itemName(item: InventoryDelta): string {
    return CHARACTERS[item.botId]?.targetItem.name ?? item.itemKey;
  }

  async function sell(item: InventoryDelta): Promise<void> {
    if (busyKey !== null) return;
    setBusyKey(item.itemKey);
    setReceipt(null);
    try {
      const res = await submitItem(item.itemKey);
      if (res.result === "verified") {
        setReceipt({
          ok: true,
          title: "Genuine article",
          line: `${itemName(item)} is filed. The mark is closed.`,
          flash: typeof res.eloDelta === "number" ? `+${res.eloDelta} ELO` : "",
          ...(typeof res.completionRank === "number" ? {
            detail: `#${res.completionRank} fastest for this mark${res.speedBonus ? ` · +${res.speedBonus} speed bonus` : ""}`,
          } : {}),
        });
      } else {
        setReceipt({ ok: false, title: "Not genuine", line: res.line, flash: "" });
        say("merchant", res.line);
      }
    } catch (err) {
      setReceipt({ ok: false, title: "Counter closed", line: err instanceof Error ? err.message : "Sale failed", flash: "" });
    } finally {
      setBusyKey(null);
    }
  }

  async function buy(botId: BotId, tier: number, label: string): Promise<void> {
    if (busyKey !== null) return;
    setBusyKey(`${botId}:${tier}`);
    setShopError("");
    try {
      const res = await buyClue(botId, tier);
      setOwned((prev) => ({ ...prev, [botId]: { ...(prev[botId] ?? {}), [tier]: res.clue } }));
      const mark = CHARACTERS[botId]?.name ?? botId;
      say("merchant", res.owned ? `That ${label} for ${mark} is already yours: ${res.clue}` : `Sold. Sealed ${label} for ${mark}: ${res.clue}`);
    } catch (err) {
      setShopError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusyKey(null);
    }
  }

  function statusOf(botId: BotId): string | undefined {
    return inventory.find((i) => i.botId === botId)?.status;
  }

  return (
    <div className="flex h-full w-full items-start justify-center p-4 sm:p-8 overflow-y-auto min-h-0 bg-transparent">
      <div className="w-full max-w-[860px] rounded-[8px] border border-border bg-surface-1 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-surface-1/50 pointer-events-none" />
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="h-[2px] w-[18px] bg-brass-wash rounded-full " />
            <h4 className="text-[13px] font-bold tracking-[0.2em] text-text-1">
              COUNTER
            </h4>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-4 py-1.5 font-[family-name:var(--font-code)] text-[12.5px] font-semibold text-[var(--color-gold-bright)]">
            <Coins className="w-4 h-4" />
            <span>{credits} credits</span>
          </span>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-8 p-6">
          {/* Held Items / Receipt */}
          <div className="flex flex-col gap-4">
            {held.length === 0 ? (
              <p className="rounded-[8px] border border-border bg-surface-2 p-4 text-[13px] text-[var(--color-text-3)] text-center sm:text-left">
                Nothing to sell. Talk to a mark and bring back what they give you.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {held.map((item) => {
                  const lore = CHARACTERS[item.botId];
                  return (
                    <div
                      key={item.itemKey}
                      className="flex items-center justify-between gap-4 rounded-[8px] border border-border bg-surface-2/[0.03] p-3 transition hover:bg-surface-2/[0.05]"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        {lore !== undefined && (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-1 p-1.5">
                            <img src={lore.targetItem.asset} alt="" className="h-full w-full object-contain " />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-text-1">
                            {itemName(item)}
                          </p>
                          <p className="truncate text-[12px] text-[var(--color-text-3)]">
                            Acquired from {lore?.name ?? item.botId}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void sell(item)}
                        disabled={busyKey !== null}
                        className="redline-cta min-h-[44px] shrink-0 rounded-[6px] px-5 py-2 text-[13px] font-bold disabled:opacity-50 active:scale-[0.98]"
                      >
                        {busyKey === item.itemKey ? "Weighing" : "Lay on counter"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {receipt !== null && (
              <div
                ref={receiptRef}
                className={`rounded-[8px] border p-4 ${
                  receipt.ok
                    ? "border-border bg-surface-1"
                    : "border-border bg-surface-1"
                }`}
                style={{ opacity: reducedMotion() ? 1 : 0 }}
              >
                <div className="flex items-start gap-3">
                  <span ref={receiptIconRef as React.RefObject<HTMLSpanElement>}>
                    {receipt.ok ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-moss" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brass" />
                    )}
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                      {receipt.title.toUpperCase()}
                    </p>
                    <p className="mt-1 text-[14px] text-text-1">{receipt.line}</p>
                    {receipt.flash !== "" && (
                      <p
                        ref={eloRef}
                        className="mt-1 font-[family-name:var(--font-code)] text-[13px] font-bold text-moss"
                        style={{ opacity: reducedMotion() ? 1 : 0 }}
                      >
                        {receipt.flash}
                      </p>
                    )}
                    {receipt.detail !== undefined && <p className="mt-1 text-[12px] text-text-3">{receipt.detail}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Clue Board */}
          <div className="flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
              <h4 className="text-[13.5px] font-bold tracking-[0.15em] text-text-1">
                CLUE BOARD
              </h4>
              <span className="hidden sm:inline text-[13.5px] text-[var(--color-text-3)]">·</span>
              <p className="text-[12.5px] text-[var(--color-text-3)]">
                Earn credits by selling genuine articles
              </p>
            </div>
            
            {shopError !== "" && (
              <p role="alert" className="mb-4 rounded-[6px] border border-border bg-surface-1 px-4 py-2.5 text-[13px] font-semibold text-text-1">
                {shopError}
              </p>
            )}
            
            <div ref={rowsRef} className="flex flex-col border-t border-border">
              {R1_MARKS.map((id) => {
                const lore = CHARACTERS[id];
                const filed = statusOf(id) === "verified";
                
                return (
                  <div key={id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3.5 border-b border-border hover:bg-surface-2/[0.015] transition-colors group px-2 -mx-2 rounded-[6px]">
                    <div className="flex items-center gap-4 min-w-[200px]">
                      {lore && (
                        <div className="h-[42px] w-[42px] shrink-0 rounded-[6px] overflow-hidden bg-surface-1 border border-border ">
                          <img src={lore.avatar} alt={lore.name} className="h-full w-full object-cover object-top filter group-hover:brightness-110 transition-all" />
                        </div>
                      )}
                      <p className="text-[14.5px] font-semibold text-text-1 whitespace-nowrap">
                        {lore?.name ?? id}
                      </p>
                      {filed && (
                        <span className="ml-2 rounded-[4px] border border-moss-border bg-moss-wash px-2 py-0.5 text-[11px] font-semibold text-moss uppercase tracking-wider">
                          Filed
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto">
                      {filed ? (
                        <span className="text-[var(--color-text-3)] mr-4">—</span>
                      ) : (
                        TIERS.map((t) => {
                          const text = owned[id]?.[t.tier];
                          const isOwned = text !== undefined;
                          
                          if (isOwned && text !== "") {
                            return (
                              <div key={t.tier} className="flex-1 sm:flex-none flex items-center justify-between min-w-[170px] rounded-[6px] border border-border bg-surface-1 px-3 py-2 text-[12.5px]">
                                <span className="font-semibold text-[var(--color-gold-bright)]">{t.label}</span>
                                <span className="text-[var(--color-text-3)] ml-3 truncate max-w-[100px] sm:max-w-none" title="See chat for full detail">Acquired</span>
                              </div>
                            );
                          }
                          if (isOwned) {
                            return (
                              <button
                                key={t.tier}
                                type="button"
                                onClick={() => void buy(id, t.tier, t.label)}
                                disabled={busyKey !== null}
                                className="flex-1 sm:flex-none flex items-center justify-between min-w-[170px] rounded-[6px] border border-border bg-surface-2 px-4 py-2 hover:bg-surface-2 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                <span className="text-[12.5px] font-medium text-text-1">{t.label}</span>
                                <span className="text-[12px] font-semibold text-[var(--color-text-3)] ml-4">
                                  {busyKey === `${id}:${t.tier}` ? "Reading..." : "Owned"}
                                </span>
                              </button>
                            );
                          }
                          
                          return (
                            <button
                              key={t.tier}
                              type="button"
                              onClick={() => void buy(id, t.tier, t.label)}
                              disabled={busyKey !== null || credits < t.cost}
                              className="group/btn flex-1 sm:flex-none flex items-center justify-between min-w-[170px] rounded-[6px] border border-border bg-surface-2/[0.03] px-4 py-2 hover:bg-surface-2/[0.07] hover:border-border transition-all disabled:opacity-50 cursor-pointer"
                            >
                              <span className="text-[12.5px] font-medium text-text-1 group-hover/btn:text-text-1 transition-colors">{t.label}</span>
                              <span className="font-[family-name:var(--font-code)] text-[12px] font-semibold text-[var(--color-gold-bright)] ml-4">
                                {busyKey === `${id}:${t.tier}` ? "..." : `${t.cost} credits`}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
