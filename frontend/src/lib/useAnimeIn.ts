/**
 * useAnimeIn — mount-entry hook using Anime.js v4.
 * Replaces the `.rise-in` CSS class for interactive components
 * so entry can be sequenced, staggered, and controlled.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useAnimeIn(ref, { delay: 80 });
 *   return <div ref={ref}>...</div>;
 */
import { useEffect, useRef, type RefObject } from "react";
import { animate } from "animejs";
import { DUR, EASE, reducedMotion } from "./motionTokens";

interface AnimeInOptions {
  /** Vertical offset to start from (default 8px) */
  y?: number;
  /** Delay before animation starts in ms (default 0) */
  delay?: number;
  /** Animation duration in ms (default DUR.enter) */
  duration?: number;
  /** Anime.js easing string (default EASE.out) */
  ease?: string;
}

export function useAnimeIn<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: AnimeInOptions = {},
): void {
  const { y = 8, delay = 0, duration = DUR.enter, ease = EASE.out } = options;
  // Track if we've already played so StrictMode double-mount doesn't replay
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      // Ensure element is visible even with no motion
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }
    animate(el, {
      opacity: [0, 1],
      translateY: [y, 0],
      duration,
      delay,
      ease,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
