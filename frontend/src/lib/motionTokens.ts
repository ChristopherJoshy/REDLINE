/**
 * motionTokens.ts — JS-side mirror of the CSS --dur-* and --ease-* tokens.
 * Use these in every Anime.js call so motion stays consistent with
 * the design system defined in index.css.
 *
 * Anime.js v4 ease names: https://animejs.com/documentation/#easing
 */

export const DUR = {
  /** 120 ms — icon flashes, badge pops */
  micro: 120,
  /** 180 ms — hover states, border shifts */
  ui: 180,
  /** 280 ms — panels, modals entering */
  panel: 280,
  /** 350 ms — page-level transitions */
  page: 350,
  /** 480 ms — entrances, celebrates */
  enter: 480,
  /** 600 ms — ELO updates, slow emphasis */
  slow: 600,
} as const;

export const EASE = {
  /** Standard decelerate — most entrances */
  out: "outExpo" as const,
  /** Gentle overshoot — buttons, badges */
  snap: "outBack(1.3)" as const,
  /** Spring — icons, celebration elements */
  spring: "outElastic(1, 0.5)" as const,
  /** Smooth in-out — loops, pulses */
  inOut: "inOutSine" as const,
  /** Quick settle — chat bubbles */
  settle: "outQuad" as const,
} as const;

/**
 * Returns true if the user prefers reduced motion.
 * Call this before every Anime.js animation and skip or minimise.
 */
export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
