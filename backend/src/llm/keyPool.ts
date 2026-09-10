import type { DatabaseAdapter } from "../db/database.js";
import { env } from "../env.js";

export type LlmProvider = "groq" | "zen";

export interface ApiKeyRecord {
  id: number;
  provider: LlmProvider;
  masked_key: string;
  label: string | null;
  is_active: boolean;
  fail_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface DbKeyRow {
  id: number;
  provider: string;
  key_value: string;
  label: string | null;
  is_active: number;
  fail_count: number;
  last_used_at: string | null;
  created_at: string;
}

export function maskKey(raw: string): string {
  if (raw.length <= 12) {
    return "****";
  }
  return `${raw.slice(0, 7)}...${raw.slice(-6)}`;
}

let activeDb: DatabaseAdapter | null = null;

export function registerKeyPoolDb(db: DatabaseAdapter): void {
  activeDb = db;
}

export function getKeyList(db?: DatabaseAdapter): {
  keys: ApiKeyRecord[];
  envFallbacks: {
    groqConfigured: boolean;
    zenConfigured: boolean;
  };
} {
  const targetDb = db ?? activeDb;
  const rows = targetDb
    ? targetDb.all<DbKeyRow>("SELECT id, provider, key_value, label, is_active, fail_count, last_used_at, created_at FROM api_keys ORDER BY id DESC")
    : [];

  return {
    keys: rows.map((r) => ({
      id: r.id,
      provider: r.provider as LlmProvider,
      masked_key: maskKey(r.key_value),
      label: r.label,
      is_active: r.is_active === 1,
      fail_count: r.fail_count,
      last_used_at: r.last_used_at,
      created_at: r.created_at,
    })),
    envFallbacks: {
      groqConfigured: Boolean(env.groqApiKey),
      zenConfigured: Boolean(env.zenApiKey),
    },
  };
}

export function addApiKey(
  provider: LlmProvider,
  keyValue: string,
  label?: string,
  db?: DatabaseAdapter,
): { id: number; provider: LlmProvider; masked_key: string } {
  const targetDb = db ?? activeDb;
  if (!targetDb) {
    throw new Error("Database not initialized for key pool");
  }
  const cleanKey = keyValue.trim();
  if (cleanKey === "") {
    throw new Error("Key cannot be empty");
  }
  const res = targetDb.run(
    "INSERT INTO api_keys (provider, key_value, label, is_active, fail_count) VALUES (?, ?, ?, 1, 0)",
    provider,
    cleanKey,
    label?.trim() || null,
  );
  return {
    id: Number(res.lastInsertRowid),
    provider,
    masked_key: maskKey(cleanKey),
  };
}

export function deleteApiKey(id: number, db?: DatabaseAdapter): void {
  const targetDb = db ?? activeDb;
  if (!targetDb) {
    throw new Error("Database not initialized for key pool");
  }
  targetDb.run("DELETE FROM api_keys WHERE id = ?", id);
}

export function toggleApiKey(id: number, db?: DatabaseAdapter): boolean {
  const targetDb = db ?? activeDb;
  if (!targetDb) {
    throw new Error("Database not initialized for key pool");
  }
  const existing = targetDb.get<{ is_active: number }>("SELECT is_active FROM api_keys WHERE id = ?", id);
  if (!existing) {
    throw new Error("Key not found");
  }
  const next = existing.is_active === 1 ? 0 : 1;
  targetDb.run("UPDATE api_keys SET is_active = ? WHERE id = ?", next, id);
  return next === 1;
}

export interface CandidateKey {
  key: string;
  dbId?: number;
  source: "db" | "env";
}

export function getCandidatesForProvider(provider: LlmProvider, db?: DatabaseAdapter): CandidateKey[] {
  const targetDb = db ?? activeDb;
  const candidates: CandidateKey[] = [];

  if (targetDb) {
    try {
      const rows = targetDb.all<DbKeyRow>(
        "SELECT id, key_value FROM api_keys WHERE provider = ? AND is_active = 1 ORDER BY fail_count ASC, id ASC",
        provider,
      );
      for (const r of rows) {
        if (r.key_value && r.key_value.trim() !== "") {
          candidates.push({ key: r.key_value.trim(), dbId: r.id, source: "db" });
        }
      }
    } catch {
      // Table might not exist yet during bootstrap
    }
  }

  // Fallback to env key
  const envKey = provider === "groq" ? env.groqApiKey : env.zenApiKey;
  if (envKey && !candidates.some((c) => c.key === envKey)) {
    candidates.push({ key: envKey, source: "env" });
  }

  return candidates;
}

export function recordKeySuccess(candidate: CandidateKey, db?: DatabaseAdapter): void {
  const targetDb = db ?? activeDb;
  if (candidate.dbId && targetDb) {
    try {
      targetDb.run(
        "UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        candidate.dbId,
      );
    } catch {
      // ignore
    }
  }
}

export function recordKeyFailure(candidate: CandidateKey, err: unknown, db?: DatabaseAdapter): void {
  const targetDb = db ?? activeDb;
  console.warn(
    `[KeyPool] Failure with ${candidate.source} key (${maskKey(candidate.key)}):`,
    err instanceof Error ? err.message : String(err),
  );
  if (candidate.dbId && targetDb) {
    try {
      targetDb.run(
        "UPDATE api_keys SET fail_count = fail_count + 1 WHERE id = ?",
        candidate.dbId,
      );
    } catch {
      // ignore
    }
  }
}

export async function* runWithRotation<YieldT>(
  provider: LlmProvider,
  streamFn: (apiKey: string) => AsyncGenerator<YieldT>,
  db?: DatabaseAdapter,
): AsyncGenerator<YieldT> {
  const candidates = getCandidatesForProvider(provider, db);
  if (candidates.length === 0) {
    throw new Error(`No API keys configured for provider: ${provider}`);
  }

  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    let yieldedAny = false;

    try {
      const generator = streamFn(candidate.key);
      for await (const chunk of generator) {
        yieldedAny = true;
        yield chunk;
      }
      recordKeySuccess(candidate, db);
      return;
    } catch (err) {
      lastError = err;
      recordKeyFailure(candidate, err, db);
      if (yieldedAny) {
        // Already started streaming chunks to client; rethrow so we don't duplicate conversation parts mid-stream
        throw err;
      }
      // If no chunks yielded yet and more keys available, loop to next key!
      if (i < candidates.length - 1) {
        console.log(`[KeyPool] Auto-switching ${provider} to next available key in pool...`);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`All ${provider} API keys exhausted or failed`);
}
