# AGENTS.md — backend

Baseline: root `AGENTS.md`. Player-facing copy tone follows root `DESIGN.md` (merchant roasts, overlays).

- Fallback is better-sqlite3@13, not plan's v12: v12 ships no Node-26 prebuild (source build fails without VS tools); v13.0.3 verified prebuilt + loads. Non-deprecated.

- Single LAN process: HTTP + WS + static (`/sounds/`, `/bosses/`). `DatabaseAdapter` hides `bun:sqlite` / better-sqlite3. WAL on; every handover/ELO/submission mutation in `db.transaction()`.
- Reasoning traces stay server-side (`reasoning_traces`); clients get final text deltas only. WS contract in `src/contracts/events.ts` is single-sourced.
- Submission pipeline: strip -> decode -> un-reverse -> NFKC + leet fold -> match hashed answers (pepper server-side) -> LLM guard. Silent fail, never which-check-fired.
- ELO: `R' = R + K*(S-E)`, K=32 (40 provisional); teams start 600. On a verified bot-specific item, completion ranks 1–7 also earn `+12/+9/+7/+5/+3/+2/+1`; calculate rank and elapsed time from server state inside the transaction and log the complete audit trail. Rewind truncates context (genuinely forgets).
- Character prompts are server-only. `direction.ts` is the final visible-dialogue contract: direct conversation in the bot's own voice, no screenplay/action formatting or reasoning output, while protected item checks remain private.
- Secrets: answer hashes + `JOIN_CODE_PEPPER` server-only. Admin routes auth-gated; exports (`.db`/`.json`/`.csv`) admin-only.
- Telemetry: Token tracker monitors cumulative prompt/completion tokens and rolling TPS (5s window) with SQLite `game_state` persistence. Telemetry is exposed strictly to authenticated admin diagnostics routes (`/api/admin/system-health`), never to player clients.
- DO NOT: ship purple-box content, expose reasoning bytes on WS/history, add cloud DB, or accept a client-provided timer or completion time. Round timers are a server-authoritative game rule and are exposed only through typed round snapshots.

## Commands

- `bun run src/server.ts` (primary) or `node dist/server.js` (fallback). `tsc --noEmit`.

### Deploying to Remote VPS (`3.110.88.35`)

The VPS runs `/home/ubuntu/redline/dist/server.js` under systemd service `redline.service`. Since the remote directory is not a git clone, updates are pushed via compiled distribution archive:

```bash
# 1. Compile backend locally
npm run build -w @redline/backend

# 2. Package dist
tar -czf dist.tar.gz -C dist .

# 3. SCP to host
scp -i "C:\Users\Chris\Documents\Minecraft\Personal\sshkey\test123.pem" dist.tar.gz ubuntu@3.110.88.35:/home/ubuntu/redline/

# 4. Extract and restart service on remote
ssh -i "C:\Users\Chris\Documents\Minecraft\Personal\sshkey\test123.pem" ubuntu@3.110.88.35 "cd /home/ubuntu/redline && tar -xzf dist.tar.gz -C dist/ && rm dist.tar.gz && sudo systemctl restart redline"

# 5. Clean up local tarball
rm dist.tar.gz
```

- VPS contains only the backend, no need to move the frontend there. Vercel handles frontend.

