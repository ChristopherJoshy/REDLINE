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
