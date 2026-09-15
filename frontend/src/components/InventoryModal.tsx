import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import type { InventoryDelta } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import {
  X,
  ShieldCheck,
  AlertCircle,
  Package,
  Coins
} from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryDelta[];
  credits: number;
  onOpenMerchant?: () => void;
}

export default function InventoryModal({
  isOpen,
  onClose,
  inventory,
  credits,
  onOpenMerchant,
}: InventoryModalProps): React.JSX.Element | null {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Slot grid stagger on open
  useEffect(() => {
    if (!isOpen) return;
    if (reducedMotion()) return;

    // Small rAF delay to ensure DOM has rendered
    const frame = requestAnimationFrame(() => {
      const slots = gridRef.current?.querySelectorAll<HTMLButtonElement>(".inv-slot");
      if (!slots || slots.length === 0) return;
      animate(Array.from(slots), {
        scale: [0.82, 1],
        opacity: [0, 1],
        delay: stagger(38, { from: "first" }),
        duration: DUR.panel,
        ease: EASE.snap,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Aside slide when selection changes
  useEffect(() => {
    if (!isOpen || !selectedKey) return;
    if (reducedMotion()) return;
    animate(asideRef.current!, {
      opacity: [0, 1],
      translateX: [10, 0],
      duration: DUR.panel,
      ease: EASE.settle,
    });
  }, [selectedKey, isOpen]);

  // Empty-slot breathing pulse (loop) — "waiting" feel not placeholder
  useEffect(() => {
    if (!isOpen || reducedMotion()) return;
    const empties = gridRef.current?.querySelectorAll<HTMLButtonElement>(".inv-slot-empty");
    if (!empties || empties.length === 0) return;
    const anim = animate(Array.from(empties), {
      opacity: [0.35, 0.65],
      duration: 1800,
      delay: stagger(220, { from: "center" }),
      direction: "alternate",
      loop: true,
      ease: EASE.inOut,
    });
    return () => { anim.pause(); };
  }, [isOpen, inventory.length]);

  if (!isOpen) return null;

  const enrichedItems = inventory.filter((inv) => inv.status !== "locked").map((inv) => {
    const char = CHARACTERS[inv.botId];
    const itemMeta = char?.targetItem;
    return {
      botId: inv.botId,
      botName: char?.name ?? inv.botId,
      itemKey: inv.itemKey,
      status: inv.status,
      name: itemMeta?.name ?? inv.itemKey,
      category: itemMeta?.category ?? "Relic",
      rarity: itemMeta?.rarity ?? "Rare",
      asset: itemMeta?.asset ?? "/items/wick_medallion.svg",
      description: itemMeta?.description ?? "An item brought back from a mark.",
      authenticityTell: itemMeta?.authenticityTell ?? "Check against the merchant ledger.",
      decoyWarning: itemMeta?.decoyWarning ?? "The merchant rejects decoys.",
      bounty: itemMeta?.merchantBounty ?? 100,
    };
  });

  const selectedItem =
    enrichedItems.find((i) => i.itemKey === selectedKey) ?? enrichedItems[0] ?? null;

  const totalSlots = 8;
  const slots = Array.from({ length: totalSlots }).map((_, idx) => {
    return enrichedItems[idx] ?? null;
  });

  const verifiedCount = enrichedItems.filter((i) => i.status === "verified").length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inv-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        ref={modalRef}
        className="redline-panel relative flex w-full max-w-[960px] h-[90vh] max-h-[700px] flex-col overflow-hidden rounded-[12px]"
      >
        <header className="flex items-center justify-between border-b border-[rgba(255,30,45,0.25)] bg-[rgba(5,7,10,0.7)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[rgba(255,30,45,0.45)] bg-[rgba(255,30,45,0.12)] text-[#ff5b64]">
              <Package className="w-5 h-5" />
            </span>
            <div>
              <h2 id="inv-title" className="font-[family-name:var(--font-display)] text-[20px] font-bold text-[var(--color-text-1)]">
                Satchel
              </h2>
              <span className="text-[12px] text-[var(--color-text-3)]">
                Filed {verifiedCount} of 8 · Holding {enrichedItems.length} of 8
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(216,155,36,0.5)] bg-[rgba(216,155,36,0.12)] px-3 py-1 text-[13px] font-semibold text-[var(--color-gold-bright)] font-[family-name:var(--font-code)]">
              <Coins className="w-4 h-4" />
              <span>{credits} credits</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] rounded-[6px] p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition"
              aria-label="Close satchel"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
          <main className="flex flex-col p-4 sm:p-6 overflow-y-auto md:col-span-7">
            <div className="mb-3 flex items-center justify-between text-[13px] text-[var(--color-text-3)]">
              <span>Items</span>
              <span className="font-[family-name:var(--font-code)]">
                {enrichedItems.length} held
              </span>
            </div>

            <div ref={gridRef} className="grid grid-cols-4 gap-3">
              {slots.map((item, index) => {
                const isSelected = item !== null && item.itemKey === selectedItem?.itemKey;
                const isEmpty = item === null;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => item && setSelectedKey(item.itemKey)}
                    disabled={!item}
                    aria-label={item ? item.name : `Empty slot ${index + 1}`}
                    className={`inv-slot relative flex aspect-square flex-col items-center justify-center rounded-[8px] border p-2 transition ${
                      isEmpty
                        ? "inv-slot-empty cursor-default border-dashed border-[var(--color-border)]"
                        : isSelected
                          ? "border-[var(--color-brass)] bg-[var(--color-brass-wash)]"
                          : "border-[var(--color-border)] bg-[var(--color-bg-0)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    {item ? (
                      <>
                        <img
                          src={item.asset}
                          alt=""
                          className="h-12 w-12 object-contain"
                        />
                        <span className="mt-1 max-w-full truncate text-center text-[10px] font-semibold text-[var(--color-text-1)]">
                          {item.name}
                        </span>

                        {item.status === "verified" ? (
                          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-moss)] text-white" aria-label="Filed">
                            <ShieldCheck className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brass)] text-white" aria-label="Held">
                            <span className="text-[10px] font-bold">·</span>
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] font-[family-name:var(--font-code)] text-[var(--color-text-faint)]">
                        {index + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {enrichedItems.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <Package className="mb-2 h-12 w-12 text-[var(--color-text-faint)]" />
                <p className="text-[15px] font-semibold text-[var(--color-text-1)]">Satchel is empty</p>
                <p className="mt-1 text-[13px] text-[var(--color-text-3)]">
                  Talk to a mark to bring back an item.
                </p>
              </div>
            )}
          </main>

          <aside
            ref={asideRef}
            className="flex flex-col justify-between overflow-y-auto border-t border-[var(--color-border)] bg-[var(--color-bg-0)] p-4 sm:p-6 md:col-span-5 md:border-t-0 md:border-l"
          >
            {selectedItem ? (
              <div className="flex flex-col gap-4">
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                  <img
                    src={selectedItem.asset}
                    alt={selectedItem.name}
                    className="h-24 w-24 object-contain"
                  />
                  <div className="absolute top-2 left-2 rounded-[6px] border border-[var(--color-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-2)]">
                    {selectedItem.category} · {selectedItem.rarity}
                  </div>
                </div>

                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-[19px] font-bold text-[var(--color-text-1)]">
                    {selectedItem.name}
                  </h3>
                  <p className="text-[13px] text-[var(--color-text-3)]">
                    From <span className="font-semibold text-[var(--color-text-2)]">{selectedItem.botName}</span>
                  </p>
                </div>

                <div>
                  {selectedItem.status === "verified" ? (
                    <div className="flex items-center gap-2 rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-moss)]">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Filed with the merchant</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-brass-ink)]">
                      <AlertCircle className="w-4 h-4" />
                      <span>Held. Needs appraisal.</span>
                    </div>
                  )}
                </div>

                <div className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3.5 text-[13px] leading-relaxed text-[var(--color-text-2)]">
                  <p className="mb-1 font-semibold text-[var(--color-text-1)]">About</p>
                  <p>{selectedItem.description}</p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-[12px]">
                  <div className="rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] p-2.5 text-[var(--color-text-1)]">
                    <span className="font-semibold">Tell: </span>
                    {selectedItem.authenticityTell}
                  </div>
                  <div className="rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] p-2.5 text-[var(--color-text-1)]">
                    <span className="font-semibold">Decoy: </span>
                    {selectedItem.decoyWarning}
                  </div>
                </div>

                {selectedItem.status !== "verified" && onOpenMerchant && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenMerchant();
                      onClose();
                    }}
                    className="redline-cta mt-2 min-h-[48px] w-full rounded-[8px] px-4 py-3 text-[14px] font-semibold active:scale-[0.99]"
                  >
                    <span>Take to merchant</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-[var(--color-text-3)]">
                <p>Pick an item to inspect it.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
