import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { reducedMotion } from "@/lib/motionTokens";

/**
 * TypingBubble — three ink-dots in an asymmetric breathing wave.
 * Uses Anime.js v4 `animate` + `stagger` instead of CSS `animate-bounce`.
 * The wave is fast-down / slow-up to feel organic, not mechanical.
 */
export default function TypingBubble(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dots = containerRef.current?.querySelectorAll<HTMLSpanElement>(".ink-dot");
    if (!dots || dots.length === 0) return;

    if (reducedMotion()) return;

    const anim = animate(Array.from(dots), {
      translateY: [0, -5, 0],
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
      aria-label="Bot is typing"
      className="flex items-center gap-1.5 px-4 py-3"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ink-dot block h-2 w-2 rounded-full bg-[var(--color-text-3)]"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
