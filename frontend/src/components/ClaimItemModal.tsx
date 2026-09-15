import { useEffect, useRef, useState } from "react";
import { createTimeline } from "animejs";
import confetti from "canvas-confetti";
import type { BotId } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";
import { playSound } from "@/chat/sound";
import { 
  Sparkles, 
  ArrowRight, 
  ShieldAlert, 
  Check, 
  Gift,
  X
} from "lucide-react";

interface ClaimItemModalProps {
  botId: BotId;
  itemKey: string;
  onClaim: () => void;
  onVisitMerchant?: () => void;
}

export default function ClaimItemModal({
  botId,
  itemKey,
  onClaim,
  onVisitMerchant,
}: ClaimItemModalProps): React.JSX.Element {
  const lore = CHARACTERS[botId];
  const itemMeta = lore?.targetItem;
  
  const [claimed, setClaimed] = useState(false);

  // Animation refs
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const relicGlowRef = useRef<HTMLDivElement>(null);
  const itemImgRef = useRef<HTMLImageElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const claimButtonRef = useRef<HTMLButtonElement>(null);

  // Entrance sound on handover
  useEffect(() => {
    try {
      playSound("/sounds/portal/open-active.mp3");
    } catch {
      // Audio optional
    }
  }, []);

  // Entrance animation
  useEffect(() => {
    if (reducedMotion()) {
      [backdropRef, cardRef, itemImgRef, detailsRef, claimButtonRef].forEach((r) => {
        if (r.current) {
          r.current.style.opacity = "1";
          r.current.style.transform = "none";
        }
      });
      return;
    }

    const tl = createTimeline({ defaults: { ease: EASE.out } });

    // 1. Backdrop
    if (backdropRef.current) {
      tl.add(backdropRef.current, {
        opacity: [0, 1],
        duration: DUR.ui,
      });
    }

    // 2. Main Card with scale snap
    if (cardRef.current) {
      tl.add(cardRef.current, {
        scale: [0.85, 1],
        opacity: [0, 1],
        duration: DUR.page,
        ease: EASE.snap,
      }, `-=${DUR.micro}`);
    }

    // 3. Relic Image bounce & slight rotation
    if (itemImgRef.current) {
      tl.add(itemImgRef.current, {
        scale: [0.4, 1],
        rotate: [-12, 0],
        opacity: [0, 1],
        duration: DUR.enter,
        ease: EASE.spring,
      }, `-=${DUR.panel}`);
    }

    // 4. Details fade up
    if (detailsRef.current) {
      tl.add(detailsRef.current, {
        translateY: [10, 0],
        opacity: [0, 1],
        duration: DUR.panel,
      }, `-=${DUR.micro}`);
    }

    // 5. Button rise
    if (claimButtonRef.current) {
      tl.add(claimButtonRef.current, {
        translateY: [8, 0],
        opacity: [0, 1],
        duration: DUR.ui,
      }, `-=${DUR.micro}`);
    }

    return () => { tl.pause(); };
  }, []);

  function handleClaim(): void {
    if (claimed) return;
    setClaimed(true);

    try {
      playSound("/sounds/merchant/success-thank-you.mp3");
    } catch {
      // Audio optional
    }

    if (!reducedMotion()) {
      void confetti({
        particleCount: 80,
        spread: 75,
        origin: { y: 0.45 },
        colors: ["#6E5514", "#A8976B", "#201A12", "#EFE6C8"],
      });
    }

    setTimeout(() => {
      onClaim();
    }, 1800);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClaim();
      } else if (e.key === "Escape") {
        onClaim();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [claimed, onClaim]);

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Relic yielded: ${itemMeta?.name ?? itemKey}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-1 p-4 "
      onClick={(e) => {
        if (e.target === backdropRef.current) {
          onClaim();
        }
      }}
    >
      <div
        ref={cardRef}
        className="redline-gold-card relative flex w-full max-w-[460px] flex-col items-center gap-5 rounded-[8px] p-6 sm:p-8 text-center  overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClaim}
          className="absolute top-4 right-4 p-1.5 rounded-[6px] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div 
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[var(--color-brass-wash)] opacity-40 pointer-events-none blur-xl"
          aria-hidden="true" 
        />
        <div 
          className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-[var(--color-surface-2)] opacity-50 pointer-events-none blur-lg"
          aria-hidden="true" 
        />

        {/* Header Tag */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-[6px] border border-[var(--color-brass)] bg-[var(--color-brass-wash)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brass-ink)]">
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-brass)] animate-pulse" />
            <span>Relic Handover Unlocked</span>
          </span>
        </div>

        {/* Mark Source Header */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-[8px] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
          <span className="block w-6 h-6 rounded-[4px] overflow-hidden border border-[var(--color-border-strong)] shrink-0">
            <img
              src={lore?.avatar ?? "/characters/wick.jpg"}
              alt={lore?.name ?? botId}
              className="w-full h-full object-cover"
            />
          </span>
          <p className="text-[13px] text-[var(--color-text-2)] font-medium">
            Yielded by <strong className="text-[var(--color-text-1)] font-semibold">{lore?.name ?? botId}</strong>
          </p>
        </div>

        {/* Relic Image with glow */}
        <div className="relative my-2 flex items-center justify-center">
          <div 
            ref={relicGlowRef}
            className="absolute inset-0 m-auto w-28 h-28 rounded-full bg-[var(--color-brass-wash)] opacity-70 blur-md pointer-events-none"
          />
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center p-3 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] hover:scale-105 transition-transform duration-200">
            <img
              ref={itemImgRef}
              src={itemMeta?.asset ?? "/items/wick_medallion.svg"}
              alt={itemMeta?.name ?? itemKey}
              className="w-full h-full object-contain "
            />
          </div>
        </div>

        {/* Details block */}
        <div ref={detailsRef} className="flex flex-col gap-2 w-full">
          <h2 className="font-[family-name:var(--font-display)] text-[22px] sm:text-[24px] font-bold text-text-1 leading-snug">
            {itemMeta?.name ?? itemKey}
          </h2>

          <div className="flex items-center justify-center gap-2 text-[12px]">
            <span className="font-semibold text-[var(--color-brass-ink)] px-2 py-0.5 rounded-[4px] bg-[var(--color-brass-wash)] border border-[var(--color-border-strong)]">
              {itemMeta?.category ?? "Relic"} · {itemMeta?.rarity ?? "Rare"}
            </span>
            <span className="text-[var(--color-text-3)]">
              Worth ~{itemMeta?.merchantBounty ?? 100} credits
            </span>
          </div>

          <p className="mt-1 text-[13px] sm:text-[14px] leading-relaxed text-[var(--color-text-2)] px-2">
            {itemMeta?.description ?? "A prized possession yielded through your persuasive social engineering."}
          </p>

          <div className="mt-2 flex items-start gap-2 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 text-left text-[12px] text-[var(--color-text-3)]">
            <ShieldAlert className="w-4 h-4 text-[var(--color-brass)] shrink-0 mt-0.5" />
            <p>
              Stored in your <strong className="text-[var(--color-text-1)]">Satchel</strong> as <em>Held</em>. Take it to the <strong className="text-[var(--color-text-1)]">Merchant Counter</strong> to file and verify for ELO &amp; credits!
            </p>
          </div>
        </div>

        {/* Claim Action Button */}
        <div className="w-full flex flex-col gap-2 pt-2">
          <button
            ref={claimButtonRef}
            type="button"
            onClick={handleClaim}
            autoFocus
            disabled={claimed}
            className={`min-h-[50px] w-full flex items-center justify-center gap-2 rounded-[8px] px-6 py-3 text-[15px] font-bold tracking-wide transition-all  cursor-pointer ${
              claimed
                ? "bg-surface-1 text-moss border border-border scale-[0.98]"
                : "redline-cta active:scale-[0.98]"
            }`}
          >
            {claimed ? (
              <>
                <Check className="w-5 h-5 animate-bounce" />
                <span>Claimed to Satchel!</span>
              </>
            ) : (
              <>
                <Gift className="w-5 h-5 text-[var(--color-brass-wash)]" />
                <span>Claim Relic &amp; Store</span>
              </>
            )}
          </button>

          {onVisitMerchant && (
            <button
              type="button"
              onClick={() => { onClaim(); onVisitMerchant(); }}
              className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[var(--color-brass-ink)] hover:underline py-1 cursor-pointer"
            >
              <span>Take directly to Merchant Counter</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
