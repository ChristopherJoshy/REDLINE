import { useEffect, useRef } from "react";
import { createTimeline, animate } from "animejs";
import confetti from "canvas-confetti";
import type { BotId } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import { CheckCircle2 } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";
import { playSound, unlockAudio } from "@/chat/sound";

export const CHEERS: Record<BotId, string> = {
  wick: "Settled. The ledger holds your name now. Consequences, the good kind.",
  spidey: "Whoa, that actually worked? You are officially my favorite patrol buddy.",
  escanor: "Magnificent. Even at noon, I acknowledge you. Take your victory.",
  stark: "Huh. Clean work, no explosions. Genuinely impressed.",
  joker: "HA! You actually got me! Do not tell anyone I smiled. Take it. TAKE IT.",
  light: "Just as planned. Though I planned for you to fail. Take the page, rival.",
  levi: "Tch. Clean. Fast. No wasted motion. Dismissed, and well done.",
  deadpool: "WAIT, you won? In MY game? Somebody clip that. You are officially canon.",
  itachi: "You saw through the illusion to the truth beneath. The vault yields.",
  aizen: "Remarkable. You stood inside my hypnosis and chose correctly anyway.",
  merchant: "Pleasure doing business with you.",
};

// Map each bot to their celebration line or signature sound
const CELEBRATION_SOUNDS: Partial<Record<BotId, string>> = {
  wick: "/sounds/wick/quiz-pass.mp3",
  spidey: "/sounds/spidey/quiz-pass.mp3",
  escanor: "/sounds/escanor/quiz-pass.mp3",
  stark: "/sounds/stark/quiz-pass.mp3",
  joker: "/sounds/joker/handover-tdk-smile.mp3",
  light: "/sounds/light/laugh-kira-laugh.mp3",
  levi: "/sounds/levi/briefing-survey-corps.mp3",
  deadpool: "/sounds/deadpool/address-hey-you-guys.mp3",
  itachi: "/sounds/itachi/genjutsu-voice-en.mp3",
  aizen: "/sounds/aizen/shatter.mp3",
  merchant: "/sounds/merchant/success-thank-you.mp3",
};

export default function CelebrationOverlay({ botId, onClose }: { botId: BotId; onClose: () => void }): React.JSX.Element {
  const lore = CHARACTERS[botId];

  // Choreography refs
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const itemImgRef = useRef<HTMLImageElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const cheerRef = useRef<HTMLParagraphElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Play celebration sound every time modal opens (first time or "celebrate again")
  useEffect(() => {
    unlockAudio();
    const soundSrc = CELEBRATION_SOUNDS[botId] ?? "/sounds/merchant/success-thank-you.mp3";
    try {
      playSound(soundSrc);
    } catch {
      // Audio optional
    }
  }, [botId]);

  // Win-state entrance choreography
  useEffect(() => {
    if (reducedMotion()) {
      // Immediately visible
      [backdropRef, cardRef, badgeRef, itemImgRef, nameRef, cheerRef, btnRef].forEach((r) => {
        if (r.current) {
          r.current.style.opacity = "1";
          r.current.style.transform = "none";
        }
      });
      return;
    }

    const tl = createTimeline({ defaults: { ease: EASE.out } });

    // 1. Backdrop fades in
    tl.add(backdropRef.current!, {
      opacity: [0, 1],
      duration: DUR.ui,
    });

    // 2. Card scales in with a spring overshoot
    tl.add(cardRef.current!, {
      scale: [0.88, 1],
      opacity: [0, 1],
      duration: DUR.page,
      ease: EASE.snap,
    }, `-=${DUR.micro}`);

    // 3. Item image spins in
    tl.add(itemImgRef.current!, {
      rotate: [-8, 0],
      scale: [0.6, 1],
      opacity: [0, 1],
      duration: DUR.enter,
      ease: EASE.spring,
    }, `-=${DUR.panel}`);

    // 4. Filed badge slides down
    tl.add(badgeRef.current!, {
      translateY: [-10, 0],
      opacity: [0, 1],
      duration: DUR.panel,
    }, `-=${DUR.panel}`);

    // 5. Name fades in
    tl.add(nameRef.current!, {
      opacity: [0, 1],
      translateY: [4, 0],
      duration: DUR.panel,
    }, `-=${DUR.ui}`);

    // 6. Cheer text fades in
    tl.add(cheerRef.current!, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: DUR.panel,
    }, `-=${DUR.ui}`);

    // 7. Button rises in last
    tl.add(btnRef.current!, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: DUR.panel,
      ease: EASE.out,
    }, `-=${DUR.micro}`);

    return () => { tl.pause(); };
  }, []);

  // Confetti bursts (unchanged — already good)
  useEffect(() => {
    if (reducedMotion()) return;
    const bursts: number[] = [];
    bursts.push(window.setTimeout(() => {
      void confetti({ particleCount: 90, spread: 75, origin: { y: 0.35 } });
    }, 150));
    bursts.push(window.setTimeout(() => {
      void confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0.1, y: 0.6 } });
    }, 450));
    bursts.push(window.setTimeout(() => {
      void confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 0.9, y: 0.6 } });
    }, 650));
    return () => { for (const t of bursts) window.clearTimeout(t); };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleClose(): void {
    if (reducedMotion()) { onClose(); return; }
    animate(cardRef.current!, {
      scale: [1, 0.92],
      opacity: [1, 0],
      duration: DUR.ui,
      ease: "inQuad",
      onComplete: onClose,
    });
  }

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${lore?.name ?? botId} filed`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      style={{ opacity: 0 }}
      onClick={handleClose}
    >
      <div
        ref={cardRef}
        className="redline-panel flex w-full max-w-[440px] flex-col items-center gap-4 rounded-[12px] border-[rgba(157,184,122,0.4)] p-8 text-center shadow-[0_0_40px_rgba(157,184,122,0.15)]"
        style={{ opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          ref={badgeRef}
          className="flex items-center gap-1.5 rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] px-3 py-1 text-[12px] font-semibold text-[var(--color-moss)]"
          style={{ opacity: 0 }}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Filed with the merchant</span>
        </span>

        {lore !== undefined && (
          <img
            ref={itemImgRef}
            src={lore.targetItem.asset}
            alt=""
            className="h-24 w-24 object-contain"
            style={{ opacity: 0 }}
          />
        )}

        <div>
          <h2
            ref={nameRef}
            className="font-[family-name:var(--font-display)] text-[24px] font-bold text-[var(--color-text-1)]"
            style={{ opacity: 0 }}
          >
            {lore?.name ?? botId}
          </h2>
          <p
            ref={cheerRef}
            className="mt-2 text-[15px] leading-relaxed text-[var(--color-text-2)]"
            style={{ opacity: 0 }}
          >
            {CHEERS[botId]}
          </p>
        </div>

        <button
          ref={btnRef}
          type="button"
          onClick={handleClose}
          autoFocus
          className="redline-cta min-h-[48px] w-full rounded-[8px] px-4 py-3 text-[15px] font-semibold active:scale-[0.99]"
          style={{ opacity: 0 }}
        >
          Back to marks
        </button>
      </div>
    </div>
  );
}
