import { useState } from "react";
import { Button } from "@/components/ui/button";
import { identify, joinTeam, type JoinResult } from "@/api/teams";

export default function EnterScreen({ onIdentified }: { onIdentified: () => void }): React.JSX.Element {
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setJoined(await joinTeam(code));
    } catch {
      setError("invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function submitIdentity(): Promise<void> {
    if (joined === null || picked === "") {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await identify(joined.teamId, picked);
      onIdentified();
    } catch {
      setError("unknown identity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[var(--color-bg-0)] p-[var(--space)]">
      <h1 className="font-[family-name:var(--font-display)] text-[clamp(32px,5vw,56px)] font-bold leading-[1.05] tracking-[-0.02em] text-[var(--color-redline)]">
        REDLINE
      </h1>
      {joined === null ? (
        <form onSubmit={submitCode} className="flex w-full max-w-[320px] flex-col gap-3">
          <label htmlFor="code" className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
            Enter code
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="min-h-[44px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 font-[family-name:var(--font-code)] text-[16px] text-[var(--color-text-1)] focus-visible:outline-2 focus-visible:outline-[var(--color-info)]"
          />
          <Button type="submit" disabled={busy || code.trim() === ""}>
            Continue
          </Button>
        </form>
      ) : (
        <section className="flex w-full max-w-[320px] flex-col gap-3">
          <h2 className="text-[22px] text-[var(--color-text-1)]">Select who you are</h2>
          <p className="text-[14px] text-[var(--color-text-3)]">{joined.teamName}</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Team members">
            {joined.members.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={picked === m}
                onClick={() => setPicked(m)}
                className={`min-h-[44px] rounded-md border px-4 text-left text-[16px] transition-colors duration-[var(--dur-ui)] ${
                  picked === m
                    ? "border-[var(--color-redline)] bg-[var(--color-redline-dim)] text-[var(--color-text-1)]"
                    : "border-[var(--color-border-strong)] bg-[var(--color-surface-1)] text-[var(--color-text-2)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <Button onClick={submitIdentity} disabled={busy || picked === ""}>
            Enter the arena
          </Button>
        </section>
      )}
      {error !== "" && (
        <p role="alert" className="text-[14px] text-[var(--color-redline-soft)]">
          {error}
        </p>
      )}
    </main>
  );
}
