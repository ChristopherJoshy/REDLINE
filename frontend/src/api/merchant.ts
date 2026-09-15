import type { BotId } from "@contracts/events";
import { apiFetch } from "./client";

export type SubmitResult =
  | { result: "verified"; botId: BotId; already?: true; eloDelta?: number; credits?: number; soundId: string }
  | { result: "troll"; botId?: BotId; line: string; soundId: string };

export interface MerchantState {
  credits: number;
  clues: Array<{ botId: string; tier: number }>;
}

export interface ClueResult {
  botId: string;
  tier: number;
  clue: string;
  credits: number;
  owned: boolean;
}

export async function submitItem(text: string): Promise<SubmitResult> {
  const res = await apiFetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json()) as SubmitResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "submit failed");
  }
  return data;
}

export async function merchantState(): Promise<MerchantState> {
  const res = await apiFetch("/api/merchant/state");
  const data = (await res.json()) as MerchantState & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "counter unreachable");
  }
  return data;
}

export async function buyClue(botId: string, tier: number): Promise<ClueResult> {
  const res = await apiFetch("/api/merchant/clue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botId, tier }),
  });
  const data = (await res.json()) as ClueResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "clue purchase failed");
  }
  return data;
}
