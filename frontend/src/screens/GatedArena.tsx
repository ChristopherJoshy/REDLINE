import { useEffect, useState, useRef } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { BotId } from "@contracts/events";
import { Button } from "@/components/ui/button";
import ArenaScreen from "@/screens/ArenaScreen";
import RoundTwoScreen from "@/screens/RoundTwoScreen";
import PortalTransition from "@/portal/PortalTransition";
import GachaReveal from "@/portal/GachaReveal";
import { computeTop5, endRound1, enterRound2, getGates, openVault, type Gates } from "@/api/gates";

function SealedScreen({ message = "Round 1 is done for your team. Wait for the organizers to open round 2." }: { message?: string }): React.JSX.Element {
  useDocumentTitle("Round 1 Sealed — REDLINE Arena");
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-cover bg-center p-[var(--space)] text-center" style={{ backgroundImage: "url('/backgrounds/login-uiwork.png')" }}>
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(5,7,10,0.78)]" />
      <div className="relative flex flex-col items-center gap-3">
      <span aria-hidden="true" className="acc-bar block h-[3px] w-12 rounded-full" />
      <h2 className="font-[family-name:var(--font-display)] text-[24px] font-bold tracking-[0.08em] text-white">
        SEALED
      </h2>
      <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
        {message}
      </p>
      </div>
    </div>
  );
}

function CountdownBanner({ endsAt, round }: { endsAt: string; round: 1 | 2 }): React.JSX.Element {
  const [left, setLeft] = useState(0);
  useDocumentTitle(`Round ${round} Starting — REDLINE Arena`);
  useEffect(() => {
    function tick(): void {
      const ms = new Date(endsAt).getTime() - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-cover bg-center p-[var(--space)]" style={{ backgroundImage: "url('/backgrounds/login-uiwork.png')" }}>
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(5,7,10,0.78)]" />
      <div className="relative flex flex-col items-center justify-center gap-4">
      <span aria-hidden="true" className="block h-[3px] w-12 bg-[var(--color-brass)] animate-pulse" />
      <h2 className="font-[family-name:var(--font-display)] text-[28px] font-bold text-[var(--color-text-1)]">
        Round {round} Begins In
      </h2>
      <p className="font-[family-name:var(--font-code)] text-[48px] font-bold text-[var(--color-brass)] tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </p>
      <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
        {round === 1 ? "The arena is preparing. Chats and submissions unlock at zero." : "Prepare yourself. The vault is opening."}
      </p>
      </div>
    </div>
  );
}

function RoundEndedScreen(): React.JSX.Element {
  useDocumentTitle("Round 2 Ended — REDLINE Arena");
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-cover bg-center p-[var(--space)] text-center" style={{ backgroundImage: "url('/backgrounds/login-uiwork.png')" }}>
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(5,7,10,0.78)]" />
      <div className="relative flex flex-col items-center gap-3">
        <span aria-hidden="true" className="block h-[3px] w-12 bg-[var(--color-seal)]" />
        <h2 className="font-[family-name:var(--font-display)] text-[24px] font-bold text-[var(--color-text-1)]">
          Time Expired
        </h2>
        <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
          Round 2 has ended. The vault is now sealed.
        </p>
      </div>
    </div>
  );
}

function PortalGate({ onEnter }: { onEnter: (boss: BotId) => void }): React.JSX.Element {
  useDocumentTitle("Vault — REDLINE Arena");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // gachaBoss = boss assigned, waiting for gacha + transition to finish
  const [gachaBoss, setGachaBoss] = useState<BotId | null>(null);
  // travelBoss = after gacha, trigger the portal transition
  const [travelBoss, setTravelBoss] = useState<BotId | null>(null);

  async function step(): Promise<void> {
    setError("");
    setLoading(true);
    try {
      const { boss } = await enterRound2();
      if (boss !== "itachi" && boss !== "aizen") {
        throw new Error("bad boss");
      }
      setGachaBoss(boss);
    } catch (e: any) {
      setLoading(false);
      if (e.message === "not_selected") {
        setError("Your team was not selected for Round 2.");
      } else if (e.message === "vault sealed or not qualified") {
        setError("The vault has not opened yet. Wait for the organizers.");
      } else {
        setError(e.message === "bad boss" ? "Unexpected boss assignment." : "The vault is sealed or Round 2 has not started.");
      }
    }
  }

  // After gacha animation finishes → portal transition
  if (travelBoss !== null) {
    const boss = travelBoss;
    return <PortalTransition onDone={() => onEnter(boss)} />;
  }

  // Gacha spin phase
  if (gachaBoss !== null) {
    return <GachaReveal boss={gachaBoss} onDone={() => setTravelBoss(gachaBoss)} />;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-cover bg-center p-[var(--space)] text-center" style={{ backgroundImage: "url('/backgrounds/login-ui.png')" }}>
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(5,7,10,0.78)]" />
      <div className="relative flex flex-col items-center gap-4">
        <span aria-hidden="true" className="acc-bar block h-[3px] w-12 rounded-full" />
        <h2 className="font-[family-name:var(--font-vault)] text-[26px] font-bold tracking-[0.06em] text-white">
          The vault stands open
        </h2>
        <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
          One boss waits inside. Step through when ready.
        </p>
        <button
          type="button"
          onClick={() => void step()}
          disabled={loading}
          className="redline-cta flex min-h-[52px] items-center gap-3 rounded-[8px] px-8 py-4 text-[16px] font-semibold active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span>Opening…</span>
            </>
          ) : (
            <span>Step through</span>
          )}
        </button>
        {error !== "" && (
          <div className="flex flex-col items-center gap-2">
            <p role="alert" className="acc-text text-[14px]">{error}</p>
            <button
              type="button"
              onClick={() => { setError(""); void step(); }}
              className="text-[12px] font-mono text-white/50 hover:text-white/80 underline transition"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GatedArena({ teamId, displayName, locked }: { teamId: string; displayName: string; locked: boolean }): React.JSX.Element {
  const [gates, setGates] = useState<Gates | null>(null);
  const [boss, setBoss] = useState<BotId | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<string | null>(null);
  const [roundEnded, setRoundEnded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      try {
        const g = await getGates();
        if (!dead) {
          setGates(g);
          if (g.round2Status === "countdown" && !countdownEndsAt) {
            // Fetch countdown endsAt from a lightweight endpoint
            // The server broadcasts it via WS, but we also poll
          }
          if (g.round2Status === "off" && countdownEndsAt) {
            setCountdownEndsAt(null);
          }
        }
      } catch {
        // Keep the last gate frame on transient failure.
      }
    }
    void load();
    // Gates are the authority for whether the player can act. Keep this tight so
    // a frozen round never leaves an interactive arena visible for several seconds.
    const timer = window.setInterval(load, 1_000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // Listen for round2 WS events via a hidden WS or rely on gate polling
  // Since the existing WS is in useBotStream, we handle countdown via polling
  useEffect(() => {
    if (!gates) return;
    if (gates.round2Status === "countdown" && !countdownEndsAt) {
      // Calculate approximate endsAt from timeLeft
      const endsAt = new Date(Date.now() + gates.round2TimeLeft * 1000).toISOString();
      setCountdownEndsAt(endsAt);
    }
    if ((gates.round2Status === "off" || gates.round2Status === "paused") && countdownEndsAt) {
      setCountdownEndsAt(null);
    }
    if (gates.round2Status === "active") {
      setCountdownEndsAt(null);
    }
  }, [gates?.round2Status]);

  const round1Active = gates !== null
    && gates.round1.status === "active"
    && gates.round1Open
    && (gates.round1.endsAt === null || Date.parse(gates.round1.endsAt) > now);
  const round2Active = gates !== null
    && gates.round2.status === "active"
    && gates.round2Status === "active"
    && (gates.round2.endsAt === null || Date.parse(gates.round2.endsAt) > now);

  if (boss !== null) {
    if (roundEnded || !round2Active) {
      return <RoundEndedScreen />;
    }
    return <RoundTwoScreen teamId={teamId} boss={boss} locked={locked && round2Active} onRoundEnd={() => setRoundEnded(true)} />;
  }
  if (gates !== null && gates.round2Status !== "off" && !gates.qualified) {
    return <SealedScreen message="Sorry, you are not selected to move to Round 2." />;
  }
  if (countdownEndsAt) {
    return <CountdownBanner endsAt={countdownEndsAt} round={2} />;
  }
  if (gates !== null && gates.qualified && gates.vaultOpen && round2Active) {
    return <PortalGate onEnter={setBoss} />;
  }
  if (gates !== null && gates.solved >= gates.round1Size) {
    return <SealedScreen />;
  }
  if (gates === null) {
    return <SealedScreen message="Checking the round status before opening the arena." />;
  }
  if (gates.round1.status === "countdown" && gates.round1.startsAt !== null) {
    return <CountdownBanner endsAt={gates.round1.startsAt} round={1} />;
  }
  if (!round1Active) {
    const message = gates.round1.status === "countdown"
      ? "Round 1 has not opened yet. Chats and submissions will unlock when the countdown ends."
      : gates.round1.status === "not_started"
      ? "Round 1 has not started yet."
      : "Round 1 is frozen. Chats, clue purchases, and submissions are no longer available.";
    return <SealedScreen message={message} />;
  }
  return (
    <ArenaScreen teamId={teamId} displayName={displayName} locked={locked && round1Active} />
  );
}

export function GatesPanel(): React.JSX.Element {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  async function run(fn: (c: string) => Promise<unknown>, label: string): Promise<void> {
    setNote("");
    try {
      const res = (await fn(code)) as { top5?: string[] };
      setNote(`${label}: ${res.top5 !== undefined ? res.top5.join(", ") : "ok"}`);
    } catch {
      setNote(`${label}: failed`);
    }
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-4" aria-label="Round gates">
      <h2 className="text-[16px] font-bold text-[var(--color-text-1)]">Round gates</h2>
      <input
        type="password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-label="Admin code"
        placeholder="Admin code"
        className="min-h-[44px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-1)] px-4 text-[16px] text-[var(--color-text-1)]"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={code === ""} onClick={() => void run(endRound1, "End Round 1")}>
          End Round 1 for all
        </Button>
        <Button variant="ghost" disabled={code === ""} onClick={() => void run(computeTop5, "Top 5")}>
          Compute Top 5 by ELO
        </Button>
        <Button variant="ghost" disabled={code === ""} onClick={() => void run(openVault, "Vault")}>
          Open the Vault
        </Button>
      </div>
      {note !== "" && <p aria-live="polite" className="font-[family-name:var(--font-code)] text-[12px] text-[var(--color-text-3)]">{note}</p>}
    </section>
  );
}
