import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { CheckCircle2, SkipForward } from "lucide-react";
import type { BotId } from "@contracts/events";
import { CHARACTERS, CHAT_BACKGROUND } from "@/data/characterLore";
import { playSound } from "@/chat/sound";
import { useCinematicMotion } from "./useCinematicMotion";

type Scene = "arrival" | "phase" | "victory";

export default function BossCutscene({ boss, scene, onDone, motionOff = false }: {
  boss: BotId;
  scene: Scene;
  onDone: () => void;
  motionOff?: boolean;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const finished = useRef(false);
  const preference = useCinematicMotion();
  const reduced = preference || motionOff;
  const lore = CHARACTERS[boss];
  const itachi = boss === "itachi";
  const title = scene === "arrival" ? lore?.name : scene === "victory" ? "The vault yields" : itachi ? "The loop is broken" : "Perfect hypnosis fractures";
  const caption = scene === "arrival" ? lore?.tagline : scene === "victory" ? `${lore?.targetItem.name} · verified and filed` : "The veil has lifted. Your conversation continues.";
  function finish(): void {
    if (finished.current) return;
    finished.current = true;
    done.current();
  }

  useLayoutEffect(() => {
    const previous = document.activeElement;
    skip.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
      if (event.key === "Tab") { event.preventDefault(); skip.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const sound = reduced ? undefined : playSound(scene === "arrival"
      ? itachi ? "/sounds/itachi/crow-caw.mp3" : "/sounds/aizen/entry-yokoso-short.mp3"
      : itachi ? "/sounds/itachi/sfx-sharingan.mp3" : "/sounds/aizen/shatter.mp3");
    const context = gsap.context(() => {
      if (reduced) return;
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.from(root.current, { opacity: 0, duration: 0.2 })
        .from("[data-scene-image]", { scale: 1.045, opacity: 0, duration: 1.2 }, 0)
        .from("[data-scene-rule]", { scaleX: 0, duration: 0.6 }, 0.15);
      if (scene === "phase") {
        tl.to("[data-fragment]", {
          xPercent: (index) => (index % 2 ? 1 : -1) * (itachi ? 18 : 28),
          yPercent: (index) => (index - 2) * 8,
          rotation: (index) => (index % 2 ? 1 : -1) * (itachi ? 3 : 7),
          opacity: 0, duration: 1, stagger: 0.055,
        }, 0.15);
      }
      if (scene === "victory") tl.from("[data-relic]", { opacity: 0, scale: 0.85, y: 16, duration: 0.65 }, 0.35);
      tl.from("[data-scene-copy]", { opacity: 0, y: 12, duration: 0.55, stagger: 0.12 }, scene === "phase" ? 0.65 : 0.35);
      if (scene !== "victory") tl.to(root.current, { opacity: 0, duration: 0.3 }, 2.9);
    }, root);
    const timer = scene === "victory" ? undefined : window.setTimeout(finish, reduced ? 1200 : 3300);
    return () => { window.clearTimeout(timer); context.revert(); sound?.stop(); };
  }, [boss, scene, reduced, itachi]);

  return (
    <section ref={root} role="dialog" aria-modal="true" aria-label={`${scene} cutscene`} className="fixed inset-0 z-50 flex flex-col justify-center overflow-hidden bg-bg-0 px-6 py-20 sm:px-[10vw]">
      <img data-scene-image src={CHAT_BACKGROUND[boss]} alt="" className={`absolute inset-0 h-full w-full object-cover opacity-35 ${itachi ? "object-left" : "object-right"}`} />
      <div className="absolute inset-0 bg-gradient-to-r from-bg-0 via-bg-0/70 to-bg-0/20" />
      {scene === "phase" && !reduced && <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => <div key={index} data-fragment className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${CHAT_BACKGROUND[boss]})`, clipPath: `polygon(${index * 17 - 8}% 0, ${index * 17 + 18}% 0, ${index * 17 + 8}% 100%, ${index * 17 - 18}% 100%)` }} />)}
      </div>}
      <div className="absolute inset-x-0 top-0 h-[7vh] border-b border-white/10 bg-bg-0" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-[7vh] border-t border-white/10 bg-bg-0" aria-hidden="true" />
      <div className="relative max-w-[720px]" role="status">
        <p data-scene-copy className="font-mono text-xs tracking-[0.25em] text-redline">{scene === "arrival" ? "ROUND 02 / FIRST CONTACT" : scene === "phase" ? "ILLUSION BREACHED" : "ROUND 02 / RELIC VERIFIED"}</p>
        <div data-scene-rule className="my-5 h-px w-24 origin-left bg-redline" />
        {scene === "victory" && <img data-relic src={lore?.targetItem.asset} alt={lore?.targetItem.name} className="mb-5 h-28 w-28 object-contain" />}
        <h2 data-scene-copy className="font-[family-name:var(--font-vault)] text-[clamp(28px,5vw,68px)] font-bold leading-tight text-white">{title}</h2>
        <p data-scene-copy className="mt-5 max-w-[48ch] text-sm leading-relaxed text-text-2 sm:text-base">{caption}</p>
        {scene === "victory" && <p data-scene-copy className="mt-4 flex items-center gap-2 text-sm text-moss"><CheckCircle2 className="h-4 w-4" /> Your team’s Elo has been updated.</p>}
      </div>
      <button ref={skip} type="button" onClick={finish} className="absolute bottom-[10vh] right-6 flex min-h-[44px] items-center gap-2 border border-white/25 bg-bg-0/80 px-5 font-mono text-xs text-white focus-visible:outline-2 focus-visible:outline-redline"><SkipForward className="h-4 w-4" />{scene === "victory" ? "Return to the vault" : "Skip cutscene"}</button>
    </section>
  );
}
