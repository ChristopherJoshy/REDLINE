# REDLINE Arena

> Live AI social-engineering CTF — built for the **Asthra 11.0 CSE** event.
> 
> 🌐 **Live Deployment:** [https://eventlinkredline.vercel.app/](https://eventlinkredline.vercel.app/)

Teams enter with a join code, talk a roster of AI personas into giving up their prized
possessions, trade at the merchant, crack the gates, pass the portal, and survive a
Round-2 boss rush. One LAN process, one SQLite file, zero cloud dependencies at event time.

---

## How a run works

| Stage | What teams do |
|---|---|
| **Enter** | Join code → team identity (signed cookie session). No accounts, no passwords. |
| **Round 1 — Arena** | Eight AI personas (Wick, Spidey, Escanor, Stark, Joker, Light, Levi, Deadpool), each hoarding a key item. Chat, quiz, haggle, and talk them into handing it over. Inventory + merchant trading on the side; results feed an Elo ladder. |
| **Gates → Portal** | Spend collected items to crack a series of gates, then answer the portal to escape Round 1. |
| **Round 2 — Bosses** | Phased encounters against Itachi and Aizen. Multi-turn manipulation battles with Elo on the line. |

Admins run the event from `/admin` (teams, join codes, gates panel, live board).

---

## Architecture

One process serves everything on the venue LAN:

```
players ──▶ Fastify (API) ──▶ SQLite (backend/data/redline.db)
   │            │
   │            ▼
   │         WebSocket bus (live frames: chat, typing, inventory, gates)
   │
   └───── static frontend (frontend/dist, sounds included)
```

- **Contracts single-sourced** in `backend/src/contracts/events.ts` and imported by the frontend — no duplicated WS schemas.
- **LLM providers:** Groq (Round-1 personas) and Zen via OpenCode (Round-2 bosses), both server-side only. Keys never reach the browser.
- **Sounds** are vendored same-origin under `/sounds/` (see `assets/sounds/SOUNDS.md`). Nothing hotlinks at event time, so the game survives dead venue Wi-Fi.
- **No public leaderboard route, no bot secrets in player bundles** — enforced by convention (see `AGENTS.md`).

---

## Stack

| Layer | Pins |
|---|---|
| Frontend | Vite 7.3.6 · React 19.3.0 · TypeScript `strict` · Tailwind v4 · shadcn (new-york) · GSAP 3.12.5 · three 0.185.1 |
| Backend | Node ≥ 22 (primary) · Fastify 5.12.3 · `ws` 8.21.3 · better-sqlite3 12/13 behind a `DatabaseAdapter` (Bun `bun:sqlite` path for the Bun runtime) |
| Store | Local SQLite file only — there is intentionally **no `DATABASE_URL`** |
| Types | `strict` + `noUncheckedIndexedAccess`; `tsc --noEmit` clean blocks boot |

---

## Quickstart

### 1. Prerequisites

- Node.js ≥ 22 (or Bun 1.4.1 for the single-process venue path)
- An LLM key for each provider (see below)

### 2. Install & configure

```bash
npm install
cp .env.example .env   # then fill in real values
```

| Variable | Required | Used for |
|---|---|---|
| `GROQ_API_KEY` | yes | Round-1 persona chat completions |
| `ZEN_API_KEY` | yes | Round-2 boss chat (OpenCode Zen) |
| `JOIN_CODE_PEPPER` | yes | HMAC pepper for join codes + session tokens |
| `ADMIN_CODE` | venue | Password for `/admin` routes (`x-admin-code` header) |
| `PORT` | no | API port (default `3001`) |
| `REDLINE_API_PORT` | no | Dev-only: where Vite proxies `/api` + `/ws` (default `3001`) |

Boot **fails closed**: `npm run dev` (and the server itself) refuse to start with a
partial env rather than dying mid-event. There is no `.env` in this repo by design.

### 3. Run (dev)

```bash
npm run dev            # env gate → backend API on :3001
npm run dev:frontend   # Vite on :5173, proxies /api + /ws to the backend
```

Open http://127.0.0.1:5173/ — API health at http://127.0.0.1:3001/api/health.

### 4. Run (venue — one process)

```bash
npm run build --workspace frontend
npm run build --workspace backend
node backend/dist/server.js     # serves API + WS + built frontend on $PORT
# or: bun run backend/src/server.ts
```

Single LAN process, local `backend/data/redline.db`, zero cloud deps.

### 5. Verify

```bash
npm run typecheck   # tsc --noEmit, both workspaces — must be clean
npm test            # workspace test suites
```

Enter-to-play, inventory + merchant, and gates → portal → Round-2 flows should be
walked live before doors open.

### Codex primary (GPT-5.6 Luna) — optional

Gameplay prefers Codex GPT-5.6 Luna (R1 effort `low`, R2 effort `medium`) via a
long-lived local `codex app-server` child process, and falls back to the existing
Groq → Zen stack when Codex is unavailable. If Codex is down, the event continues
on Groq/Zen with no code changes.

Backend host requirements:

- Install the Codex CLI on the backend host (`codex --version` must work; override
  with `CODEX_BIN`).
- Connect the account once from **Admin → Codex Luna → Connect with ChatGPT**.
- Persist `CODEX_HOME` (auth state) on durable storage, or reconnect after the
  instance is replaced. Never commit it; it is gitignored.
- Optional tuning: `CODEX_ENABLED`, `CODEX_RUNTIME_DIR`, `CODEX_MAX_CONCURRENCY`,
  `CODEX_RPC_TIMEOUT_MS`, `CODEX_FIRST_ACTIVITY_TIMEOUT_MS`, `CODEX_TURN_TIMEOUT_MS`
  (see `.env.example`). Boot never fails when Codex is missing.

---

## Deploying the frontend (Vercel)

The frontend is live at **[https://eventlinkredline.vercel.app/](https://eventlinkredline.vercel.app/)**.

`vercel.json` lives at the repo root and configures the build and SPA routing:
- **Build command**: `npm run build --workspace frontend`
- **Output directory**: `frontend/dist`
- **Install command**: `npm install`
- **Rewrites**: All routes rewrite to `/index.html` for client-side routing.

### Environment variables on Vercel
Set these in your Vercel Project Settings under **Environment Variables** (see `frontend/.env.example`):

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the backend server (e.g., `http://<your-vps-ip>:25565`) |
| `VITE_WS_URL` | WebSocket URL for real-time events & chat streaming (e.g., `ws://<your-vps-ip>:25565/ws`) |

When these variables are configured, the frontend automatically connects to the remote backend for all API calls and WebSocket streaming. In local development, `npm run dev:frontend` proxies requests using these same values from `frontend/.env`.

---

## Project structure

```
├── frontend/               # Vite + React player UI (this is what ships to Vercel)
│   ├── src/
│   │   ├── screens/        # Enter, Arena, Gates, Round 2, Admin
│   │   ├── api/            # relative /api/* fetchers (dev-proxied by Vite)
│   │   ├── ws/             # typed WS envelope helpers (no local schemas)
│   │   └── shell/          # fullscreen lock, anti-tamper
│   └── public/             # vendored fonts + sounds (offline-safe)
├── backend/                # Fastify API + WS bus + game logic (LAN-only)
│   └── src/
│       ├── bots/           # persona/boss prompts — server-only, never bundled
│       ├── chat/           # Round-1 + Round-2 chat handlers
│       ├── routes/         # teams, merchant, gates, round2, admin
│       ├── llm/            # Codex primary (GPT-5.6 Luna) + Groq + Zen fallback clients
│       ├── contracts/      # single-source WS event schemas
│       ├── db/             # schema.sql + adapter (SQLite file)
│       ├── elo/            # ratings
│       └── portal/         # answer normalization
├── scripts/                # env gate (fail-closed boot)
├── assets/sounds/          # sound credit table (SOUNDS.md)
├── vercel.json             # frontend-only deploy config
├── idea.html               # v2 design doc (read-only reference)
├── DESIGN.md               # normative taste + palette tokens
└── AGENTS.md               # operating contract for automation
```

---

## Docs for organizers

- `AGENTS.md` — operating contract: stack pins, boundaries (no secrets in bundles, no `DATABASE_URL`, no public leaderboard), definition of done.
- `DESIGN.md` — normative design taste; tokens duplicated as Tailwind `@theme` values in `frontend/src/index.css`. Zero ad-hoc hexes.
- `idea.html` — v2 design doc, read-only reference. Organizer-only notes in it never ship to clients.
- `assets/sounds/SOUNDS.md` — vendored-sound credit table.

---

## Attribution

Key-item images via Wikimedia Commons: "Roman – Medallion with Alexander the Great –
Walters 59" © Walters Art Museum (CC BY-SA 3.0); "Vial by SCHOTT Pharma" © Schott
Pharma (CC BY-SA 4.0); "Fires wood flames burning embers coals" by Jon Sullivan
(Public Domain); "Palladium ingot (1 gram) on millimeter paper" by Karl432
(CC BY-SA 4.0); "Cards-Joker-Red.svg" by GW Simulations (Public Domain); "Notebook
with english handwriting" by Lewis Ronald (CC BY-SA 3.0); "Sealing wax on letters" by
Simon A. Eugster (CC BY-SA 3.0); "Parasite script in English" by Mickey Dai Phat
(CC BY-SA 4.0); "Raven on Branch" by Brian Campbell (CC BY-SA 4.0); "Broken glass" by
Jef Poskanzer (CC BY 2.0); "Crystal glass" by Paolo Neo (Public Domain). Bot icons ©
Lorc / Delapouite / sbed via game-icons.net (CC BY 3.0). Full per-file attribution in
`assets/` and `README` history. Sounds credit their MyInstants pages in
`assets/sounds/SOUNDS.md`.

---

## License

© Asthra 11.0 CSE team. All rights reserved — no reuse license granted. If you are
reusing this for your own event, replace this section with your license.
