import { apiFetch } from "./client";

export interface StandingRow {
  rank: number;
  teamName: string;
  elo: number;
  solved: number;
}

export interface FirstDefeat {
  botId: string;
  completionRank: number | null;
  teamName: string | null;
  playerName: string | null;
  completedAt: string | null;
}

export interface Round2Contribution {
  displayName: string;
  turns: number;
  sharePercent: number;
  filedItem: boolean;
}

export interface Standings {
  round: 1 | 2;
  current: { rank: number; teamName: string; elo: number; solved: number } | null;
  leaderboard: StandingRow[];
  firstDefeats: FirstDefeat[];
  round2: {
    boss: "itachi" | "aizen" | null;
    totalTurns: number;
    players: Round2Contribution[];
  } | null;
}

export async function getStandings(): Promise<Standings> {
  const response = await apiFetch("/api/standings");
  const data = (await response.json()) as Standings & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "standings unavailable");
  return data;
}
