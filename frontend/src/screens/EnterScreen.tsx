import { useEffect, useRef, useState } from "react";
import { createTimeline } from "animejs";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { identify, joinTeam, type JoinResult, type IdentifyResult } from "@/api/teams";
import { Shield, User, ArrowRight, Lock, KeyRound } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

export default function EnterScreen({ onIdentified }: { onIdentified: (res?: IdentifyResult) => void }): React.JSX.Element {
  const [code, setCode] = useState("");
  useDocumentTitle("Enter — REDLINE Arena");
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Entrance choreography refs
  const ruleRef = useRef<HTMLSpanElement>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const captionRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion()) {
      // Ensure all elements visible immediately
      [ruleRef, wordmarkRef, captionRef, cardRef].forEach((r) => {
        if (r.current) {
          r.current.style.opacity = "1";
          r.current.style.transform = "none";
        }
      });
      return;
    }
    const tl = createTimeline({ defaults: { ease: EASE.out } });

    // 1. Brass rule draws in (scaleX 0→1)
    tl.add(ruleRef.current!, {
      scaleX: [0, 1],
      opacity: [0, 1],
      duration: DUR.panel,
      transformOrigin: "left center",
    });

    // 2. REDLINE wordmark rises in
    tl.add(wordmarkRef.current!, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: DUR.enter,
    }, `-=${DUR.ui}`);

    // 3. CTF ARENA caption fades in
    tl.add(captionRef.current!, {
      opacity: [0, 1],
      duration: DUR.panel,
    }, `-=${DUR.panel}`);

    // 4. Card lifts in
    tl.add(cardRef.current!, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: DUR.page,
    }, `-=${DUR.ui}`);

    return (): void => {
      tl.pause();
    };
  }, []);

  async function submitCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setJoined(await joinTeam(code));
    } catch {
      setError("Code not recognised. Check with your marshal.");
    } finally {
      setBusy(false);
    }
  }

  async function submitIdentity(): Promise<void> {
    if (joined === null || picked === "") return;
    setBusy(true);
    setError("");
    try {
      const res = await identify(joined.teamId, picked);
      onIdentified(res);
    } catch {
      setError("That seat is taken or unverified.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dark-cinematic relative flex min-h-[100dvh] flex-col items-center justify-center p-4 select-none">
      <div className="relative z-10 flex w-full max-w-[440px] flex-col items-center">
        <header className="mb-6 flex flex-col items-center text-center">
          <span
            ref={ruleRef}
            aria-hidden="true"
            className="mb-4 block h-[3px] w-16 bg-[var(--color-brass)]"
            style={{ opacity: 0 }}
          />
          <h1
            ref={wordmarkRef}
            className="font-[family-name:var(--font-display)] text-[clamp(40px,8vw,60px)] font-bold tracking-[0.12em] leading-none text-[var(--color-text-1)]"
            style={{ opacity: 0 }}
          >
            REDLINE
          </h1>
          <span
            ref={captionRef}
            className="mt-2 font-[family-name:var(--font-code)] text-[12px] tracking-[0.28em] text-[var(--color-text-3)]"
            style={{ opacity: 0 }}
          >
            CTF ARENA
          </span>
        </header>

        <div
          ref={cardRef}
          className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 sm:p-7"
          style={{ opacity: 0 }}
        >
          {joined === null ? (
            <form onSubmit={submitCode} className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-[var(--color-text-2)] text-[14px] font-semibold">
                <KeyRound className="w-4 h-4 text-[var(--color-brass)]" />
                <span>Team code</span>
              </div>

              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                autoComplete="off"
                spellCheck={false}
                maxLength={9}
                className="w-full min-h-[52px] rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-center font-[family-name:var(--font-code)] text-[20px] font-bold tracking-[0.25em] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
              />

              <p className="text-[13px] text-[var(--color-text-3)] text-center">
                Use the code from your marshal.
              </p>

              <button
                type="submit"
                disabled={busy || code.trim() === ""}
                className="mt-1 flex min-h-[48px] items-center justify-center gap-2 rounded-[6px] bg-[var(--color-text-1)] text-[15px] font-semibold text-[var(--color-bg-0)] disabled:opacity-50 transition-opacity active:scale-[0.98]"
              >
                <span>{busy ? "Checking" : "Enter"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                <div>
                  <h2 className="text-[17px] font-semibold text-[var(--color-text-1)]">Take a seat</h2>
                  <p className="text-[13px] text-[var(--color-text-3)] font-[family-name:var(--font-code)]">
                    {joined.teamName}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[var(--color-moss-wash)] border border-[var(--color-moss-border)] text-[12px] font-semibold text-[var(--color-moss)]">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Filed</span>
                </div>
              </div>

              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Team members">
                {joined.members.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={picked === m}
                    onClick={() => setPicked(m)}
                    className={`flex min-h-[48px] items-center gap-3 rounded-[6px] border px-4 text-left transition-colors ${
                      picked === m
                        ? "border-[var(--color-brass)] bg-[var(--color-brass-wash)] text-[#14100b]"
                        : "border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors ${
                      picked === m ? "bg-[#14100b] text-[#f3ede0]" : "bg-[var(--color-surface-2)] text-[var(--color-text-3)]"
                    }`}>
                      <User className="w-4 h-4" />
                    </span>
                    <span className={`font-semibold text-[15px] flex-1 ${picked === m ? "text-[#14100b]" : "text-[var(--color-text-1)]"}`}>
                      {m}
                    </span>
                    {picked === m && (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#6e5514]" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void submitIdentity()}
                disabled={busy || picked === ""}
                className="mt-1 flex min-h-[48px] items-center justify-center gap-2 rounded-[6px] bg-[var(--color-text-1)] text-[15px] font-semibold text-[var(--color-bg-0)] disabled:opacity-50 transition-opacity active:scale-[0.98]"
              >
                <span>{busy ? "Seating" : picked === "" ? "Pick a seat" : `Enter as ${picked}`}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {error !== "" && (
            <div className="mt-4 flex items-center gap-2 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] p-3 text-[13px] text-[var(--color-seal)]">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
