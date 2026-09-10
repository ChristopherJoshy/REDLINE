import type { BotId } from "@contracts/events";

export type SubmitResult =
  | { result: "verified"; botId: BotId; already?: true; eloDelta?: number; soundId: string }
  | { result: "troll"; botId?: BotId; line: string; soundId: string };

export async function submitItem(text: string): Promise<SubmitResult> {
  const res = await fetch("/api/submit", {
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
