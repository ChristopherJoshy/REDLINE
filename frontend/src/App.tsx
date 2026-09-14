import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import EnterScreen from "@/screens/EnterScreen";
import AdminTeams from "@/screens/AdminTeams";
import AdminBoard from "@/screens/AdminBoard";
import GatedArena, { GatesPanel } from "@/screens/GatedArena";
import FullscreenLock from "@/shell/FullscreenLock";
import AntiTamper from "@/shell/AntiTamper";
import { me, logout, type IdentifyResult } from "@/api/teams";
import { apiFetch } from "@/api/client";
import { Users, User, Trophy, LogOut } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

// Fullscreen enforcement kill-switch: false = off for now, true = re-enable.
const FULLSCREEN_LOCK_ENABLED = false;

export default function App(): React.JSX.Element {
  const [path] = useState(() => window.location.pathname);
  const [identity, setIdentity] = useState<IdentifyResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const [announcement, setAnnouncement] = useState<{ id: string; message: string; level: string; sender?: string } | null>(null);
  const onLockChange = useCallback((v: boolean) => setLocked(v), []);

  // ELO badge ref for live-update pulse
  const eloBadgeRef = useRef<HTMLDivElement>(null);
  const prevEloRef = useRef<number | null>(null);

  // Announcement banner ref
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleAnnouncement(e: Event) {
      const custom = e as CustomEvent<{ id: string; message: string; level: string; sender?: string }>;
      setAnnouncement(custom.detail);
    }
    function handleEloUpdate(e: Event) {
      const custom = e as CustomEvent<{ teamId: string; elo: number; delta: number; reason: string }>;
      if (identity && custom.detail.teamId === identity.teamId) {
        setIdentity((prev) => prev ? { ...prev, elo: custom.detail.elo } : prev);
      }
    }
    window.addEventListener("arena:announcement", handleAnnouncement);
    window.addEventListener("arena:elo_update", handleEloUpdate);
    return () => {
      window.removeEventListener("arena:announcement", handleAnnouncement);
      window.removeEventListener("arena:elo_update", handleEloUpdate);
    };
  }, [identity]);

  // ELO badge pulse on value change
  useEffect(() => {
    if (!identity?.elo) return;
    const cur = identity.elo;
    if (prevEloRef.current !== null && prevEloRef.current !== cur && !reducedMotion() && eloBadgeRef.current) {
      animate(eloBadgeRef.current, {
        scale: [1.2, 1],
        duration: DUR.slow,
        ease: EASE.spring,
      });
    }
    prevEloRef.current = cur;
  }, [identity?.elo]);

  // Announcement banner slide in
  useEffect(() => {
    if (!announcement || reducedMotion() || !bannerRef.current) return;
    animate(bannerRef.current, {
      opacity: [0, 1],
      translateY: [-6, 0],
      duration: DUR.panel,
      ease: EASE.out,
    });
  }, [announcement?.id]);

  useEffect(() => {
    apiFetch("/api/announcements")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { announcements?: Array<{ id: string; message: string; level: string; sender?: string }> } | null) => {
        if (data?.announcements && data.announcements.length > 0) {
          const latest = data.announcements[0];
          if (latest) setAnnouncement(latest);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (path.startsWith("/admin")) { setChecked(true); return; }
    me()
      .then((m) => setIdentity(m))
      .catch(() => setIdentity(null))
      .finally(() => setChecked(true));
  }, [path]);

  function dismissAnnouncement(): void {
    if (!reducedMotion() && bannerRef.current) {
      animate(bannerRef.current, {
        opacity: [1, 0],
        translateY: [0, -4],
        duration: DUR.ui,
        ease: "inQuad",
        onComplete: () => setAnnouncement(null),
      });
    } else {
      setAnnouncement(null);
    }
  }

  if (path.startsWith("/admin/board")) return <AdminBoard />;
  if (path.startsWith("/admin")) {
    return (
      <main className="min-h-[100dvh] w-full bg-[var(--color-bg-0)]">
        <AdminTeams />
      </main>
    );
  }
  if (!checked) return <main className="min-h-[100dvh] bg-[var(--color-bg-0)]" />;
  if (identity === null) {
    return (
      <EnterScreen
        onIdentified={(res) => {
          if (res) {
            setIdentity(res);
          } else {
            void me().then((m) => setIdentity(m));
          }
        }}
      />
    );
  }

  return (
    <main className="no-steal flex min-h-[100dvh] flex-col bg-[var(--color-bg-0)] text-[var(--color-text-1)]">
      {FULLSCREEN_LOCK_ENABLED && <FullscreenLock onLockChange={onLockChange} />}
      <AntiTamper />

      {announcement && (
        <div
          ref={bannerRef}
          className={`flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 sm:px-8 ${
            announcement.level === "alert"
              ? "bg-[var(--color-seal-wash)] text-[var(--color-seal)]"
              : announcement.level === "warning"
              ? "bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]"
              : "bg-[var(--color-surface-1)] text-[var(--color-text-1)]"
          }`}
          style={{ opacity: reducedMotion() ? 1 : 0 }}
        >
          <div className="mx-auto flex items-center gap-2 text-[14px]">
            <span className="px-2 py-0.5 rounded-[6px] border border-[var(--color-border)] text-[11px] font-[family-name:var(--font-code)]">
              {announcement.sender || "Arena"}
            </span>
            <span>{announcement.message}</span>
          </div>
          <button
            type="button"
            onClick={dismissAnnouncement}
            className="ml-4 rounded-[6px] p-1 text-[13px] font-bold hover:bg-[var(--color-surface-2)]"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      <header className="sticky top-0 z-30 flex min-h-[60px] items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="block h-8 w-[3px] bg-[var(--color-brass)]" />
          <div className="flex flex-col">
            <span className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-[0.14em] text-[var(--color-text-1)]">
              REDLINE
            </span>
            <span className="text-[10px] font-medium tracking-[0.22em] text-[var(--color-text-3)] font-[family-name:var(--font-code)]">
              CTF ARENA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[13px] text-[var(--color-text-2)]">
            <Users className="w-4 h-4 text-[var(--color-text-3)]" />
            <span className="hidden sm:inline">Team</span>
            <span className="font-semibold text-[var(--color-text-1)]">{identity.teamName || "Squad"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border)] text-[13px] text-[var(--color-text-2)]">
            <User className="w-4 h-4 text-[var(--color-text-3)]" />
            <span className="hidden sm:inline">Operator</span>
            <span className="font-semibold text-[var(--color-text-1)]">{identity.displayName}</span>
          </div>

          {/* ELO badge — pulses on value change */}
          <div
            ref={eloBadgeRef}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[var(--color-brass-wash)] border border-[var(--color-border-strong)] text-[13px] font-semibold text-[var(--color-brass-ink)] font-[family-name:var(--font-code)]"
          >
            <Trophy className="w-4 h-4" />
            <span>{identity.elo ?? 1200}</span>
          </div>

          <button
            type="button"
            onClick={async () => {
              try { await logout(); } catch { /* ignore */ }
              setIdentity(null);
              window.location.reload();
            }}
            className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border)] text-[var(--color-text-2)] text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Main Arena Workspace */}
      <GatedArena teamId={identity.teamId} displayName={identity.displayName} locked={!FULLSCREEN_LOCK_ENABLED || locked} />
    </main>
  );
}
