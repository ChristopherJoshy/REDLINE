import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { SkipForward } from "lucide-react";
import { playSound } from "@/chat/sound";
import { useCinematicMotion } from "./useCinematicMotion";

export default function PortalTransition({ onDone }: { onDone: () => void }): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const finished = useRef(false);
  const motionOff = useCinematicMotion();
  function finish(): void {
    if (finished.current) return;
    finished.current = true;
    done.current();
  }
  useLayoutEffect(() => {
    if (motionOff) { finish(); return; }
    const sound = playSound("/sounds/portal/enter-whoosh.mp3");
    const context = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "power3.inOut" } })
        .fromTo("[data-seam]", { scaleY: 0 }, { scaleY: 1, duration: 0.45 })
        .to("[data-door-left]", { xPercent: -100, duration: 0.85 }, 0.4)
        .to("[data-door-right]", { xPercent: 100, duration: 0.85 }, 0.4)
        .from("[data-vault-title]", { opacity: 0, y: 8, duration: 0.4 }, 0.7)
        .to(root.current, { opacity: 0, duration: 0.25 }, 1.3);
    }, root);
    const timer = window.setTimeout(finish, 1600);
    return () => { window.clearTimeout(timer); context.revert(); sound.stop(); };
  }, [motionOff]);
  return (
    <div ref={root} className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-bg-0">
      <div data-vault-title role="status" className="text-center"><p className="font-mono text-xs tracking-[0.3em] text-redline">THRESHOLD / 02</p><h2 className="mt-3 font-[family-name:var(--font-vault)] text-3xl text-white">Beyond the veil</h2></div>
      <div data-door-left className="absolute inset-y-0 left-0 w-1/2 border-r border-redline/60 bg-surface-1" />
      <div data-door-right className="absolute inset-y-0 right-0 w-1/2 border-l border-redline/60 bg-surface-1" />
      <div data-seam className="absolute inset-y-0 left-1/2 w-px bg-redline" aria-hidden="true" />
      <button type="button" onClick={finish} autoFocus className="absolute right-4 top-4 flex min-h-[44px] items-center gap-2 border border-white/20 bg-bg-0 px-4 text-xs text-white"><SkipForward className="h-4 w-4" /> Skip transition</button>
    </div>
  );
}
