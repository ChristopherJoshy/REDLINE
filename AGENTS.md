# Repository Guidelines

## Project Overview

Live AI social-engineering CTF (Asthra 11.0 CSE). Teams join by code, con 8 Round-1 AI personas + merchant out of relics, crack gates → portal → Round-2 bosses (Itachi/Aizen) for Elo. One LAN Fastify process + local SQLite file; zero cloud deps at event time.

Nearest `AGENTS.md` wins: root is baseline, `frontend/AGENTS.md` and `backend/AGENTS.md` override. `DESIGN.md` is normative for taste; `idea.html` is read-only reference (`.org` purple-box organizer content never ships).

## Architecture & Data Flow

Vite + React SPA (`frontend/`) talks to single Fastify process (`backend/src/server.ts`) over REST + WS + SSE fallback:

```text
React -- apiFetch(/api/*) --> Fastify -- SQLite (backend/data/redline.db)
      -- WS {id, at, event, data} --> Bus.broadcast(teamId)
```

- WS contract single-sourced in `backend/src/contracts/events.ts` as `Frame { id, at, event, data }` with `ClientEvent` / `ServerEvent`. Frontend imports via `@contracts/*` alias; never duplicate schemas. Helpers: `createFrame()` / `parseEvent()` in `frontend/src/ws/client.ts`.
- WS hello: client `hello { teamId, round, lastEventId }` → server replays ring (100 frames / 60s) + sends `inventory_sync` + `elo_update` + `chat_sync` + `hello_ack` (`backend/src/ws/bus.ts`).
- Chat: `chat_send` → `handleChatSend` (R1, Groq stream with `handover_item` / `play_sound` / `trigger_effect` tools) or `handleR2Chat` (R2, Zen bosses) → streams `bot_typing` / `bot_token` / `bot_done` / `sound_play` / `inventory_sync`. SSE fallback `GET /api/stream` after 3 WS failures (`frontend/src/chat/useBotStream.ts`).
- Backend owns game truth: submission pipeline (`strip → decode → un-reverse → NFKC + leet fold → hashed compare`, silent fail in `backend/src/portal/normalize.ts`), Elo (`R'=R+K*(S-E)`, start 600, K=32, K_PROVISIONAL=40), `reasoning_traces` server-only. Clients get `bot_token { botId, delta }` final-text deltas only.
- Round time is server-authoritative. A 30-second countdown is separate from playable duration; clients render `rounds/state.ts` snapshots only. A verified item receives the normal Elo delta plus a per-bot completion-order bonus: ranks 1–7 receive `+12/+9/+7/+5/+3/+2/+1`; later completions receive no bonus. Log rank, elapsed seconds, base delta, and bonus in `elo_log.reason`; never trust a client timestamp.
- `bots/direction.ts` is the final system-prompt contract: bots speak directly as themselves in 1–3 natural sentences, answer safe character questions, and never emit role-play transcript formatting, action narration, hidden reasoning, or protected game rules. Keep source-backed continuity notes in `backend/src/bots/CHARACTER_SOURCES.md`.
- Static: venue Fastify serves `frontend/dist` with SPA fallback (`sendFile index.html`, `/api` 404s stay JSON). Vercel serves `frontend/dist` + rewrite `/(.*) → /index.html`; `/api/*` proxied by `api/[...path].js` to `BACKEND_URL || VITE_API_URL` (fallback `http://3.110.88.35:25565`). Public assets must be browser assets only: never ship installers, runtime binaries, archives, or local test artifacts.
- Hard boundaries: no bot secrets, prompts (`*.prompt.ts`), answer hashes, `JOIN_CODE_PEPPER`, reasoning traces, or purple-box content in player bundles / localStorage / WS history. Admin routes gated by `x-admin-code` (+ `x-settings-pin` for keys); no public leaderboard route, never link `/admin/board` from player UI.

## Key Directories

| Path | Purpose |
|---|---|
| `frontend/src/screens/` | `EnterScreen`, `ArenaScreen` (R1), `GatedArena`, `RoundTwoScreen`, `AdminTeams`, `AdminBoard` |
| `frontend/src/api/` | `client.ts` (`apiUrl`/`apiFetch`), `teams`, `gates`, `merchant`, `profiles` wrappers (relative `/api/*`) |
| `frontend/src/chat/` | `useBotStream.ts` WS+SSE state, `sound.ts`, `TypingBubble`, `RewindButton` |
| `frontend/src/ws/` | `client.ts` typed envelopes, no local schemas |
| `frontend/src/components/` + `ui/` | shared components + shadcn new-york `ui/button.tsx` |
| `frontend/src/shell/` + `portal/` + `lib/` | `FullscreenLock`, `AntiTamper`; portal UI; `motionTokens`, `utils`, `useAnimeIn` |
| `backend/src/routes/` | REST registrars: `teams`, `profiles`, `merchant`, `gates`, `round2`, `admin` |
| `backend/src/bots/` | `registry.ts` + server-only `*.prompt.ts` per persona + `r2.ts`, `tools.ts`, `coverLens`, `merchantClues` |
| `backend/src/chat/` + `llm/` | `handler.ts` (R1) / `r2handler.ts` (R2); `groq.ts`, `zen.ts`, `keyPool.ts`, `tokenTracker.ts` streaming |
| `backend/src/contracts/` | `events.ts` single WS schema |
| `backend/src/ws/` | `bus.ts` per-team fan-out + replay |
| `backend/src/db/` + `data/` | `database.ts` (`DatabaseAdapter`), `schema.sql`; runtime `backend/data/redline.db` (gitignored) |
| `backend/src/auth/` + `elo/` + `portal/` | `codes.ts` HMAC sessions; `ratings.ts` Elo; `normalize.ts` submission compare |
| `api/` | Vercel `[...path].js` backend proxy |
| `scripts/` | `check-env.js` fail-closed gate; `boss-frames.sh` prep-machine-only stills pipeline |
| `assets/sounds/` | vendored sounds + `SOUNDS.md` credit table |

## Development Commands

Boot fails closed: missing env refuses start, no partial boot. No `.env` in repo. No `DATABASE_URL` by design.

```bash
cp .env.example .env   # GROQ_API_KEY, ZEN_API_KEY, JOIN_CODE_PEPPER required; ADMIN_CODE for /admin
npm install            # npm workspaces: frontend + backend
npm run dev            # env gate → backend tsx src/server.ts on :3001
npm run dev:frontend   # Vite on :5173, proxies /api + /ws (honors VITE_API_URL / VITE_WS_URL / REDLINE_API_PORT)
npm run typecheck      # tsc --noEmit both workspaces — must pass
npm test               # both workspaces; backend runs on dist/ so build backend first
npm run build          # both workspaces; backend copies db/schema.sql into dist/
```
- Nearest AGENTS.md wins (root baseline; `frontend/` and `backend/` override).
- No bot secrets / purple-box content in player bundles. No asset generation (licensed generics only). No public leaderboard route. No `DATABASE_URL`/Supabase/Postgres.
- Shared WS contracts single-sourced in `backend/src/contracts/events.ts`, imported by frontend. No duplicated schemas.
- **Push to git and redeploy VPS only after everything is tested well and fully implemented.** Do not push half-done work. `tsc --noEmit` + `npm run build` must pass clean before commit.

| Command | Port / target |
|---|---|
| `npm run dev` / `dev:backend` | backend API+WS `:3001` (`tsx src/server.ts`) |
| `npm run dev:frontend` | Vite `:5173` |
| venue `node backend/dist/server.js` | API + WS + `frontend/dist` on `$PORT` (VPS `25565`) |
| VPS update | `npm run build -w @redline/backend` → tar `dist/` → scp to `ubuntu@3.110.88.35:/home/ubuntu/redline` → `systemctl restart redline` (see `backend/AGENTS.md`) |
| Vercel | build `npm run build --workspace frontend`, output `frontend/dist`; set `VITE_API_URL` + `VITE_WS_URL` |

## Code Conventions & Common Patterns

- TS `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (+ `noFallthroughCasesInSwitch`, `noImplicitOverride`) in `tsconfig.base.json`. `npm run typecheck` must be clean. No eslint/prettier/biome config; observed style: 2-space, double quotes, semicolons, trailing commas, `import type` for types.
- Naming: `camelCase` fns/vars (`apiUrl`, `foldAnswer`), `PascalCase` components/types (`MerchantCounter`, `BotState`), `SCREAMING` consts (`START_RATING`, `BOT_RATINGS`), kebab sound ids (`merchant/success-thank-you`). Route files export `registerXRoutes(app, db[, bus])`.
- Imports: frontend `@/* → src/*`, `@contracts/* → ../backend/src/contracts/*` (`frontend/tsconfig.json`, `vite.config.ts`); backend relative imports use `.js` suffix. Reuse existing patterns; never add a second convention beside an existing one.
- Env: single-source `backend/src/env.ts` (`required()` throws); only `VITE_API_URL` / `VITE_WS_URL` are public. Example: `import type { BotId } from "@contracts/events"`.
- Error handling (fail-closed, fix source not symptom): backend `reply.code(400/401/403/404/409/502).send({ error: "..." })`; frontend `apiFetch`/`post<T>` throws `new Error(data.error ?? "request failed")`; `parseEvent` throws `malformed frame`; `JSON.parse` guarded (`try/catch → continue / [] / undefined`); `localStorage` guarded; `timingSafeEqual` for hashes.
- Async: `async/await + fetch` via `apiFetch` (injects `x-session-token` / `Authorization: Bearer` from `localStorage redline_session_token` + `ngrok-skip-browser-warning`, `credentials: include`); backend `async` Fastify handlers + `AsyncGenerator<StreamYield>` (`delta|tool|done`) with `for await...of streamChat/streamZenChat`, `runWithRotation` key-pool (Groq→Zen fallback); frontend `useBotStream(teamId)` hook (`Record<BotId,{messages,typing,streaming}>`, queue + exp-backoff reconnect max 30s, `redline_last_event` resume, `CustomEvent arena:announcement/arena:elo_update` bridge); `useEffect` polling (`getGates` every 10s in `GatedArena`).
- DI / state: no store lib. `DatabaseAdapter` (hides bun:sqlite / better-sqlite3, WAL on) + `Bus` (teamSockets/ring/reconcile) injected into route registrars; `env` singleton getters. Frontend state in `useBotStream` (`bots/inventory/credits/flash`) + `App.tsx` `useState` (identity/announcement/elo badge).
- Design (normative `DESIGN.md`, tokens in `frontend/src/index.css` `@theme`): preserve the original REDLINE near-black / signal-red theme; no parchment conversion or ad-hoc hexes elsewhere. Status = icon + label + shape, never color alone. Touch targets ≥44px. Motion transform + opacity only (`DUR`/`EASE` in `frontend/src/lib/motionTokens.ts`, `reducedMotion()` + `useAnimeIn` guard, `prefers-reduced-motion` wins). Boss chat and the round-status screen may use existing local atmospheric background images at low opacity. Sounds vendored same-origin under `/sounds/`; nothing hotlinks at event time.
- Game rules: deterministic merchant (`/api/submit`, `/api/merchant/clue`) vs LLM prose — prose never transacts, only `handover_item { authenticity: real }` transfers. Per-turn `<UNTRUSTED_<nonce>>` fencing in `chat/handler.ts`.

## Important Files

- Entrypoints: `frontend/index.html` → `frontend/src/main.tsx` → `frontend/src/App.tsx` (manual `window.location.pathname` routing, no router lib); `backend/src/server.ts` (`boot()`).
- Contracts/state: `backend/src/contracts/events.ts`, `frontend/src/ws/client.ts`, `backend/src/ws/bus.ts`, `frontend/src/chat/useBotStream.ts`, `frontend/src/api/client.ts`.
- Game truth: `backend/src/bots/registry.ts`, `backend/src/bots/tools.ts`, `backend/src/chat/handler.ts`, `backend/src/portal/normalize.ts`, `backend/src/elo/ratings.ts`, `backend/src/auth/codes.ts`, `backend/src/env.ts`, `backend/src/db/database.ts`, `backend/src/db/schema.sql`.
- Config/deploy: `package.json`, `frontend/package.json`, `backend/package.json`, `tsconfig.base.json`, `frontend/tsconfig.json`, `backend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/src/index.css`, `vercel.json`, `api/[...path].js`, `scripts/check-env.js`, `.env.example`, `frontend/.env.example`.
- Docs: `DESIGN.md`, `frontend/AGENTS.md`, `backend/AGENTS.md`, `README.md`, `assets/sounds/SOUNDS.md`.

## Runtime/Tooling Preferences

- Runtime: Node ≥22 (`engines`), TS 5.6.3. Package manager: npm workspaces (`frontend`, `backend`). Bun 1.4.1 is venue alternative only.
- Pinned (don't upgrade casually): Vite 7.3.6, React 19.3.0, Tailwind v4, shadcn new-york, GSAP 3.12.5, three 0.185.1 (transitive via fiber/drei), Fastify 5.12.3, `ws` 8.21.3, better-sqlite3 **13.0.3** (not v12 — no Node-26 prebuild), `tsx` 4.19.2 dev-only.
- Backend dev `tsx src/server.ts`; venue single-process `node backend/dist/server.js` (serves API + WS + `frontend/dist`). Frontend deploy → Vercel; backend deploy → VPS `ubuntu@3.110.88.35` (`redline.service`, port 25565, `/home/ubuntu/redline`, compiled `dist/` tarball, not a git clone).
- Store: local SQLite file only (`backend/data/redline.db`, `*.db` + `/data/` gitignored). Build copies `src/db/schema.sql` → `dist/db/schema.sql`.
- Env: `GROQ_API_KEY`, `ZEN_API_KEY`, `JOIN_CODE_PEPPER` required (`scripts/check-env.js` + `backend/scripts/check-env.js`); `ADMIN_CODE` (+ `ADMIN_SETTINGS_PIN`) for admin. Frontend public: `VITE_API_URL`, `VITE_WS_URL` only.

## Testing & QA

- Framework: Node built-in `node --test` only. No vitest/jest/playwright/c8/nyc.
- Layout: backend `backend/src/**/*.test.ts` → compiled `backend/dist/**/*.test.js`, run `node --test dist/**/*.test.js` from `backend/` — MUST `npm run build -w @redline/backend` first (stale dist = stale tests). Frontend `node --test src/**/*.test.ts` from `frontend/`, no build step. Zero `*.test.*` files exist currently.
- Run: `npm run typecheck && npm test && npm run build`; per-workspace `npm run build -w @redline/backend && npm run test -w @redline/backend`, `npm run test -w @redline/frontend`.
- Coverage: none configured, no thresholds. Lint gate is `tsc --noEmit` only.
- Definition of done: `typecheck` + `test` + `build` all pass AND live walkthrough: enter-to-play, inventory + merchant, gates → portal → Round-2. Confirm Round 1 and Round 2 countdown/play clocks against server time, each boss background and phase transition, direct bot conversation, and the Elo receipt's rank/bonus fields. Grep guard `generated|placeholder.png|fake-fallback` must be empty (current hits are substring false positives only). Push and deploy only after this gate is clean.

- VPS contains only the backend, no need to move the frontend there. Vercel handles frontend.

