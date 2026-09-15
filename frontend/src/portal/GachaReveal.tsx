import { useEffect, useRef, useState } from "react";
import type { BotId } from "@contracts/events";
import { reducedMotion } from "@/lib/motionTokens";

interface GachaRevealProps {
  boss: BotId;
  onDone: () => void;
}

const BOSS_DATA: Record<"itachi" | "aizen", {
  name: string;
  moniker: string;
  tagline: string;
  avatar: string;
  accent: string;
  auraClass: string;
}> = {
  itachi: {
    name: "Itachi Uchiha",
    moniker: "Ghost of the Leaf",
    tagline: "Bearer of Tragic Burden & Master of Tsukuyomi",
    avatar: "/characters/itachi.jpg",
    accent: "#ff1e2d",
    auraClass: "shadow-[0_0_80px_30px_rgba(255,30,45,0.55)]",
  },
  aizen: {
    name: "Sosuke Aizen",
    moniker: "Master of Muken",
    tagline: "Architect of Fate & Wielder of Kyoka Suigetsu",
    avatar: "/characters/aizen.jpg",
    accent: "#ff1e2d",
    auraClass: "shadow-[0_0_80px_30px_rgba(255,30,45,0.55)]",
  },
};

const ALL_BOSSES: Array<"itachi" | "aizen"> = ["itachi", "aizen", "itachi", "aizen", "itachi", "aizen"];

type Phase = "spinning" | "slowing" | "reveal" | "done";

export default function GachaReveal({ boss, onDone }: GachaRevealProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("spinning");
  const [spinIndex, setSpinIndex] = useState(0);
  const [showBeam, setShowBeam] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showText, setShowText] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; dx: number; dy: number; size: number }>>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const spinRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const bossData = BOSS_DATA[boss as "itachi" | "aizen"] ?? BOSS_DATA.itachi;
  const reduced = reducedMotion();

  useEffect(() => {
    if (reduced) {
      // Skip straight to reveal
      setPhase("reveal");
      setShowBeam(true);
      setShowCard(true);
      setShowText(true);
      const t = setTimeout(() => doneRef.current(), 2500);
      return () => clearTimeout(t);
    }

    // --- Phase 1: Fast spin (0–2.5s) ---
    const SPIN_FAST_MS = 80;
    spinRef.current = setInterval(() => {
      setSpinIndex(i => (i + 1) % ALL_BOSSES.length);
    }, SPIN_FAST_MS);

    const t1 = setTimeout(() => {
      // --- Phase 2: Slow down (2.5s–3.5s) ---
      clearInterval(spinRef.current);
      setPhase("slowing");
      let delay = 120;
      let count = 0;
      const maxSteps = 8;
      function slowStep(): void {
        setSpinIndex(i => (i + 1) % ALL_BOSSES.length);
        count++;
        delay = Math.min(delay * 1.35, 600);
        if (count < maxSteps) {
          setTimeout(slowStep, delay);
        } else {
          // Lock to the real boss
          const bossIdx = ALL_BOSSES.indexOf(boss as "itachi" | "aizen");
          setSpinIndex(bossIdx >= 0 ? bossIdx : 0);
          setTimeout(startReveal, 400);
        }
      }
      setTimeout(slowStep, delay);
    }, 2500);

    return () => {
      clearTimeout(t1);
      clearInterval(spinRef.current);
    };
  }, []);

  function startReveal(): void {
    setPhase("reveal");
    // Spawn particles
    const pts = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 20,
      y: 45 + (Math.random() - 0.5) * 20,
      dx: (Math.random() - 0.5) * 80,
      dy: -(Math.random() * 60 + 20),
      size: Math.random() * 4 + 2,
    }));
    setParticles(pts);
    setShowBeam(true);
    setTimeout(() => setShowCard(true), 200);
    setTimeout(() => setShowText(true), 600);
    setTimeout(() => doneRef.current(), 3200);
  }

  const currentBossId = ALL_BOSSES[spinIndex % ALL_BOSSES.length] ?? "itachi";
  const currentBoss = BOSS_DATA[currentBossId];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        backgroundImage: "url('/backgrounds/login-ui.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Dark vignette */}
      <div className="absolute inset-0 bg-[rgba(2,3,6,0.82)]" />

      {/* Scan-lines texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)" }}
      />

      {/* Vertical light beam on reveal */}
      {showBeam && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-full flex justify-center animate-[beam-in_0.5s_ease-out_forwards]"
          style={{ zIndex: 2 }}
        >
          <div
            className="w-[3px] h-full"
            style={{
              background: `linear-gradient(to bottom, transparent 0%, ${bossData.accent}99 30%, ${bossData.accent} 50%, ${bossData.accent}99 70%, transparent 100%)`,
              boxShadow: `0 0 40px 20px ${bossData.accent}55`,
              animation: "beam-flicker 0.12s steps(1) infinite",
            }}
          />
        </div>
      )}

      {/* Particle sparks on reveal */}
      {particles.map(p => (
        <div
          key={p.id}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: bossData.accent,
            boxShadow: `0 0 ${p.size * 2}px ${bossData.accent}`,
            animation: `particle-fly 1s ease-out forwards`,
            "--dx": `${p.dx}px`,
            "--dy": `${p.dy}px`,
          } as React.CSSProperties}
        />
      ))}

      {/* Content */}
      <div className="relative flex flex-col items-center gap-6 px-4" style={{ zIndex: 3 }}>
        {/* Header */}
        <div className="flex flex-col items-center gap-1 text-center">
          <span
            className="font-[family-name:var(--font-code)] text-[11px] font-bold uppercase tracking-[0.3em] transition-all duration-500"
            style={{ color: bossData.accent, opacity: phase === "reveal" ? 1 : 0.5 }}
          >
            {phase === "reveal" ? "Boss Assigned" : "Fate Is Deciding…"}
          </span>
          <span className="block h-[2px] w-16 rounded-full" style={{ background: bossData.accent, opacity: 0.6 }} />
        </div>

        {/* Boss card */}
        <div
          className="relative overflow-hidden"
          style={{
            width: 220,
            height: 300,
            borderRadius: 12,
            border: `2px solid ${showCard ? bossData.accent : "rgba(255,255,255,0.12)"}`,
            boxShadow: showCard ? `0 0 60px 16px ${bossData.accent}55, 0 0 120px 30px ${bossData.accent}22` : "0 4px 32px rgba(0,0,0,0.8)",
            transition: "box-shadow 0.6s ease, border-color 0.4s ease",
            transform: showCard ? "scale(1.05)" : "scale(1)",
            transitionProperty: "transform, box-shadow, border-color",
            transitionDuration: "0.5s",
          }}
        >
          {/* Photo */}
          <img
            src={phase === "reveal" ? bossData.avatar : (currentBoss?.avatar ?? bossData.avatar)}
            alt={phase === "reveal" ? bossData.name : (currentBoss?.name ?? "")}
            className="h-full w-full object-cover object-top"
            style={{
              filter: phase === "reveal" ? "none" : "brightness(0.7) saturate(0.4)",
              transition: "filter 0.6s ease",
            }}
          />

          {/* Foil shimmer on reveal */}
          {showCard && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `linear-gradient(135deg, transparent 0%, ${bossData.accent}33 40%, rgba(255,255,255,0.15) 50%, transparent 60%, ${bossData.accent}22 100%)`,
                animation: "shimmer-sweep 2s ease-in-out infinite",
              }}
            />
          )}

          {/* Rarity ribbon */}
          {phase === "reveal" && (
            <div
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end gap-0.5 px-3 pb-3 pt-12"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)" }}
            >
              <span
                className="font-[family-name:var(--font-code)] text-[10px] font-black uppercase tracking-[0.25em]"
                style={{ color: bossData.accent }}
              >
                ★★★★ MYTHIC
              </span>
              <span className="font-bold text-white text-[15px] leading-tight text-center">
                {bossData.name}
              </span>
              <span className="text-white/60 text-[11px] text-center">{bossData.moniker}</span>
            </div>
          )}

          {/* Spinning overlay - name badge */}
          {phase !== "reveal" && currentBoss && (
            <div
              className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)" }}
            >
              <p className="text-center font-bold text-white text-[14px] leading-tight">{currentBoss.name}</p>
            </div>
          )}
        </div>

        {/* Reveal text */}
        <div
          className="flex flex-col items-center gap-2 text-center transition-all duration-700"
          style={{ opacity: showText ? 1 : 0, transform: showText ? "translateY(0)" : "translateY(12px)" }}
        >
          <h2
            className="font-[family-name:var(--font-display)] text-[22px] font-bold text-white leading-tight"
          >
            {bossData.name}
          </h2>
          <p className="text-white/60 text-[13px] max-w-[280px] leading-relaxed">
            {bossData.tagline}
          </p>
          <p className="text-[12px] font-mono mt-1 animate-pulse" style={{ color: bossData.accent }}>
            Entering vault…
          </p>
        </div>
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes beam-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes beam-in {
          from { opacity: 0; transform: scaleX(3); }
          to { opacity: 1; transform: scaleX(1); }
        }
        @keyframes particle-fly {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0); }
        }
        @keyframes shimmer-sweep {
          0% { transform: translateX(-100%) translateY(-100%) rotate(0deg); }
          50% { transform: translateX(100%) translateY(100%) rotate(0deg); }
          100% { transform: translateX(-100%) translateY(-100%) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
