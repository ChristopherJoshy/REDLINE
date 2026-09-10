# AGENTS.md — backend

Baseline: root `AGENTS.md`. Player-facing copy tone follows root `DESIGN.md` (merchant roasts, overlays).

- Fallback is better-sqlite3@13, not plan's v12: v12 ships no Node-26 prebuild (source build fails without VS tools); v13.0.3 verified prebuilt + loads. Non-deprecated.

- Single LAN process: HTTP + WS + static (`/sounds/`, `/bosses/`). `DatabaseAdapter` hides `bun:sqlite` / better-sqlite3. WAL on; every handover/ELO/submission mutation in `db.transaction()`.
- Reasoning traces stay server-side (`reasoning_traces`); clients get final text deltas only. WS contract in `src/contracts/events.ts` is single-sourced.
- Submission pipeline: strip -> decode -> un-reverse -> NFKC + leet fold -> match hashed answers (pepper server-side) -> LLM guard. Silent fail, never which-check-fired.
- ELO: `R' = R + K*(S-E)`, K=32 (40 provisional); teams start 600. Log every delta. Rewind truncates context (genuinely forgets).
- Secrets: answer hashes + `JOIN_CODE_PEPPER` server-only. Admin routes auth-gated; exports (`.db`/`.json`/`.csv`) admin-only.
- DO NOT: ship purple-box content, add timers, expose reasoning bytes on WS/history, add cloud DB.

## Commands

- `bun run src/server.ts` (primary) or `node dist/server.js` (fallback). `tsc --noEmit`.
