import { useEffect, useState } from "react";
import type { RoundState } from "@contracts/rounds";

export function useRoundClock(serverNow: string): number {
  const [anchor, setAnchor] = useState(() => ({ server: Date.parse(serverNow), local: performance.now() }));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setAnchor({ server: Date.parse(serverNow), local: performance.now() });
    setElapsed(0);
  }, [serverNow]);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - anchor.local), 200);
    return () => window.clearInterval(id);
  }, [anchor]);
  return anchor.server + elapsed;
}

export function remainingSeconds(state: RoundState, now: number): number {
  const end = state.status === "countdown" ? state.startsAt : state.status === "active" ? state.endsAt : null;
  return end ? Math.max(0, Math.ceil((Date.parse(end) - now) / 1000)) : 0;
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
