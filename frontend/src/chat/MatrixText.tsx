import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motionTokens";

const MATRIX_GLYPHS = "アカサタナハマヤラワ0123456789ABCDEFRL<>*+#";
const SCRAMBLE_MS = 450;
const CASCADE_MS = 25;
const FLICKER_MS = 50;

interface MatrixTextProps {
  text: string;
  isStreaming?: boolean;
  animateOnMount?: boolean;
  className?: string;
  accentColor?: string;
}

/**
 * MatrixText — renders text with a cyberpunk/matrix glyph scramble decode effect.
 * Incoming or newly added characters flicker with glowing matrix glyphs in the accent color
 * before snapping into place.
 */
export default function MatrixText({
  text,
  isStreaming = false,
  animateOnMount = true,
  className = "",
  accentColor = "#ff1e2d",
}: MatrixTextProps): React.JSX.Element {
  // Map of character index -> current scrambling matrix glyph
  const [glyphs, setGlyphs] = useState<Record<number, string>>({});
  const settledCountRef = useRef(animateOnMount ? 0 : text.length);
  const prevTextRef = useRef(animateOnMount ? "" : text);
  const timersRef = useRef<Record<number, number>>({});
  const flickerTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      for (const t of Object.values(timersRef.current)) {
        window.clearTimeout(t);
      }
      timersRef.current = {};
      if (flickerTimerRef.current !== undefined) {
        window.clearInterval(flickerTimerRef.current);
        flickerTimerRef.current = undefined;
      }
      
      // StrictMode / Remount fix: if unmounted, reset state so remounting starts fresh
      if (animateOnMount) {
        settledCountRef.current = 0;
        prevTextRef.current = "";
      } else {
        settledCountRef.current = prevTextRef.current.length;
      }
      setGlyphs({});
    };
  }, [animateOnMount]);

  useEffect(() => {
    if (reducedMotion()) {
      settledCountRef.current = text.length;
      prevTextRef.current = text;
      setGlyphs({});
      return;
    }

    const prevLen = prevTextRef.current.length;
    const curLen = text.length;
    prevTextRef.current = text;

    // If text reset or shortened
    if (curLen < prevLen) {
      settledCountRef.current = curLen;
      setGlyphs({});
      for (const t of Object.values(timersRef.current)) {
        window.clearTimeout(t);
      }
      timersRef.current = {};
      if (flickerTimerRef.current !== undefined) {
        window.clearInterval(flickerTimerRef.current);
        flickerTimerRef.current = undefined;
      }
      return;
    }

    // New characters arrived
    if (curLen > settledCountRef.current) {
      const startIndex = settledCountRef.current;
      const newIndices: number[] = [];

      for (let i = startIndex; i < curLen; i++) {
        const char = text[i];
        // Don't scramble whitespace or newlines to maintain solid layout
        if (char === " " || char === "\n" || char === "\t" || char === "\r") {
          continue;
        }
        newIndices.push(i);
      }

      if (newIndices.length > 0) {
        // Assign initial random glyphs
        setGlyphs((prev) => {
          const next = { ...prev };
          for (const idx of newIndices) {
            next[idx] = MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)] ?? "#";
          }
          return next;
        });

        // Set settle timers for each index
        newIndices.forEach((idx, offset) => {
          const oldTimer = timersRef.current[idx];
          if (oldTimer !== undefined) window.clearTimeout(oldTimer);

          const delay = SCRAMBLE_MS + offset * CASCADE_MS;
          timersRef.current[idx] = window.setTimeout(() => {
            delete timersRef.current[idx];
            setGlyphs((prev) => {
              if (prev[idx] === undefined) return prev;
              const copy = { ...prev };
              delete copy[idx];
              return copy;
            });

            if (Object.keys(timersRef.current).length === 0 && flickerTimerRef.current !== undefined) {
              window.clearInterval(flickerTimerRef.current);
              flickerTimerRef.current = undefined;
            }
          }, delay);
        });

        // Ensure flicker timer is active
        if (flickerTimerRef.current === undefined) {
          flickerTimerRef.current = window.setInterval(() => {
            setGlyphs((prev) => {
              const keys = Object.keys(prev);
              if (keys.length === 0) return prev;
              const next = { ...prev };
              for (const k of keys) {
                next[Number(k)] = MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)] ?? "#";
              }
              return next;
            });
          }, FLICKER_MS);
        }
      }

      settledCountRef.current = curLen;
    }
  }, [text]);

  // If no scrambling or reduced motion
  const hasActiveGlyphs = Object.keys(glyphs).length > 0;

  if (!hasActiveGlyphs) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {text.split("").map((char, i) => {
        const glyph = glyphs[i];
        if (glyph !== undefined) {
          return (
            <span
              key={i}
              className="inline-block font-mono font-bold select-none transition-none"
              style={{
                color: accentColor,
                textShadow: `0 0 10px ${accentColor}cc, 0 0 18px ${accentColor}66`,
              }}
            >
              {glyph}
            </span>
          );
        }
        return <span key={i}>{char}</span>;
      })}
    </span>
  );
}
