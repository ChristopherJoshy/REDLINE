# REDLINE Design Taste + Palette — Source of Truth

Design Read: live AI social-engineering CTF arena for college teams plus projector audience,
with a dark cinematic vault language, leaning toward Tailwind v4 tokens + shadcn + GSAP/R3F portal motion.
Dials: VARIANCE 7 / MOTION 6 / DENSITY 5.

Skills applied: `design-taste-frontend` (read + dials + pre-flight discipline),
`ui-ux-pro-max` (a11y, 44px targets, feedback), `ui-styling` (shadcn + Tailwind tokens),
`frontend-design` (one memorable element: the Nether portal; everything else quiet).

## Locks (non-negotiable)

- One vivid accent per viewport. Neutrals elsewhere.
- Never color-alone state: every status pairs icon + label + shape.
- Zero ad-hoc hexes outside `frontend/src/index.css` tokens. No per-page CSS.
- One corner-radius scale: sm6 / md10 / lg16 / xl24 / full.
- Transform + opacity animation only. Shared GSAP timeline.
- `prefers-reduced-motion` + manual toggle always wins (WCAG 2.3.3).

## Palette (verbatim, also encoded as `@theme` tokens in `frontend/src/index.css`)

| Token | Value | Use |
| `--color-vault-p2` | `#150A1C` | R2 phase-2 backdrop only |
| `--bg-0` | `#09090B` | app ground |
| `--bg-1` | `#121214` | raised ground |
| `--surface-1/2/3` | `#1A1A1E` / `#232329` / `#2C2C33` | elevation steps |
| `--border` / `--border-strong` | `#2E2E36` / `#3F3F48` | hairlines |
| `--text-1/2/3` | `#F5F5F4` / `#D4D4D8` / `#A1A1AA` | text ramp (`--text-3` is the small-text floor; bump to `--text-2` if projector washes out; `--text-faint:#71717A` large-only) |
| `--redline` / `-soft` / `-dim` | `#FF1F3D` / `#FF8A97` / `rgba(255,31,61,0.14)` | single red signal |
| `--cyan` | `#4DD0E1` | obtain / info only |
| `--amber` | `#FBBF24` | rewind / warning |
| `--green` | `#34D399` | verified |
| `--purple-950/700/400` | `#3B0764` / `#6A0DAD` / `#A855F7` | portal only |

## Type (Google Fonts OFL, self-hosted, `display=swap`)

- Space Grotesk 500/700: HUD, team names, leaderboard, portal. >=18px only.
- Inter 400/500/600: chat, briefs, forms. 16px/1.6 floor.
- JetBrains Mono 500/700: codes, ELO, items, timestamps. `tabular-nums`.
- Cinzel 700: Round-2 vault headers + reveal titles only.
- Scale: display-xl `clamp(32px,5vw,56px)`/1.05/`-0.02em`; h1 28/1.15; h2 22/1.25;
  small 14/1.5; micro-label 12/1.4/+0.08em uppercase; leaderboard row 20/1.3 (10-ft board x1.5).

## Space, shape, elevation, focus

- Spacing base 4px: 4/8/12/16/20/24/32/48/64. Fluid `--space:clamp(.75rem,2vw,1.5rem)`.
- Elevation = lighter surface step. Over 3D: scrim `linear-gradient(rgba(9,9,11,.72))`
  plus `text-shadow: 0 1px 8px rgba(0,0,0,.8)`.
- Focus: 2px cyan outline, 2px offset (>=3px rings in leanback board mode).

## Shell layout

Grid: header 56px / main 1fr / footer 64px. Chat scroll column + 320px inventory rail.
Stage `aspect-ratio:4/3`, `max-height:calc(100dvh - hud - controls)`. All hits >=44px (WCAG 2.5.8).
Optimistic ack <100ms, WS reconcile. Fullscreen exit = blocking overlay + Resume + attempt log + disabled input.

```
+----------------------------------------------------------+
| HUD 56px: sigil  team  ELO(mono)  round  admin-clock     |
+-------------------------------+--------------------------+
|                               | INVENTORY 320px          |
|   STAGE 4:3 centered          | chips grid               |
|   scene backdrop dimmed       | locked gray / obtained   |
|   chat scroll                 | amber / submitted cyan / |
|                               | verified green-check     |
+-------------------------------+--------------------------+
| CONTROLS 64px: input + Send + Take Item to merchant      |
+----------------------------------------------------------+
<1024px: single column, inventory becomes Sheet bottom sheet (max-h-72dvh,
focus trap, drag affordance, safe-area padding). >=1440px: leanback board mode
(data-density=leanback, type 125-150%, keyboard-first).
```

## Component states

- Inventory chips: locked gray, obtained amber, submitted cyan, verified green-check.
- Merchant: single input + Take Item CTA. Troll = amber shake + roast + sound.
  Success = green check + sting + mono ELO delta. Silent fail, never which-check-fired.
- Leaderboard (`/admin/board`, admin-auth only, unguessable path, no player link):
  sticky header, WS refresh, 3m/1080p + grayscale + colorblind pass.

## Motion + audio budget

Durations: `--dur-micro120` / `--dur-ui180` / `--dur-panel280` / `--dur-page350` /
`--dur-portal3000` (portal only). Easing `cubic-bezier(0.22,1,0.36,1)`.
<=5 concurrent animations, viewport settles <=800ms, single anim <=500ms (portal excepted).
three.js: one contained effect, `useFrame` uniforms, IntersectionObserver pause, DPR cap 1.5,
mobile/low-power off. Master gain cap 0.5, 300ms fade-in, jumpscares ~1s single sting (-14 LUFS),
no >2Hz flash. Reduced-motion: shaders/video/parallax/FOV/wobble off, 150-250ms opacity
dissolve; portal video becomes static poster; jumpscare becomes static portrait;
autoplay gets Pause/Stop/Hide.

## Stack order

Tailwind tokens -> shadcn primitives -> GSAP clock (DOM + uniforms + ducking) ->
R3F drei MeshPortalMaterial + UnrealBloomPass in portal purples -> Web Audio `sound_id` map.
