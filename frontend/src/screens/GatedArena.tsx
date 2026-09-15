import { useEffect, useState } from "react";
import { Clock3, LockKeyhole, ArrowRight } from "lucide-react";
import type { BotId } from "@contracts/events";
import ArenaScreen from "@/screens/ArenaScreen";
import RoundTwoScreen from "@/screens/RoundTwoScreen";
import PortalTransition from "@/portal/PortalTransition";
import RoundControls from "@/components/RoundControls";
import { enterRound2, getGates, type Gates } from "@/api/gates";
import { useRoundClock, remainingSeconds, formatClock } from "@/lib/useRoundClock";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { Button } from "@/components/ui/button";

function Waiting({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  useDocumentTitle(`${title} — REDLINE`);
  return <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-16">
    <div className="w-full max-w-lg text-center"><LockKeyhole className="mx-auto mb-6 h-9 w-9 text-brass" aria-hidden="true" />
      <h1 className="font-display text-3xl font-bold text-text-1">{title}</h1><div className="mt-4 text-text-2">{children}</div>
    </div>
  </section>;
}

function PortalGate({ onEnter }: { onEnter: (boss: BotId) => void }): React.JSX.Element {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [travel, setTravel] = useState<BotId | null>(null);
  async function enter(): Promise<void> {
    setBusy(true); setError("");
    try {
      const { boss } = await enterRound2();
      if (boss !== "itachi" && boss !== "aizen") throw new Error("Could not assign a boss.");
      setTravel(boss);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not enter the vault."); setBusy(false); }
  }
  if (travel) return <PortalTransition onDone={() => onEnter(travel)} />;
  return <Waiting title="Your team qualified"><p>Round 2 is open. Your opponent waits inside the vault.</p>
    <Button className="mt-6" disabled={busy} onClick={() => void enter()}>{busy ? "Opening…" : "Enter the vault"}<ArrowRight size={18} /></Button>
    {error && <p role="alert" className="mt-4 text-seal">{error}</p>}
  </Waiting>;
}

export default function GatedArena({ teamId, displayName, locked }: { teamId: string; displayName: string; locked: boolean }): React.JSX.Element {
  const [gates, setGates] = useState<Gates | null>(null);
  const [boss, setBoss] = useState<BotId | null>(null);
  const [error, setError] = useState("");
  const now = useRoundClock(gates?.serverNow ?? new Date(0).toISOString());
  useEffect(() => {
    let dead = false;
    let timer: number | undefined;
    async function load(): Promise<void> {
      try { const result = await getGates(); if (!dead) { setGates(result); setError(""); } }
      catch { if (!dead) setError("Connection interrupted. Checking round status…"); }
      finally { if (!dead) timer = window.setTimeout(load, 1000); }
    }
    void load();
    return () => { dead = true; window.clearTimeout(timer); };
  }, [teamId]);

  if (!gates) return <Waiting title="Checking round status"><p role="status">{error || "Connecting to the event…"}</p></Waiting>;
  const r1 = gates.round1;
  const r2 = gates.round2;
  const countingRound = r2.status === "countdown" ? 2 : r1.status === "countdown" ? 1 : null;
  if (countingRound) {
    const remaining = remainingSeconds(countingRound === 1 ? r1 : r2, now);
    return <Waiting title={`Round ${countingRound} starts soon`}>
      <p className="font-code text-7xl font-medium tabular-nums text-brass" role="timer" aria-label={`${remaining} seconds until Round ${countingRound}`}>{String(remaining).padStart(2, "0")}</p>
      <p className="mt-6">{remaining ? "Get ready. Play opens when the countdown finishes." : "Confirming the start of the round…"}</p>
    </Waiting>;
  }
  if (r2.status === "ended" || (r2.status === "active" && remainingSeconds(r2, now) === 0)) return <Waiting title="Round 2 has ended"><p>Time is up. The organizers will announce the results.</p></Waiting>;
  if (r2.status === "active") {
    if (!gates.qualified) return <Waiting title="Round 1 complete"><p>Round 2 is now underway for the five finalists. Thank you for playing.</p></Waiting>;
    if (!boss) return <PortalGate onEnter={setBoss} />;
    return <RoundTwoScreen teamId={teamId} boss={boss} locked={locked || Boolean(error)} onRoundEnd={() => { void getGates().then(setGates).catch(() => {}); }} />;
  }
  if (r1.status === "not_started") return <Waiting title="Round 1 has not begun"><p>Your team is ready. The organizers will start a 30-second countdown when play is about to begin.</p><p role="status" className="mt-6 text-sm text-text-3">{error || "Waiting for the organizers"}</p></Waiting>;
  if (r1.status === "ended" || remainingSeconds(r1, now) === 0) return <Waiting title="Round 1 has ended"><p>Chats and submissions are closed. Wait here for the organizers to start Round 2.</p></Waiting>;
  if (gates.solved >= gates.round1Size) return <Waiting title="All eight relics filed"><p>Your Round 1 record is complete. Wait here for the next round.</p></Waiting>;
  return <>
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-1 px-6 py-2 text-sm">
      <span>Round 1 <span className="ml-2 text-text-3">{gates.solved} / {gates.round1Size} filed</span></span>
      <span className="flex items-center gap-2"><Clock3 size={16} /><span className="font-code tabular-nums">{formatClock(remainingSeconds(r1, now))}</span> remaining</span>
    </div>
    {error && <p role="status" className="bg-seal-wash px-6 py-2 text-sm text-seal">{error}</p>}
    <ArenaScreen teamId={teamId} displayName={displayName} locked={locked || Boolean(error)} />
  </>;
}

export function GatesPanel(): React.JSX.Element {
  const [code, setCode] = useState("");
  return <section className="space-y-6 p-6"><label className="block text-sm">Admin code<input type="password" value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 block min-h-11 rounded-md border border-border-strong bg-surface-1 px-3" /></label>{code && <RoundControls adminCode={code} />}</section>;
}
