export type RoundNumber = 1 | 2;
export type RoundStatus = "not_started" | "countdown" | "active" | "ended";

export interface RoundState {
  status: RoundStatus;
  startsAt: string | null;
  endsAt: string | null;
  durationSecs: number;
}

export interface RoundSnapshot {
  serverNow: string;
  round1: RoundState;
  round2: RoundState;
}
