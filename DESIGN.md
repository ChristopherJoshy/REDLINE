# REDLINE Design Taste + Palette — Source of Truth

Design Read: Live AI social-engineering CTF arena for college teams plus projector audience. Preserve the original REDLINE visual language: near-black ground, signal red accent, cool gray type, restrained cinematic texture, and Cinzel display type.

Dials: VARIANCE 5 / MOTION 3 / DENSITY 4.

Skills applied: `design-taste-frontend`, `minimalist-ui` (flat surfaces, hairlines, scarce color), `frontend-design` (subject-grounded choices, restrained motion), `ui-ux-pro-max` (a11y, 44px targets, feedback, contrast), `ui-styling` (shadcn + Tailwind tokens).

---

## 1. Theme Architecture

Single theme everywhere. Near-black ground, white text, signal red as the primary accent. The entry gate and status screen use the same arena language over local background imagery. No parchment or beige surfaces.

- **Ground:** near-black `#05070A`, raised `#0D1117`.
- **Surfaces:** deep charcoal cards `#10151D`; borders are cool-gray hairlines `#293241`, with red emphasis `#70303A`.
- **Text:** near-white `#F5F7FA`, secondary `#C6CDD7`, muted `#8B96A6`. Body 16px/1.6.
- **Accent:** signal red `#FF1E2D`. Use it for active states, key highlights, and primary actions; muted red remains background texture only.
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

- **Header:** near-black bar, red hairline, Cinzel wordmark in white with a red rule. Dark badges for team, operator, and ELO. Red primary actions.
- **Marks list:** merchant card pinned on top (brass wash, live credit balance); flat parchment rows, 1px border, 8px radius. Filed rows go full moss wash with lock badge and reopen only as a celebration. Status chips pair icon with Filed, Held, or Open label.
- **Record panel:** flat card, small caps section labels in muted text, plain description, one ink button labeled with the verb it performs. Filed marks show a moss locked button that replays the celebration.
- **Comms:** bot bubbles parchment with hairline, user bubbles ink with parchment text. Input is a 6px bordered field. Send is an ink button.
- **Boss comms:** keep the same black/red components. Itachi and Aizen may each use an existing local atmospheric image beneath the chat at low opacity and with a distinct crop; the image supports the conversation and never replaces contrast, controls, or readable copy.
- **Merchant counter:** chattable bot with Counter and Talk tabs. Counter sells held relics through GUI buttons only (no typing), shows the live credit balance, and runs the clue board: two sealed tiers per mark (Angle 30, Decisive detail 60), bought with credits earned from genuine sales. Verification kicks the mark's comms into a confetti celebration with the mark's congratulation line.
- **Satchel:** flat parchment dialog, 8px radius, 1px border. Item grid uses square 8px slots. One ink primary action that opens the merchant.
- **Board:** parchment table on ink ground for projection. Rank is a numeral, not a gradient tile. One brass highlight for first place only.
