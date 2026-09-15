import { useEffect, useRef, useState } from "react";
import { createTimeline } from "animejs";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { identify, joinTeam, type JoinResult, type IdentifyResult } from "@/api/teams";
import { Shield, User, ArrowRight, Lock, KeyRound } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";
type SettleTimerId = number;
type FlickerTimerId = number;
const MATRIX_GLYPHS = "アカサタナハマヤラワ0123456789ABCDEFRL<>*+#";
const SCRAMBLE_MS = 300;
const CASCADE_MS = 35;
const FLICKER_MS = 45;
export default function EnterScreen({ onIdentified }: { onIdentified: (res?: IdentifyResult) => void }): React.JSX.Element {
  const [code, setCode] = useState("");
  useDocumentTitle("Enter — REDLINE Arena");
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [glyphs, setGlyphs] = useState<Record<number, string>>({});

  // Entrance choreography refs
  const ruleRef = useRef<HTMLSpanElement>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const captionRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevCodeRef = useRef("");
  const settleTimers = useRef<Record<number, SettleTimerId>>({});
  const flickerTimer = useRef<FlickerTimerId | undefined>(undefined);
  useEffect(() => () => {
    for (const t of Object.values(settleTimers.current)) window.clearTimeout(t);
    settleTimers.current = {};
    if (flickerTimer.current !== undefined) window.clearInterval(flickerTimer.current);
  }, []);
  function handleCodeChange(raw: string): void {
    const next = raw.toUpperCase();
    const prev = prevCodeRef.current;
    prevCodeRef.current = next;
    setCode(next);
    if (reducedMotion()) {
      if (Object.keys(glyphs).length > 0) setGlyphs({});
      return;
    }
    const changed: number[] = [];
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] !== prev[i]) changed.push(i);
    }
    setGlyphs((g) => {
      const kept: Record<number, string> = {};
      for (let i = 0; i < next.length; i += 1) {
        const v = g[i];
        if (v !== undefined) kept[i] = v;
      }
      for (const i of changed) kept[i] = MATRIX_GLYPHS[(Math.random() * MATRIX_GLYPHS.length) | 0] ?? "#";
      return kept;
    });
    if (changed.length === 0) return;
    for (const i of changed) {
      const old = settleTimers.current[i];
      if (old !== undefined) window.clearTimeout(old);
      settleTimers.current[i] = window.setTimeout(() => {
        delete settleTimers.current[i];
        setGlyphs((g) => {
          if (g[i] === undefined) return g;
          const copy = { ...g };
          delete copy[i];
          return copy;
        });
        if (Object.keys(settleTimers.current).length === 0 && flickerTimer.current !== undefined) {
          window.clearInterval(flickerTimer.current);
          flickerTimer.current = undefined;
        }
      }, SCRAMBLE_MS + i * CASCADE_MS);
    }
    if (flickerTimer.current === undefined) {
      flickerTimer.current = window.setInterval(() => {
        setGlyphs((g) => {
          const keys = Object.keys(g);
          if (keys.length === 0) return g;
          const out = { ...g };
          for (const k of keys) out[Number(k)] = MATRIX_GLYPHS[(Math.random() * MATRIX_GLYPHS.length) | 0] ?? "#";
          return out;
        });
      }, FLICKER_MS);
    }
  }

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
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center p-4 select-none overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/backgrounds/logintheme2.png')" }}
      />


      {/* Dark overlay for readability */}
      <div className="absolute inset-0 z-0 bg-black/40" />

      {/* Subtle red gradient overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-red-900/10 via-transparent to-red-900/20" />

      {/* Decorative corner brackets */}
      <div className="absolute top-8 left-8 z-10 text-red-600/40 font-mono text-xs hidden md:block">
        <div className="border-l-2 border-t-2 border-red-600/40 w-8 h-8" />
      </div>
      <div className="absolute top-8 right-8 z-10 text-red-600/40 font-mono text-xs hidden md:block">
        <div className="border-r-2 border-t-2 border-red-600/40 w-8 h-8" />
      </div>
      <div className="absolute bottom-8 left-8 z-10 text-red-600/40 font-mono text-xs hidden md:block">
        <div className="border-l-2 border-b-2 border-red-600/40 w-8 h-8" />
      </div>
      <div className="absolute bottom-8 right-8 z-10 text-red-600/40 font-mono text-xs hidden md:block">
        <div className="border-r-2 border-b-2 border-red-600/40 w-8 h-8" />
      </div>

      {/* Top decorative elements */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 hidden md:flex items-center gap-4 text-[10px] font-mono text-red-500/60 tracking-widest">
        <span>EXPLORE</span>
        <span className="text-red-600/40">///</span>
        <span>LEARN</span>
        <span className="text-red-600/40">///</span>
        <span>HACK</span>
        <span className="text-red-600/40">///</span>
        <span>COMPETE</span>
      </div>

      {/* Side decorative text */}
      <div className="absolute top-1/4 left-6 z-10 hidden lg:block text-red-600/30 font-mono text-[9px] tracking-widest writing-mode-vertical">
        <div className="space-y-2">
          <div>THINK.</div>
          <div>EXPLOIT.</div>
          <div>ADAPT.</div>
          <div>WIN.</div>
        </div>
      </div>
      
      <div className="absolute top-1/4 right-6 z-10 hidden lg:block text-red-600/30 font-mono text-[9px] tracking-widest writing-mode-vertical">
        <div className="space-y-2 text-right">
          <div>NO</div>
          <div>RULES</div>
          <div>JUST</div>
          <div>SKILLS</div>
        </div>
      </div>

      {/* Bottom decorative elements */}
      <div className="absolute bottom-6 left-6 z-10 hidden md:block text-red-600/40 font-mono text-[9px] tracking-wider">
        <div>CTF 2026</div>
        <div>SJCET PALAI</div>
      </div>
      
      <div className="absolute bottom-6 right-6 z-10 hidden md:block text-red-600/40 font-mono text-[9px] tracking-wider text-right">
        <div>REDLINE // CSE // ASTHRA 11.0</div>
      </div>

      <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center">
        <header className="mb-8 flex flex-col items-center text-center">
          <span
            ref={ruleRef}
            aria-hidden="true"
            className="mb-4 block h-[2px] w-20 bg-red-600"
            style={{ opacity: 0 }}
          />
          
          <h1
            ref={wordmarkRef}
            className="font-[family-name:var(--font-display)] text-[clamp(48px,10vw,72px)] font-bold tracking-[0.15em] leading-none text-white"
            style={{ opacity: 0, textShadow: "0 0 30px rgba(220, 38, 38, 0.5), 0 0 60px rgba(220, 38, 38, 0.3)" }}
          >
            REDLINE
          </h1>
          
          <span
            ref={captionRef}
            className="mt-3 font-[family-name:var(--font-code)] text-[14px] tracking-[0.35em] text-red-500"
            style={{ opacity: 0 }}
          >
            CTF ARENA
          </span>
          
          <div className="mt-4 flex items-center gap-3 text-[10px] font-mono text-red-500/70 tracking-widest">
            <span>HACK</span>
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            <span>LEARN</span>
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            <span>COMPETE</span>
          </div>
        </header>

        <div
          ref={cardRef}
          className="w-full rounded-none border border-red-600/50 bg-black/60 backdrop-blur-md p-6 sm:p-8 relative overflow-hidden"
          style={{ opacity: 0, boxShadow: "0 0 40px rgba(220, 38, 38, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)" }}
        >
          {/* Card corner accents */}
          <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-red-600" />
          <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-red-600" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-red-600" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-red-600" />
          
          {/* Scanline effect */}
          <div className="absolute inset-0 pointer-events-none opacity-5 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

          {joined === null ? (
            <form onSubmit={submitCode} className="flex flex-col gap-5">
              <div className="flex items-center gap-2 text-white text-[14px] font-semibold tracking-wide">
                <KeyRound className="w-4 h-4 text-red-500" />
                <span>ENTER YOUR TEAM CODE</span>
              </div>

              <div className="relative">
                <input
                  id="code"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="RL-9842-X"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={9}
                  aria-label="Team code"
                  className="w-full min-h-[56px] rounded-none border border-red-600/60 bg-black/80 px-4 text-center font-[family-name:var(--font-code)] text-[22px] font-bold tracking-[0.3em] text-transparent caret-red-500 placeholder-transparent selection:bg-red-600/40 focus:outline-none focus:border-red-500 focus:shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all duration-300"
                />
                {/* Matrix typing overlay — mirrors the input; fresh keystrokes flicker red glyphs then settle */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 font-[family-name:var(--font-code)] text-[22px] font-bold tracking-[0.3em]"
                >
                  {code.length === 0 ? (
                    <span className="text-red-500/40">RL-9842-X</span>
                  ) : (
                    code.split("").map((ch, i) => (
                      glyphs[i] !== undefined ? (
                        <span key={i} className="text-red-500" style={{ textShadow: "0 0 12px rgba(239,68,68,0.9)" }}>
                          {glyphs[i]}
                        </span>
                      ) : (
                        <span key={i} className="text-white">{ch}</span>
                      )
                    ))
                  )}
                </div>
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-red-500/50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                </div>
              </div>

              <p className="text-[12px] text-red-400/70 text-center font-mono tracking-wider">
                Use the code from your marshal.
              </p>

              <button
                type="submit"
                disabled={busy || code.trim() === ""}
                className="mt-2 flex min-h-[52px] items-center justify-center gap-3 rounded-none bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-[15px] font-bold text-white tracking-wider uppercase disabled:opacity-50 transition-all duration-300 hover:from-red-600 hover:via-red-500 hover:to-red-600 hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-[0.98] relative overflow-hidden group"
                style={{ boxShadow: "0 4px 20px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <span>{busy ? "CHECKING" : "ENTER ARENA"}</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-red-600/30 pb-3">
                <div>
                  <h2 className="text-[17px] font-semibold text-white tracking-wide">Take a seat</h2>
                  <p className="text-[13px] text-red-400 font-[family-name:var(--font-code)]">
                    {joined.teamName}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-red-600/20 border border-red-600/50 text-[12px] font-semibold text-red-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span>FILED</span>
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
                    className={`flex min-h-[48px] items-center gap-3 rounded-none border px-4 text-left transition-all duration-300 ${
                      picked === m
                        ? "border-red-600 bg-red-600/20 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                        : "border-red-600/30 text-red-200 hover:bg-red-600/10 hover:border-red-600/50"
                    }`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-none transition-colors ${
                      picked === m ? "bg-red-600 text-white" : "bg-black/50 text-red-400"
                    }`}>
                      <User className="w-4 h-4" />
                    </span>
                    <span className={`font-semibold text-[15px] flex-1 ${picked === m ? "text-white" : "text-red-100"}`}>
                      {m}
                    </span>
                    {picked === m && (
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.8)]" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void submitIdentity()}
                disabled={busy || picked === ""}
                className="mt-2 flex min-h-[52px] items-center justify-center gap-3 rounded-none bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-[15px] font-bold text-white tracking-wider uppercase disabled:opacity-50 transition-all duration-300 hover:from-red-600 hover:via-red-500 hover:to-red-600 hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] active:scale-[0.98]"
                style={{ boxShadow: "0 4px 20px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)" }}
              >
                <span>{busy ? "SEATING" : picked === "" ? "PICK A SEAT" : `ENTER AS ${picked.toUpperCase()}`}</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {error !== "" && (
            <div className="mt-4 flex items-center gap-3 rounded-none border border-red-600/60 bg-red-900/30 backdrop-blur-sm p-4 text-[13px] text-red-200" style={{ boxShadow: "0 0 20px rgba(220, 38, 38, 0.2)" }}>
              <Lock className="w-5 h-5 shrink-0 text-red-500" />
              <span className="font-mono tracking-wide">{error}</span>
            </div>
          )}
        </div>

        {/* Bottom decorative line */}
        <div className="mt-8 flex items-center gap-4 text-[10px] font-mono text-red-600/50 tracking-widest">
          <div className="w-12 h-px bg-red-600/30" />
          <span>ALL ACCORDING TO PLAN</span>
          <div className="w-12 h-px bg-red-600/30" />
        </div>
      </div>
    </main>
  );
}
