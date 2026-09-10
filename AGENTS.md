# AGENTS.md — REDLINE Arena (root contract)

Live AI social-engineering CTF (Asthra 11.0 CSE event). Source of truth: `idea.html` (v2 design
doc, read-only; purple organizer boxes never ship to clients). Plan: `local://redline-arena-plan.md`.

## Stack pins

- Frontend: Vite 7.3.6 + React 19.3.0 + TS strict + Tailwind v4 + shadcn new-york + GSAP 3.12.5 + three 0.185.1.
- Backend: Bun 1.4.1 primary (`bun:sqlite`); fallback Node + Fastify 5.12.3 + `ws` 8.21.3 + better-sqlite3@12 behind `DatabaseAdapter`. Single LAN process, local SQLite only.
- All files TypeScript. `strict` + `noUncheckedIndexedAccess`. `tsc --noEmit` clean blocks boot.

## Design taste + palette

- Normative: `DESIGN.md`. Values duplicated as `@theme` tokens in `frontend/src/index.css`.
- Zero ad-hoc hexes outside those tokens. No per-page CSS. One accent per viewport.
- Skills (read before UI work): `design-taste-frontend`, `ui-ux-pro-max`, `ui-styling`, `frontend-design`.

## Commands

- `npm run dev` — fails closed listing missing env (`GROQ_API_KEY`, `ZEN_API_KEY`, `JOIN_CODE_PEPPER`) if absent. No partial boot. No `DATABASE_URL` (local SQLite file only).
- `npm run build`, `npm run test`, `tsc --noEmit` — all must pass.
- Venue runs one process (`bun run backend/src/server.ts` or `node dist/server.js`), zero cloud deps.

### Remote VPS Backend Deployment

VPS host: `ubuntu@3.110.88.35` (service: `redline.service`, port: 25565, directory: `/home/ubuntu/redline`).
Key path: `C:\Users\Chris\Documents\Minecraft\Personal\sshkey\test123.pem`.

To update the remote backend:
1. Build locally:
   ```bash
   npm run build
   ```
2. Archive the compiled backend distribution:
   ```bash
   tar -czf backend/dist.tar.gz -C backend/dist .
   ```
3. Transfer archive to VPS:
   ```bash
   scp -i "C:\Users\Chris\Documents\Minecraft\Personal\sshkey\test123.pem" backend/dist.tar.gz ubuntu@3.110.88.35:/home/ubuntu/redline/
   ```
4. Extract on VPS and restart `redline.service`:
   ```bash
   ssh -i "C:\Users\Chris\Documents\Minecraft\Personal\sshkey\test123.pem" ubuntu@3.110.88.35 "cd /home/ubuntu/redline && tar -xzf dist.tar.gz -C dist/ && rm dist.tar.gz && sudo systemctl restart redline"
   ```
5. Clean up local archive:
   ```bash
   rm backend/dist.tar.gz
   ```

## Agent boundaries

- Nearest AGENTS.md wins (root baseline; `frontend/` and `backend/` override).
- No bot secrets / purple-box content in player bundles. No asset generation (licensed generics only). No public leaderboard route. No `DATABASE_URL`/Supabase/Postgres.
- Shared WS contracts single-sourced in `backend/src/contracts/events.ts`, imported by frontend. No duplicated schemas.

## Definition of Done

- Enter-to-play, inventory+merchant, gates-to-portal-to-R2 flows verified live (see plan Verification).
- Cold-load assets render from real URLs; repo grep for `generated|placeholder.png|fake-fallback` empty.
- `tsc --noEmit` clean, zero `.js`-only sources. Axe + reduced-motion + offline-sound checks pass.
