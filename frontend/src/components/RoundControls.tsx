import { useEffect, useState } from "react";
import { Clock3, Play, Square, CheckCircle2 } from "lucide-react";
import type { RoundNumber, RoundSnapshot, RoundState } from "@contracts/rounds";
import { controlRound, getAdminRounds } from "@/api/gates";
import { Button } from "@/components/ui/button";
import { formatClock, remainingSeconds, useRoundClock } from "@/lib/useRoundClock";

const LABELS = { not_started: "Not started", countdown: "Starting", active: "In progress", ended: "Ended" };

function RoundControl({ number, state, now, canStart, busy, onAction }: {
  number: RoundNumber; state: RoundState; now: number; canStart: boolean; busy: boolean;
  onAction: (round: RoundNumber, action: "start" | "stop" | "extend", body?: Record<string, unknown>) => Promise<void>;
}): React.JSX.Element {
  const [minutes, setMinutes] = useState(number === 1 ? "60" : "30");
  const [mode, setMode] = useState<"duration" | "end">("duration");
  const [end, setEnd] = useState("");
  const valid = mode === "duration" ? Number(minutes) > 0 && Number(minutes) <= 1440 : Date.parse(end) > now + 30_000;
  return <section className="rounded-lg border border-border bg-surface-1 p-6">
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="font-display text-xl font-bold">Round {number}</h3><p className="mt-1 text-sm text-text-3">{number === 1 ? "Eight characters and the merchant" : "The five finalists enter the vault"}</p></div>
      <span className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"><CheckCircle2 size={16} />{LABELS[state.status]}</span>
    </div>
    {state.status === "not_started" ? <form className="mt-6 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (valid) void onAction(number, "start", mode === "duration" ? { durationSecs: Math.round(Number(minutes) * 60) } : { endsAt: new Date(end).toISOString() });
    }}>
      <label className="block text-sm font-medium">Set the round length
        <select className="mt-2 block min-h-11 w-full rounded-md border border-border-strong bg-surface-1 px-3" value={mode} onChange={(event) => setMode(event.target.value as "duration" | "end")}>
          <option value="duration">Duration in minutes</option><option value="end">Finish at a specific time</option>
        </select>
      </label>
      {mode === "duration" ? <label className="block text-sm">Minutes of play<input required type="number" min="1" max="1440" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} className="mt-2 block min-h-11 w-full rounded-md border border-border-strong bg-surface-1 px-3 font-code" /></label>
        : <label className="block text-sm">End time (your local time)<input required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 block min-h-11 w-full rounded-md border border-border-strong bg-surface-1 px-3" /></label>}
      <p className="text-sm text-text-3">Players see a 30-second countdown before play begins. The countdown is separate from the playing time.</p>
      <Button type="submit" disabled={!valid || !canStart || busy}><Play size={16} />Start Round {number}</Button>
      {!canStart && <p className="text-sm text-text-3">End Round 1 before starting Round 2.</p>}
    </form> : <div className="mt-6">
      {state.status !== "ended" && <><p className="flex items-center gap-2 text-sm text-text-3"><Clock3 size={16} />{state.status === "countdown" ? "Starts in" : "Time remaining"}</p><p className="mt-1 font-code text-4xl tabular-nums">{formatClock(remainingSeconds(state, now))}</p></>}
      {state.endsAt && <p className="mt-3 text-sm text-text-3">Scheduled finish: {new Date(state.endsAt).toLocaleString()}</p>}
      {state.status !== "ended" && <div className="mt-5 flex flex-wrap gap-3">
        {state.status === "active" && <Button variant="ghost" disabled={busy} onClick={() => void onAction(number, "extend", { addSecs: 300 })}>Add 5 minutes</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => void onAction(number, "stop")}><Square size={16} />End Round {number}</Button>
      </div>}
    </div>}
  </section>;
}

export default function RoundControls({ adminCode }: { adminCode: string }): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const now = useRoundClock(snapshot?.serverNow ?? new Date(0).toISOString());
  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      try { const data = await getAdminRounds(adminCode); if (!dead) { setSnapshot(data); setError(""); } }
      catch (err) { if (!dead) setError(err instanceof Error ? err.message : "Could not load rounds."); }
    }
    void load();
    const id = window.setInterval(load, 1000);
    return () => { dead = true; window.clearInterval(id); };
  }, [adminCode]);
  async function action(round: RoundNumber, kind: "start" | "stop" | "extend", body?: Record<string, unknown>): Promise<void> {
    setBusy(true); setError(""); setMessage("");
    try { setSnapshot(await controlRound(adminCode, round, kind, body)); setMessage(kind === "start" ? `Round ${round} countdown started.` : kind === "stop" ? `Round ${round} ended.` : `Added 5 minutes to Round ${round}.`); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update round."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-5xl space-y-6">
    <header><h2 className="font-display text-2xl font-bold">Round controls</h2><p className="mt-2 max-w-2xl text-text-2">Set the playing time, then start each round. Round 2 automatically selects the five highest-ranked teams.</p></header>
    {error && <p role="alert" className="rounded border border-seal bg-seal-wash p-3 text-seal">{error}</p>}
    {message && <p role="status" className="text-sm text-text-2">{message}</p>}
    {snapshot ? <div className="grid gap-6 lg:grid-cols-2">{([1, 2] as const).map((number) => <RoundControl key={number} number={number} state={number === 1 ? snapshot.round1 : snapshot.round2} now={now} busy={busy} canStart={number === 1 || snapshot.round1.status === "ended"} onAction={action} />)}</div> : <p role="status">Loading round controls…</p>}
  </div>;
}
