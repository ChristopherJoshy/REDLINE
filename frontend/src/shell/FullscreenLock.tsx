import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";
import { useWakeLock } from "@/shell/useWakeLock";

// Fullscreen enforcement on every player screen (login included).
// Browsers only grant fullscreen inside a real user gesture, so there is no
// true "auto-enter on load": instead EVERY gesture (tap, click, keypress)
// re-attempts while unlocked, and a blocking overlay CTA supplies the gesture
// itself. Never traps ESC; re-request + overlay is the enforcement.
// Also holds a screen wake lock so venue machines never sleep mid-match.
export default function FullscreenLock({ onLockChange, wakeLock }: { onLockChange: (locked: boolean) => void; wakeLock?: boolean }): React.JSX.Element | null {
  const [locked, setLocked] = useState(() => document.fullscreenElement !== null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useWakeLock(wakeLock ?? true);

  const logAttempt = useCallback(() => {
    void apiFetch("/api/fullscreen-log", { method: "POST" }).catch(() => {});
  }, []);

  const request = useCallback(() => {
    if (document.fullscreenElement !== null) return;
    const el = document.documentElement;
    const attempt = async (): Promise<void> => {
      try {
        await el.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
      } catch {
        await el.requestFullscreen();
      }
      const kb = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard;
      if (kb?.lock) await kb.lock(["Escape"]).catch(() => {});
    };
    void attempt().catch(() => {});
  }, []);

  useEffect(() => {
    // Mount attempt (rejected without a gesture — the overlay CTA covers it).
    request();
    function sync(): void {
      const isLocked = document.fullscreenElement !== null;
      const wasLocked = lockedRef.current;
      lockedRef.current = isLocked;
      setLocked(isLocked);
      onLockChange(isLocked);
      if (!isLocked && wasLocked) {
        logAttempt();
        window.dispatchEvent(new CustomEvent("arena:security_violation", { detail: { type: "fullscreen_exit" } }));
      }
    }
    function onHidden(): void {
      if (document.visibilityState === "hidden" && lockedRef.current) {
        logAttempt();
      }
    }
    // Every gesture is a fresh chance: browsers grant fullscreen here.
    function onGesture(): void {
      if (document.fullscreenElement === null) {
        request();
      }
    }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onHidden);
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("touchstart", onGesture, true);
    document.addEventListener("click", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onHidden);
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("touchstart", onGesture, true);
      document.removeEventListener("click", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    };
  }, [request, logAttempt, onLockChange]);

  if (locked) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/95 p-6" role="alertdialog" aria-modal="true" aria-label="Fullscreen required">
      <span className="flex h-14 w-14 items-center justify-center border border-redline/50 bg-[#0d0606]" aria-hidden="true">
        <Maximize className="h-7 w-7 text-redline" />
      </span>
      <h2 className="font-[family-name:var(--font-display)] text-[28px] font-bold uppercase tracking-[0.2em] text-white">
        Fullscreen required
      </h2>
      <div className="h-[2px] w-32 bg-gradient-to-r from-transparent via-redline to-transparent" aria-hidden="true" />
      <p className="max-w-[52ch] text-center text-[14px] text-text-2">
        Tap below to enter fullscreen and continue. Leaving fullscreen pauses input and the attempt is logged.
      </p>
      <Button onClick={request} className="redline-primary-cta min-h-[48px] px-8 font-mono text-[14px] font-bold uppercase tracking-[0.2em]">
        Enter fullscreen
      </Button>
    </div>
  );
}
