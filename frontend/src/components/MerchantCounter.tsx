import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import type { BotId, InventoryDelta } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import { buyClue, merchantState, submitItem } from "@/api/merchant";
import { AlertTriangle, CheckCircle2, Coins, Scale } from "lucide-react";
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
  const receiptIconRef = useRef<HTMLElement>(null); // SVG parent span
  const eloRef = useRef<HTMLParagraphElement>(null);

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

  // Receipt pop animation when receipt changes to non-null
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
    // ELO flash
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
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-1)]">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
            <Scale className="w-4 h-4" />
            <span>COUNTER</span>
          </h4>
          <span className="flex items-center gap-1.5 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-3 py-1 font-[family-name:var(--font-code)] text-[13px] font-semibold text-[var(--color-brass-ink)]">
            <Coins className="w-4 h-4" />
            <span>{credits} credits</span>
          </span>
        </div>

        {held.length === 0 ? (
          <p className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-0)] p-4 text-[13px] text-[var(--color-text-3)]">
            Nothing to sell. Talk to a mark and bring back what they give you.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {held.map((item) => {
              const lore = CHARACTERS[item.botId];
              return (
                <div
                  key={item.itemKey}
                  className="flex items-center gap-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-0)] p-3"
                >
                  {lore !== undefined && (
                    <img src={lore.targetItem.asset} alt="" className="h-12 w-12 shrink-0 object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[var(--color-text-1)]">
                      {itemName(item)}
                    </p>
                    <p className="truncate text-[12px] text-[var(--color-text-3)]">
                      From {lore?.name ?? item.botId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void sell(item)}
                    disabled={busyKey !== null}
                    className="min-h-[44px] shrink-0 rounded-[6px] bg-[var(--color-text-1)] px-4 py-2 text-[13px] font-semibold text-[var(--color-bg-0)] hover:opacity-90 disabled:opacity-50 transition-opacity active:scale-[0.98]"
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
                ? "border-[var(--color-moss-border)] bg-[var(--color-moss-wash)]"
                : "border-[var(--color-seal)] bg-[var(--color-seal-wash)]"
            }`}
            style={{ opacity: reducedMotion() ? 1 : 0 }}
          >
            <div className="flex items-start gap-3">
              <span ref={receiptIconRef as React.RefObject<HTMLSpanElement>}>
                {receipt.ok ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-moss)]" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-seal)]" />
                )}
              </span>
              <div>
                <p className="text-[12px] font-semibold tracking-[0.14em] opacity-80">
                  {receipt.title.toUpperCase()}
                </p>
                <p className="mt-1 text-[14px] text-[var(--color-text-1)]">{receipt.line}</p>
                {receipt.flash !== "" && (
                  <p
                    ref={eloRef}
                    className="mt-1 font-[family-name:var(--font-code)] text-[13px] font-bold text-[var(--color-moss)]"
                    style={{ opacity: reducedMotion() ? 1 : 0 }}
                  >
                    {receipt.flash}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
            CLUE BOARD · EARN CREDITS BY SELLING GENUINE ARTICLES
          </h4>
          {shopError !== "" && (
            <p role="alert" className="rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3 py-2 text-[13px] font-semibold text-[var(--color-seal)]">
              {shopError}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {R1_MARKS.map((id) => {
              const lore = CHARACTERS[id];
              const filed = statusOf(id) === "verified";
              return (
                <div key={id} className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-0)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[14px] font-semibold text-[var(--color-text-1)]">
                      {lore?.name ?? id}
                    </p>
                    {filed && (
                      <span className="shrink-0 rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-moss)]">
                        Filed
                      </span>
                    )}
                  </div>
                  {filed ? (
                    <p className="mt-1 text-[12px] text-[var(--color-text-3)]">Closed. No clues needed.</p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {TIERS.map((t) => {
                        const text = owned[id]?.[t.tier];
                        if (text !== undefined && text !== "") {
                          return (
                            <p key={t.tier} className="rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] p-2 text-[12px] text-[var(--color-text-1)]">
                              <span className="font-semibold">{t.label}: </span>
                              {text}
                            </p>
                          );
                        }
                        if (text !== undefined) {
                          return (
                            <button
                              key={t.tier}
                              type="button"
                              onClick={() => void buy(id, t.tier, t.label)}
                              disabled={busyKey !== null}
                              className="flex min-h-[44px] items-center justify-between gap-2 rounded-[6px] border border-[var(--color-border)] px-3 py-1.5 text-[13px] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                            >
                              <span className="font-medium text-[var(--color-text-1)]">{t.label} · owned</span>
                              <span className="font-semibold text-[var(--color-brass-ink)]">
                                {busyKey === `${id}:${t.tier}` ? "Reading" : "Show again"}
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
                            className="flex min-h-[44px] items-center justify-between gap-2 rounded-[6px] border border-[var(--color-border)] px-3 py-1.5 text-[13px] transition hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                          >
                            <span className="font-medium text-[var(--color-text-1)]">{t.label}</span>
                            <span className="font-[family-name:var(--font-code)] font-semibold text-[var(--color-brass-ink)]">
                              {busyKey === `${id}:${t.tier}` ? "Buying" : `${t.cost} credits`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
