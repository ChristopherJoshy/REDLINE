# REDLINE Design Taste + Palette — Source of Truth

Design Read: Live AI social-engineering CTF arena for college teams plus projector audience, with a medieval minimal language, leaning toward parchment and ink with one brass accent plus Cinzel display type.

Dials: VARIANCE 5 / MOTION 3 / DENSITY 4.

Skills applied: `design-taste-frontend`, `minimalist-ui` (flat surfaces, hairlines, scarce color), `frontend-design` (subject-grounded choices, restrained motion), `ui-ux-pro-max` (a11y, 44px targets, feedback, contrast), `ui-styling` (shadcn + Tailwind tokens).

---

## 1. Theme Architecture

Single theme everywhere. Parchment ground, ink text, brass as the only accent. The entry gate uses the same tokens on an ink ground. No section flips theme mid-page.

- **Ground:** parchment `#F3EDE0`, raised `#E9E0C9`.
- **Surfaces:** flat cards `#FBF8EE`, no gradients, no glass, no glow. Borders are 1px hairlines `#D8CBA6`; strong borders `#A8976B`.
- **Text:** ink `#201A12`, secondary `#4A4234`, muted `#7A6F5C`. Body 16px/1.6. Sentence case. Plain verbs. No slogans, no lore paragraphs in chrome.
- **Accent:** brass `#6E5514` only. ELO, active states, key highlights. Ink `#201A12` is the primary button fill, parchment text on top.
- **Status (icon plus label plus shape, never color alone):** filed/moss wash `#E9EAD9` with `#4B5523` text and border `#C6C9A3`; held/brass wash `#EFE6C8` with `#4A3A0C` text; rejected/seal wash `#F3E2DD` with `#7F1D1D` text.
- **Shape:** cards 8px, controls 6px. No pills on containers or primary buttons. One radius system throughout.
- **Shadow:** none by default. Hover is a border shift over 180ms. Active press is `scale(0.98)`.
- **Motion:** one entry rise (`translateY(8px)` plus fade, 500ms) on major panels only. Transform and opacity only. `prefers-reduced-motion` disables all of it. No glow, spin, or pulse loops.

## 2. Palette Tokens

Tokens live in `frontend/src/index.css` under `@theme inline`. Zero ad-hoc hexes elsewhere.

| Token | Value | Purpose |
| :--- | :--- | :--- |
| `--color-bg-0` | `#F3EDE0` | Main ground |
| `--color-bg-1` | `#E9E0C9` | Raised ground |
| `--color-surface-1` | `#FBF8EE` | Card surface |
| `--color-surface-2` | `#F0E8D2` | Hover, secondary |
| `--color-surface-3` | `#E2D5B4` | Pressed, tracks |
| `--color-border` | `#D8CBA6` | Hairlines |
| `--color-border-strong` | `#A8976B` | Interactive boundaries |
| `--color-text-1` | `#201A12` | Primary text |
| `--color-text-2` | `#4A4234` | Body text |
| `--color-text-3` | `#7A6F5C` | Labels, hints |
| `--color-text-faint` | `#A89C82` | Placeholders |
| `--color-brass` | `#6E5514` | Sole accent |
| `--color-brass-ink` | `#4A3A0C` | Accent text on wash |
| `--color-brass-wash` | `#EFE6C8` | Accent wash |
| `--color-seal` | `#7F1D1D` | Alerts only |
| `--color-moss` | `#4B5523` | Filed status text |
| `--color-moss-wash` | `#E9EAD9` | Filed status wash |

Legacy tokens (`--color-redline`, `--color-gold`, `--color-cyan`, `--color-green`, `--color-portal-*`) remap to this scale so old classes stay quiet. New code uses brass, seal, moss, ink.

## 3. Typography

- **Cinzel 700**: wordmark, screen titles, gate heraldry. Tight, uppercase only for the wordmark and short titles.
- **Inter 400/500/600**: everything else. Sentence case.
- **JetBrains Mono 500/700**: codes, ELO, counts, timestamps.

## 4. Components

- **Header:** parchment bar, hairline bottom border. Cinzel wordmark in ink with a short brass rule. Flat badges for team, operator, ELO. Ink primary actions.
- **Marks list:** merchant card pinned on top (brass wash, live credit balance); flat parchment rows, 1px border, 8px radius. Filed rows go full moss wash with lock badge and reopen only as a celebration. Status chips pair icon with Filed, Held, or Open label.
- **Record panel:** flat card, small caps section labels in muted text, plain description, one ink button labeled with the verb it performs. Filed marks show a moss locked button that replays the celebration.
- **Comms:** bot bubbles parchment with hairline, user bubbles ink with parchment text. Input is a 6px bordered field. Send is an ink button.
- **Merchant counter:** chattable bot with Counter and Talk tabs. Counter sells held relics through GUI buttons only (no typing), shows the live credit balance, and runs the clue board: two sealed tiers per mark (Angle 30, Decisive detail 60), bought with credits earned from genuine sales. Verification kicks the mark's comms into a confetti celebration with the mark's congratulation line.
- **Satchel:** flat parchment dialog, 8px radius, 1px border. Item grid uses square 8px slots. One ink primary action that opens the merchant.
- **Board:** parchment table on ink ground for projection. Rank is a numeral, not a gradient tile. One brass highlight for first place only.
