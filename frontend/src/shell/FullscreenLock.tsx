import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";

// Fullscreen enforcement: overlay + Resume + server-side attempt log.
// Never traps ESC; re-request + overlay penalty is the enforcement.
export default function FullscreenLock({ onLockChange }: { onLockChange: (locked: boolean) => void }): React.JSX.Element | null {
  const [locked, setLocked] = useState(() => document.fullscreenElement !== null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const logAttempt = useCallback(() => {
    void apiFetch("/api/fullscreen-log", { method: "POST" }).catch(() => {});
  }, []);

  const request = useCallback(() => {
    void document.documentElement.requestFullscreen().then(() => {
      if ("keyboard" in navigator && "lock" in (navigator as any).keyboard) {
        (navigator as any).keyboard.lock(["Escape"]).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
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
    function onInteraction(): void {
      if (document.fullscreenElement === null) {
        request();
      }
    }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", onHidden);
    document.addEventListener("click", onInteraction);
    document.addEventListener("keydown", onInteraction);
    window.addEventListener("blur", onHidden);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", onHidden);
      document.removeEventListener("click", onInteraction);
      document.removeEventListener("keydown", onInteraction);
      window.removeEventListener("blur", onHidden);
    };
  }, [request, logAttempt, onLockChange]);

  if (locked) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg-0)] p-[var(--space)]" role="alertdialog" aria-label="Fullscreen required">
      <h2 className="font-[family-name:var(--font-display)] text-[28px] font-bold text-[var(--color-text-1)]">
        Return to fullscreen to continue
      </h2>
      <p className="max-w-[52ch] text-center text-[14px] text-[var(--color-text-3)]">
        This attempt was logged. Chat stays disabled until you resume.
      </p>
      <Button onClick={request}>Resume</Button>
    </div>
  );
}
