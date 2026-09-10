export interface Gates {
  round1Open: boolean;
  vaultOpen: boolean;
  qualified: boolean;
  solved: number;
  round1Size: number;
}

export async function getGates(): Promise<Gates> {
  const res = await fetch("/api/gates");
  if (!res.ok) {
    throw new Error("no gates");
  }
  return (await res.json()) as Gates;
}

async function adminPost(path: string, code: string): Promise<unknown> {
  const res = await fetch(path, { method: "POST", headers: { "x-admin-code": code } });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    throw new Error("admin failed");
  }
  return data;
}

export function endRound1(code: string): Promise<unknown> {
  return adminPost("/api/admin/end-round1", code);
}

export function computeTop5(code: string): Promise<{ top5: string[] }> {
  return adminPost("/api/admin/compute-top5", code) as Promise<{ top5: string[] }>;
}

export function openVault(code: string): Promise<unknown> {
  return adminPost("/api/admin/open-vault", code);
}

export async function enterRound2(): Promise<{ boss: string }> {
  const res = await fetch("/api/round2/enter", { method: "POST" });
  const data = (await res.json()) as { boss: string } & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "vault sealed");
  }
  return data;
}
