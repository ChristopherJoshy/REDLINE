import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ChevronDown, Shield, SkipForward } from "lucide-react";
import type { BotId } from "@contracts/events";
import { CHARACTERS, AVATAR_FOCUS, CHAT_BACKGROUND } from "@/data/characterLore";
import { playSound } from "@/chat/sound";
import { useCinematicMotion } from "./useCinematicMotion";

const LANDING_INDEX = 20;

export default function GachaReveal({ boss, onDone }: { boss: BotId; onDone: () => void }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const finished = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const motionOff = useCinematicMotion();
  const lore = CHARACTERS[boss];
  // The server has already assigned the boss. The reel only presents that result.
  const cards = Array.from({ length: 24 }, (_, index): BotId => index === LANDING_INDEX ? boss : index % 2 === 0 ? "itachi" : "aizen");

  function finish(): void {
    if (finished.current) return;
    finished.current = true;
    timeline.current?.kill();
    done.current();
  }

  useLayoutEffect(() => {
    let sound: ReturnType<typeof playSound> | undefined;
    const context = gsap.context(() => {
      if (motionOff) { setRevealed(true); return; }
      const card = reel.current?.firstElementChild as HTMLElement | null;
      if (!card || !reel.current) return;
      const width = card.getBoundingClientRect().width;
      const step = width + 12;
      gsap.set(reel.current, { x: -width / 2 });
      gsap.set("[data-winner]", { opacity: 0, y: 12, scale: 0.96 });
      gsap.set("[data-result-copy]", { opacity: 0, y: 8 });
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      timeline.current = tl;
      tl.from("[data-gacha-heading]", { opacity: 0, y: 8, duration: 0.4 })
        .to(reel.current, { x: -width / 2 - LANDING_INDEX * step, duration: 3.6, ease: "power3.out" }, 0.3)
        .call(() => {
          setRevealed(true);
          sound = playSound(boss === "itachi" ? "/sounds/itachi/sting-mangekyo.mp3" : "/sounds/aizen/pressure-reiatsu.mp3");
        })
        .to("[data-reel-window]", { opacity: 0, scale: 0.97, duration: 0.25 })
        .to("[data-winner]", { opacity: 1, y: 0, scale: 1, duration: 0.5 }, "-=0.1")
        .fromTo("[data-foil]", { xPercent: -150 }, { xPercent: 150, duration: 0.7 }, "-=0.3")
        .to("[data-result-copy]", { opacity: 1, y: 0, duration: 0.35 }, "-=0.4");
    }, root);
    const timer = window.setTimeout(finish, motionOff ? 1800 : 6800);
    return () => { window.clearTimeout(timer); context.revert(); sound?.stop(); };
  }, [boss, motionOff]);

  return (
    <div ref={root} className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-bg-0 px-4 py-16 text-center" aria-label="Round 2 boss assignment">
      <img src={CHAT_BACKGROUND[boss]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg-0 via-bg-0/60 to-bg-0/80" />
      <button type="button" autoFocus onClick={finish} className="absolute right-4 top-4 z-20 flex min-h-[44px] items-center gap-2 border border-white/20 bg-bg-0/80 px-4 text-xs font-mono text-text-2 focus-visible:outline-2 focus-visible:outline-redline"><SkipForward className="h-4 w-4" /> Skip reveal</button>
      <div data-gacha-heading className="relative z-10 mb-5">
        <p className="font-mono text-xs tracking-[0.28em] text-redline">ROUND 02 / THE VAULT</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">{revealed ? "Your adversary awaits" : "A fate sealed in red"}</h1>
      </div>
      <div className="relative w-full max-w-[960px] h-[min(42vh,340px)] min-h-[200px]">
        <div data-reel-window aria-hidden="true" className={`absolute inset-0 overflow-hidden ${motionOff ? "invisible" : ""}`}>
          <ChevronDown className="absolute left-1/2 top-0 z-20 h-6 w-6 -translate-x-1/2 text-redline" />
          <div className="absolute inset-y-5 left-1/2 z-10 w-[144px] -translate-x-1/2 border-x-2 border-redline sm:w-[192px]" />
          <div ref={reel} className="absolute left-1/2 inset-y-7 flex gap-3">
            {cards.map((id, index) => <div key={index} className="relative w-[132px] shrink-0 overflow-hidden border border-white/15 bg-surface-1 sm:w-[180px]">
              <img src={CHARACTERS[id]?.avatar} alt="" className={`h-full w-full object-cover ${AVATAR_FOCUS[id]}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-0 via-transparent to-bg-0/20" />
              <p className="absolute inset-x-0 bottom-4 px-2 font-mono text-xs text-white">{CHARACTERS[id]?.name}</p>
            </div>)}
          </div>
          <div className="absolute inset-y-0 left-0 z-10 w-1/4 bg-gradient-to-r from-bg-0 to-transparent" />
          <div className="absolute inset-y-0 right-0 z-10 w-1/4 bg-gradient-to-l from-bg-0 to-transparent" />
        </div>
        <div data-winner className="absolute inset-y-0 left-1/2 aspect-[3/4] -translate-x-1/2 overflow-hidden border border-redline bg-surface-1" aria-hidden={!revealed}>
          <img src={lore?.avatar} alt="" className={`h-full w-full object-cover ${AVATAR_FOCUS[boss]}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-0 via-transparent to-transparent" />
          <div data-foil aria-hidden="true" className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-left"><Shield className="mb-2 h-5 w-5 text-redline" /><p className="font-mono text-[10px] tracking-[0.2em] text-text-2">ASSIGNMENT CONFIRMED</p><p className="mt-1 text-lg font-bold text-white">{lore?.name}</p></div>
        </div>
      </div>
      <div data-result-copy className="relative mt-5 max-w-[440px]" role="status">
        <p className="text-sm text-text-2">{revealed ? lore?.tagline : "Locating your adversary…"}</p>
        <p className="mt-2 font-mono text-[11px] tracking-widest text-redline">{revealed ? "ONE ADVERSARY. FIND THE TRUTH." : "VAULT ASSIGNMENT IN PROGRESS"}</p>
      </div>
      {revealed && <button type="button" onClick={finish} className="relative mt-5 min-h-[44px] border border-redline bg-redline px-6 font-mono text-xs font-bold text-white">Enter the vault</button>}
    </div>
  );
}
