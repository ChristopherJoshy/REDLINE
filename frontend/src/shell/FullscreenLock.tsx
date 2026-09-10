import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Fullscreen enforcement: overlay + Resume + server-side attempt log.
// Never traps ESC; re-request + overlay penalty is the enforcement.
export default function FullscreenLock({ onLockChange }: { onLockChange: (locked: boolean) => void }): React.JSX.Element | null {
  const [locked, setLocked] = useState(() => document.fullscreenElement !== null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const logAttempt = useCallback(() => {
    void fetch("/api/fullscreen-log", { method: "POST" }).catch(() => {});
  }, []);

  const request = useCallback(() => {
    void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    request();
    function sync(): void {
      const isLocked = document.fullscreenElement !== null;
      setLocked(isLocked);
      onLockChange(isLocked);
      if (!isLocked) {
        logAttempt();
      }
    }
    function onHidden(): void {
      if (document.visibilityState === "hidden" && lockedRef.current) {
        logAttempt();
      }
    }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onHidden);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", onHidden);
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
