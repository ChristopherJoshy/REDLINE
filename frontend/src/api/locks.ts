import { apiFetch } from "./client";
import type { BotId } from "@contracts/events";

export interface BotLockInfo {
  displayName: string;
  since: string;
}

export type BotLockMap = Partial<Record<BotId, BotLockInfo>>;

export async function getLocks(): Promise<BotLockMap> {
  const res = await apiFetch("/api/bot-locks");
  if (!res.ok) return {};
  const data = (await res.json()) as { locks?: BotLockMap };
  return data.locks ?? {};
}

// Take (or refresh) the lock. Throws with holder name on 409.
export async function acquireLock(botId: BotId): Promise<BotLockMap> {
  const res = await apiFetch("/api/bot-lock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botId }),
  });
  const data = (await res.json().catch(() => null)) as { locks?: BotLockMap; holder?: BotLockInfo; error?: string } | null;
  if (!res.ok) {
    const err = new Error(data?.error ?? "lock failed") as Error & { holder?: BotLockInfo; status?: number };
    if (data?.holder) err.holder = data.holder;
    err.status = res.status;
    throw err;
  }
  return data?.locks ?? {};
}

export async function releaseLock(botId: BotId): Promise<void> {
  try {
    await apiFetch("/api/bot-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId }),
    });
  } catch {
    // Presence release is best-effort; the lease expires on its own.
  }
}
