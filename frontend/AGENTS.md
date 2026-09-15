# AGENTS.md — frontend

Baseline: root `AGENTS.md`. Taste + palette: root `DESIGN.md` (normative; preserve the original REDLINE black/red theme; tokens live in `src/index.css`).

## Rules

- shadcn primitives + Tailwind `@theme` tokens only. No per-page CSS, no ad-hoc hexes, no hardcoded bot secrets.
- One accent per viewport; statuses pair icon + label + shape (never color-alone).
- Hits >=44px. Optimistic ack <100ms with WS reconcile. Fullscreen exit disables input until Resume.
- Motion: transform + opacity only, shared GSAP timeline, budgets in DESIGN.md. `prefers-reduced-motion` + manual toggle always wins.
- DO NOT: invent assets, hotlink MyInstants at event time (vendored `/sounds/` only), link `/admin/board` from player UI, put secrets/flags/scores in client JS or localStorage.

## Commands

- `npm run dev` (needs backend env, see root), `npm run build`, `tsc --noEmit`.
