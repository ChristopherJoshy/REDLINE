import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { reducedMotion } from "@/lib/motionTokens";
import { Radio } from "lucide-react";

/**
 * Tactical Typing/Decoding Indicator — animated red waveform spectrum with terminal telemetry.
 */
export default function TypingBubble({
  thinking = true,
  accentColor = "#ff1e2d",
  motionOff = false,
}: {
  thinking?: boolean;
  accentColor?: string;
  motionOff?: boolean;
}): React.JSX.Element {
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion() || motionOff) return;
    const bars = barsRef.current?.querySelectorAll<HTMLSpanElement>(".spectrum-bar");
    if (!bars || bars.length === 0) return;

    const anim = animate(Array.from(bars), {
      scaleY: [0.3, 1.2, 0.4],
      opacity: [0.4, 1, 0.5],
      duration: 650,
      delay: stagger(100, { start: 0 }),
      ease: "inOutSine",
      loop: true,
    });

    return () => {
      anim.revert();
    };
  }, [motionOff]);

  return (
    <div
      aria-label={thinking ? "Decrypting incoming transmission" : "Bot is typing"}
      className="flex items-center gap-3 px-4 py-3 bg-[#0a0d12]/90 border border-white/10 backdrop-blur-md"
    >
      <Radio className="w-3.5 h-3.5" style={{ color: accentColor }} />
      <span className="font-[family-name:var(--font-code)] text-[11px] font-bold tracking-[0.18em] text-white/60 uppercase select-none">
        Decrypting Signal
      </span>
      <div ref={barsRef} className="flex items-center gap-1 h-3.5 px-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="spectrum-bar block w-1 h-3 rounded-none origin-bottom"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 8px ${accentColor}aa`,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
