import { useEffect, useState } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import type { BotId } from "@contracts/events";
import { Button } from "@/components/ui/button";
import ArenaScreen from "@/screens/ArenaScreen";
import RoundTwoScreen from "@/screens/RoundTwoScreen";
import PortalTransition from "@/portal/PortalTransition";
import { computeTop5, endRound1, enterRound2, getGates, openVault, type Gates } from "@/api/gates";

function SealedScreen(): React.JSX.Element {
  useDocumentTitle("Round 1 Sealed — REDLINE Arena");
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-[var(--space)]">
      <span aria-hidden="true" className="block h-[3px] w-12 bg-[var(--color-brass)]" />
      <h2 className="font-[family-name:var(--font-display)] text-[24px] font-bold text-[var(--color-text-1)]">
        Sealed
      </h2>
      <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
        Round 1 is done for your team. Wait for the organizers to open round 2.
      </p>
    </div>
  );
}

function PortalGate({ onEnter }: { onEnter: (boss: BotId) => void }): React.JSX.Element {
  useDocumentTitle("Vault — REDLINE Arena");
  const [error, setError] = useState("");
  const [travel, setTravel] = useState<BotId | null>(null);
  async function step(): Promise<void> {
    setError("");
    try {
      const { boss } = await enterRound2();
      if (boss !== "itachi" && boss !== "aizen") {
        throw new Error("bad boss");
      }
      setTravel(boss);
    } catch {
      setError("The vault is sealed.");
    }
  }
  if (travel !== null) {
    const boss = travel;
    return <PortalTransition onDone={() => onEnter(boss)} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-[var(--space)]">
      <span aria-hidden="true" className="block h-[3px] w-12 bg-[var(--color-brass)]" />
      <h2 className="font-[family-name:var(--font-vault)] text-[26px] font-bold text-[var(--color-text-1)]">
        The vault stands open
      </h2>
      <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
        One boss waits inside. Step through when ready.
      </p>
      <button
        type="button"
        onClick={() => void step()}
        className="flex min-h-[52px] items-center gap-3 rounded-[6px] bg-[var(--color-text-1)] px-8 py-4 text-[16px] font-semibold text-[var(--color-bg-0)] hover:opacity-90 active:scale-[0.99] transition"
      >
        <span>Step through</span>
      </button>
      {error !== "" && <p role="alert" className="text-[14px] text-[var(--color-seal)]">{error}</p>}
    </div>
  );
}

export default function GatedArena({ teamId, displayName, locked }: { teamId: string; displayName: string; locked: boolean }): React.JSX.Element {
  const [gates, setGates] = useState<Gates | null>(null);
  const [boss, setBoss] = useState<BotId | null>(null);

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      try {
        const g = await getGates();
        if (!dead) {
          setGates(g);
        }
      } catch {
        // Keep the last gate frame on transient failure.
      }
    }
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, []);

  if (boss !== null) {
    return <RoundTwoScreen teamId={teamId} boss={boss} locked={locked} />;
  }
  if (gates !== null && gates.qualified && gates.vaultOpen) {
    return <PortalGate onEnter={setBoss} />;
  }
  if (gates !== null && gates.solved >= gates.round1Size) {
    return <SealedScreen />;
  }
  return (
    <>
      {gates !== null && !gates.round1Open && (
        <p role="status" className="border-b border-[var(--color-border)] bg-[var(--color-brass-wash)] px-[var(--space)] py-2 text-center text-[14px] text-[var(--color-brass-ink)]">
          Round 1 has ended. Submissions and chats are frozen.
        </p>
      )}
      <ArenaScreen teamId={teamId} displayName={displayName} locked={locked} />
    </>
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
