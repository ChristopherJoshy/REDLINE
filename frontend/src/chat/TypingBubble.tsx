import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { reducedMotion } from "@/lib/motionTokens";

/**
 * TypingBubble — three ink-dots in an asymmetric breathing wave.
 * When `thinking` is true, displays a subtle thought badge and animated ink dots.
 */
export default function TypingBubble({ thinking = true }: { thinking?: boolean }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dots = containerRef.current?.querySelectorAll<HTMLSpanElement>(".ink-dot");
    if (!dots || dots.length === 0) return;

    if (reducedMotion()) return;

    const anim = animate(Array.from(dots), {
      translateY: [0, -4, 0],
      opacity: [0.9, 0.35, 0.9],
      duration: 780,
      delay: stagger(140, { start: 0 }),
      ease: "inOutSine",
      loop: true,
    });

    return () => {
      anim.pause();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-label={thinking ? "Bot is thinking" : "Bot is typing"}
      className="flex items-center gap-2 px-3.5 py-2.5"
    >
      {thinking && (
        <span className="text-[12px] font-medium tracking-wide text-[var(--color-text-3)] select-none">
          Thinking
        </span>
      )}
      <div className="flex items-center gap-1.5 py-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="ink-dot block h-1.5 w-1.5 rounded-full bg-[var(--color-brass)]"
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
