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
import { Users, User, Trophy, LogOut, TriangleAlert, Radar, Backpack } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

// Fullscreen enforcement kill-switch: false = off for now, true = re-enable.
const FULLSCREEN_LOCK_ENABLED = false;

export default function App(): React.JSX.Element {
  const [path] = useState(() => window.location.pathname);
  const [identity, setIdentity] = useState<IdentifyResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const [announcement, setAnnouncement] = useState<{ id: string; message: string; level: string; sender?: string } | null>(null);
  const [shellAccent, setShellAccent] = useState("#ff1e2d");
  const [shellAccentInk, setShellAccentInk] = useState("#ffffff");
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
    function handleAccent(e: Event) {
      const custom = e as CustomEvent<{ accent?: string; ink?: string }>;
      if (typeof custom.detail.accent === "string") setShellAccent(custom.detail.accent);
      if (typeof custom.detail.ink === "string") setShellAccentInk(custom.detail.ink);
    }
    window.addEventListener("arena:accent", handleAccent);
    return () => {
      window.removeEventListener("arena:announcement", handleAnnouncement);
      window.removeEventListener("arena:elo_update", handleEloUpdate);
      window.removeEventListener("arena:accent", handleAccent);
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
    <main className="bot-theme no-steal redline-bg relative flex min-h-[100dvh] flex-col text-[var(--color-text-1)]" style={{ "--accent": shellAccent, "--accent-ink": shellAccentInk } as React.CSSProperties}>
      {FULLSCREEN_LOCK_ENABLED && <FullscreenLock onLockChange={onLockChange} />}
      <AntiTamper />
      <div aria-hidden="true" className="redline-veil pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex min-h-[100dvh] flex-col">
      {announcement && (
        <div
          ref={bannerRef}
          className={`acc-border flex items-center justify-between border-b bg-[rgba(13,17,23,0.95)] px-4 py-2 sm:px-8 ${
            announcement.level === "alert"
              ? "acc-text"
              : announcement.level === "warning"
              ? "text-[var(--color-gold-bright)]"
              : "text-[var(--color-text-1)]"
          }`}
          style={{ opacity: reducedMotion() ? 1 : 0 }}
        >
          <div className="mx-auto flex items-center gap-2 text-[14px]">
            <span className="redline-chip rounded-[6px] px-2 py-0.5 font-[family-name:var(--font-code)] text-[11px]">
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

      <header className="acc-border sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-3 border-b bg-[rgba(5,7,10,0.92)] px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="acc-bar block h-9 w-[3px] rounded-full" />
          <div className="flex flex-col leading-none">
            <span className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[0.14em] text-white">
              R<span className="acc-text-strong">E</span>DLINE
            </span>
            <span className="mt-1 font-[family-name:var(--font-code)] text-[10px] font-medium tracking-[0.3em] text-[var(--color-text-3)]">
              CTF ARENA
            </span>
          </div>
          <span className="ml-4 hidden items-center gap-2 lg:flex">
            <span className="acc-wash rounded-[6px] border px-2.5 py-1 font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.18em]">
              ARENA MARSHAL
            </span>
            <span className="text-[13px] text-[var(--color-text-2)]">Checking</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="redline-chip hidden items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--color-text-2)] md:flex">
            <Users className="h-4 w-4 text-[var(--color-text-3)]" />
            <span className="font-semibold text-white">{identity.teamName || "Squad"}</span>
          </div>
          <div className="redline-chip hidden items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--color-text-2)] sm:flex">
            <User className="h-4 w-4 text-[var(--color-text-3)]" />
            <span className="font-semibold text-white">{identity.displayName}</span>
          </div>
          <div
            ref={eloBadgeRef}
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(216,155,36,0.5)] bg-[rgba(216,155,36,0.1)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[13px] font-bold text-[var(--color-gold-bright)] shadow-[0_0_16px_rgba(216,155,36,0.15)]"
          >
            <Trophy className="h-4 w-4" />
            <span>{identity.elo ?? 1200}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              try { await logout(); } catch { /* ignore */ }
              setIdentity(null);
              window.location.reload();
            }}
            className="acc-wash flex min-h-[44px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[13px] font-semibold transition hover:brightness-125"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Arena" className="sticky top-[64px] hidden h-[calc(100dvh-64px)] w-[92px] shrink-0 flex-col items-center gap-1 border-r border-[rgba(255,255,255,0.08)] bg-[rgba(5,7,10,0.9)] py-4 md:flex">
          <span className="mb-1 font-[family-name:var(--font-code)] text-[9px] tracking-[0.2em] text-[var(--color-text-faint)]">
            ALL ACCORDING TO PLAN
          </span>
          <span className="acc-wash acc-glow flex w-12 flex-col items-center gap-1 rounded-[8px] border px-2 py-2.5">
            <TriangleAlert className="h-5 w-5" />
            <span className="text-[9px] font-bold tracking-[0.14em]">ARENA</span>
          </span>
          <span className="flex w-12 flex-col items-center gap-1 rounded-[8px] px-2 py-2.5 text-[var(--color-text-faint)] transition hover:text-[var(--color-text-2)]">
            <Radar className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-[0.14em]">INTEL</span>
          </span>
          <span className="flex w-12 flex-col items-center gap-1 rounded-[8px] px-2 py-2.5 text-[var(--color-text-faint)] transition hover:text-[var(--color-text-2)]">
            <Backpack className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-[0.14em]">LOADOUT</span>
          </span>
          <span className="flex w-12 flex-col items-center gap-1 rounded-[8px] px-2 py-2.5 text-[var(--color-text-faint)] transition hover:text-[var(--color-text-2)]">
            <Trophy className="h-5 w-5" />
            <span className="text-[9px] font-semibold tracking-[0.1em]">RANKS</span>
          </span>
          <span className="mt-auto hidden px-1 text-center font-[family-name:var(--font-code)] text-[8px] leading-relaxed tracking-[0.16em] text-[var(--color-text-faint)] lg:block">
            HACK /<br />EXTRACT /<br />WIN
          </span>
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <GatedArena teamId={identity.teamId} displayName={identity.displayName} locked={!FULLSCREEN_LOCK_ENABLED || locked} />
        </div>
      </div>
      </div>
    </main>
  );
}
