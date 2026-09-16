import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export default function TypingBubble({ thinking = true, accentColor = "var(--color-redline)", motionOff = false }: {
  thinking?: boolean;
  accentColor?: string;
  motionOff?: boolean;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (motionOff) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo("[data-thinking-dot]", { y: 0, opacity: 0.35 }, {
        y: -3, opacity: 0.9, duration: 0.5, stagger: 0.16, repeat: -1, yoyo: true, ease: "sine.inOut",
      });
    }, root);
    return () => media.revert();
  }, [motionOff]);
  return (
    <div ref={root} role="status" aria-label={thinking ? "Considering a reply" : "Typing a reply"} className="flex min-h-[44px] items-center gap-3 border border-white/12 bg-bg-1/85 px-4 py-3 text-text-3 backdrop-blur-md">
      <span className="text-xs">{thinking ? "Thinking" : "Typing"}</span>
      <span aria-hidden="true" className="flex items-center gap-1.5" style={{ color: accentColor }}>
        {[0, 1, 2].map((index) => <span key={index} data-thinking-dot className="h-1 w-1 rounded-full bg-current opacity-50" />)}
      </span>
    </div>
  );
}
