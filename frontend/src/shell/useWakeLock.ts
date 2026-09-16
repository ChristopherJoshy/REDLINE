import { useEffect, useRef } from "react";

// Screen wake lock: keeps venue machines from dimming/locking mid-match.
// Primary: Screen Wake Lock API (HTTPS only). Fallback for plain-HTTP LAN:
// a hidden muted video fed by canvas.captureStream() (NoSleep-style) —
// playback alone keeps most platforms awake. Re-acquires whenever the tab
// becomes visible again; the API auto-releases on hide.
export function useWakeLock(active: boolean): void {
  const wanted = useRef(active);
  wanted.current = active;
  const sentinel = useRef<{ released: boolean; release: () => Promise<void> } | null>(null);
  const fallbackVideo = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let dead = false;

    function startFallbackVideo(): void {
      try {
        if (fallbackVideo.current !== null) {
          void fallbackVideo.current.play().catch(() => {});
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const stream = (canvas as HTMLCanvasElement & { captureStream?: () => MediaStream }).captureStream?.();
        if (!stream) return;
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("aria-hidden", "true");
        video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0;";
        const src = video as HTMLVideoElement & { srcObject?: MediaStream | null };
        src.srcObject = stream;
        document.body.appendChild(video);
        fallbackVideo.current = video;
        void video.play().catch(() => {});
      } catch {
        // best effort only
      }
    }

    async function acquire(): Promise<void> {
      if (dead || !wanted.current || document.visibilityState !== "visible") return;
      const api = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ released: boolean; release: () => Promise<void>; onrelease?: (() => void) | null }> } }).wakeLock;
      if (api) {
        try {
          if (sentinel.current && !sentinel.current.released) return;
          const lock = await api.request("screen");
          if (dead || !wanted.current) {
            await lock.release().catch(() => {});
            return;
          }
          sentinel.current = lock;
          lock.onrelease = () => {
            sentinel.current = null;
            // System stole it (battery saver, etc.): take it back while wanted.
            if (wanted.current && !dead) void acquire().catch(() => {});
          };
          return;
        } catch {
          // denied/unavailable: fall through to video trick
        }
      }
      startFallbackVideo();
    }

    function onVisible(): void {
      if (document.visibilityState === "visible") void acquire().catch(() => {});
    }

    void acquire().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVisible);
      const lock = sentinel.current;
      sentinel.current = null;
      if (lock && !lock.released) void lock.release().catch(() => {});
      const video = fallbackVideo.current;
      fallbackVideo.current = null;
      try {
        video?.pause();
        video?.remove();
      } catch {
        // ignore
      }
    };
  }, [active]);
}
