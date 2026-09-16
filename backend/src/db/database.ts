// DatabaseAdapter hides the bun:sqlite / better-sqlite3 swap.
// Bun primary: `bun run src/server.ts` (bun:sqlite). Node fallback: `node dist/server.js` (better-sqlite3).
import { readFileSync } from "node:fs";

declare const Bun: unknown;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DatabaseAdapter {
  exec(sql: string): void;
  run(sql: string, ...params: unknown[]): RunResult;
  get<T>(sql: string, ...params: unknown[]): T | undefined;
  all<T>(sql: string, ...params: unknown[]): T[];
  transaction<T>(fn: () => T): T;
  backup(path: string): Promise<void>;
  close(): void;
}

interface SyncDriver {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

function loadDriver(path: string): SyncDriver {
  if (typeof Bun !== "undefined") {
    const { Database } = require("bun:sqlite") as { Database: new (path: string) => SyncDriver };
    const db = new Database(path);
    db.exec("PRAGMA journal_mode = WAL;");
    return db as unknown as SyncDriver;
  }
  const Database = require("better-sqlite3") as new (path: string) => SyncDriver;
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

export function openDatabase(path: string, schemaPath: string): DatabaseAdapter {
  const driver = loadDriver(path);
  driver.exec(readFileSync(schemaPath, "utf8"));
  try {
    driver.exec("ALTER TABLE teams ADD COLUMN join_code TEXT;");
  } catch {
    // column already exists
  }
  try {
    driver.exec("ALTER TABLE teams ADD COLUMN clue_credits INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // column already exists
  }
  try {
    driver.exec("ALTER TABLE teams ADD COLUMN round2_eligible INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // column already exists
  }
  try {
    driver.exec("ALTER TABLE teams ADD COLUMN is_qualified INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // column already exists
  }
  try {
    driver.exec("ALTER TABLE teams ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;");
  } catch {
    // column already exists
  }
  try {
    driver.exec("ALTER TABLE cover_profiles ADD COLUMN bot_id TEXT NOT NULL DEFAULT '*';");
  } catch {
    // column already exists
  }
  // Recreate cover_profiles with correct composite PK (team_id, display_name, bot_id) if needed
  const pkCheck = driver.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cover_profiles'").get() as { sql: string } | undefined;
  if (pkCheck && !pkCheck.sql.includes("team_id, display_name, bot_id")) {
    driver.exec("DELETE FROM cover_profiles WHERE bot_id = '*'");
    driver.exec(`CREATE TABLE cover_profiles_new (
      team_id TEXT NOT NULL REFERENCES teams(id),
      display_name TEXT NOT NULL,
      bot_id TEXT NOT NULL DEFAULT '*',
      alias TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      affiliation TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (team_id, display_name, bot_id)
    )`);
    driver.exec("INSERT INTO cover_profiles_new SELECT * FROM cover_profiles");
    driver.exec("DROP TABLE cover_profiles");
    driver.exec("ALTER TABLE cover_profiles_new RENAME TO cover_profiles");
  }
  driver.exec("DELETE FROM cover_profiles WHERE bot_id = '*';");
  // Migrate: add obtained_by to team_inventory if missing
  try { driver.exec("ALTER TABLE team_inventory ADD COLUMN obtained_by TEXT;"); } catch { /* already exists */ }
  // Migrate: add claim acknowledgement to team_inventory if missing
  try { driver.exec("ALTER TABLE team_inventory ADD COLUMN claimed_at TEXT;"); } catch { /* already exists */ }
  // Migrate: add display_name to chat_logs if missing
  try { driver.exec("ALTER TABLE chat_logs ADD COLUMN display_name TEXT NOT NULL DEFAULT '';"); } catch { /* already exists */ }
  // Migrate: member session nonce + presence for force-logout and logout marking
  try { driver.exec("ALTER TABLE team_members ADD COLUMN session_nonce TEXT NOT NULL DEFAULT '';"); } catch { /* already exists */ }
  try { driver.exec("ALTER TABLE team_members ADD COLUMN presence TEXT NOT NULL DEFAULT 'offline';"); } catch { /* already exists */ }
  try { driver.exec("ALTER TABLE team_members ADD COLUMN last_seen_at TEXT;"); } catch { /* already exists */ }
  // Track the globally ordered first defeats even when opening an existing
  // venue database created before the ranking redesign.
  driver.exec(`CREATE TABLE IF NOT EXISTS bot_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    team_id TEXT NOT NULL REFERENCES teams(id),
    completed_by TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    completion_rank INTEGER NOT NULL,
    elapsed_secs INTEGER NOT NULL DEFAULT 0,
    base_delta INTEGER NOT NULL DEFAULT 0,
    speed_bonus INTEGER NOT NULL DEFAULT 0,
    elo_delta INTEGER NOT NULL DEFAULT 0,
    UNIQUE (bot_id, team_id),
    UNIQUE (bot_id, completion_rank)
  )`);
  driver.exec(`INSERT OR IGNORE INTO bot_completions
    (bot_id, round, team_id, completed_by, verified_at, completion_rank)
    SELECT bot_id,
      CASE WHEN bot_id IN ('itachi', 'aizen') THEN 2 ELSE 1 END,
      team_id,
      COALESCE(NULLIF(obtained_by, ''), (SELECT name FROM teams WHERE teams.id = team_inventory.team_id)),
      COALESCE(verified_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      ROW_NUMBER() OVER (PARTITION BY bot_id ORDER BY verified_at ASC, rowid ASC)
    FROM team_inventory
    WHERE status = 'verified' AND verified_at IS NOT NULL`);
  return {
    exec: (sql) => driver.exec(sql),
    run: (sql, ...params) => {
      const r = driver.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
    },
  get: <T>(sql: string, ...params: unknown[]): T | undefined =>
    (driver.prepare(sql).get(...params) as T | null | undefined) ?? undefined,
    all: <T>(sql: string, ...params: unknown[]): T[] =>
      driver.prepare(sql).all(...params) as T[],
    transaction: <T>(fn: () => T): T => driver.transaction(fn)(),
    backup: async (dest: string): Promise<void> => {
      if (typeof Bun !== "undefined") {
        const bytes = await (driver as unknown as { backup(dest: string): Promise<number> }).backup(dest);
        void bytes;
        return;
      }
      await (driver as unknown as { backup(dest: string): Promise<void> }).backup(dest);
    },
    close: () => driver.close(),
  };
}
