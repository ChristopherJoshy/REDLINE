import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import EnterScreen from "@/screens/EnterScreen";
import AdminTeams from "@/screens/AdminTeams";
import AdminBoard from "@/screens/AdminBoard";
import GatedArena, { GatesPanel } from "@/screens/GatedArena";
import FullscreenLock from "@/shell/FullscreenLock";
import AntiTamper from "@/shell/AntiTamper";
import IntelModal from "@/components/IntelModal";
import { me, logout, type IdentifyResult } from "@/api/teams";
import { apiFetch } from "@/api/client";
import { Users, User, Trophy, LogOut, Shield, Coins } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"arena" | "leaderboard" | "intel" | "about">("arena");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showIntel, setShowIntel] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
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
    function handleCredits(e: Event) {
      const custom = e as CustomEvent<number>;
      if (typeof custom.detail === "number") setCredits(custom.detail);
    }
    window.addEventListener("arena:credits", handleCredits);
    return () => {
      window.removeEventListener("arena:announcement", handleAnnouncement);
      window.removeEventListener("arena:elo_update", handleEloUpdate);
      window.removeEventListener("arena:accent", handleAccent);
      window.removeEventListener("arena:credits", handleCredits);
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

      <header className="acc-border sticky top-0 z-30 flex min-h-[58px] items-center justify-between gap-3 border-b bg-[rgba(5,7,10,0.85)] px-4 backdrop-blur-md sm:px-6">
        {/* Left: REDLINE CTF ARENA + 4-line mini ticker */}
        <div className="flex items-center gap-3.5">
          <div className="flex flex-col leading-none">
            <div className="flex items-center gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[0.18em] text-white">
                R<span className="text-[#ff1e2d]">E</span>DLINE
              </span>
            </div>
            <span className="mt-0.5 font-[family-name:var(--font-code)] text-[9px] font-bold tracking-[0.32em] text-[var(--color-text-3)]">
              CTF ARENA
            </span>
          </div>
          <div className="hidden sm:block h-6 w-[1px] bg-white/10" />
          <div className="hidden lg:flex flex-col text-[7.5px] font-bold tracking-[0.24em] leading-[1.1] text-[var(--color-text-faint)] font-[family-name:var(--font-code)]">
            <span>PEOPLE</span>
            <span>MANIPULATION</span>
            <span>INFORMATION</span>
            <span>POWER</span>
          </div>
        </div>

        {/* Center: ARENA / LEADERBOARD / INTEL / ABOUT tabs + Quote */}
        <div className="hidden md:flex items-center gap-6">
          <nav className="flex items-center gap-1.5" aria-label="Command Center">
            <button
              type="button"
              onClick={() => setActiveTab("arena")}
              className={`relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.25em] transition-colors ${
                activeTab === "arena"
                  ? "text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[2px] after:bg-[#ff1e2d] after:shadow-[0_0_10px_rgba(255,30,45,0.8)]"
                  : "text-[var(--color-text-3)] hover:text-white"
              }`}
            >
              ARENA
            </button>
            <button
              type="button"
              onClick={() => setShowLeaderboard(true)}
              className="relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.25em] text-[var(--color-text-3)] hover:text-white transition-colors"
            >
              LEADERBOARD
            </button>
            <button
              type="button"
              onClick={() => setShowIntel(true)}
              className="relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.25em] text-[var(--color-text-3)] hover:text-white transition-colors"
            >
              INTEL
            </button>
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.25em] text-[var(--color-text-3)] hover:text-white transition-colors"
            >
              ABOUT
            </button>
          </nav>
          <span className="hidden xl:inline-block text-[10.5px] font-[family-name:var(--font-code)] tracking-[0.16em] text-[var(--color-text-faint)]">
            “PEOPLE MANIPULATE. WE BREAK SYSTEMS.”
          </span>
        </div>

        {/* Right: Vanguard | Ghost | Credits | Leave */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm">
            <User className="h-3.5 w-3.5 text-[var(--color-text-3)]" />
            <span className="tracking-[0.06em]">{identity.teamName || "VANGUARD"}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-2)] backdrop-blur-sm">
            <Shield className="h-3.5 w-3.5 text-[var(--color-text-3)]" />
            <span className="tracking-[0.06em]">GHOST</span>
          </div>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("arena:open_satchel"))}
            title="Open Satchel & Credits"
            className="flex items-center gap-1.5 rounded-[6px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.12)] px-3 py-1.5 font-[family-name:var(--font-code)] text-[12px] font-bold text-[var(--color-gold-bright)] shadow-[0_0_12px_rgba(216,155,36,0.15)] hover:bg-[rgba(216,155,36,0.2)] transition cursor-pointer"
          >
            <Coins className="h-3.5 w-3.5" />
            <span>{credits !== null ? credits : (identity.elo ?? 928)}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              if (!confirm("Are you sure you want to leave the arena?")) return;
              try { await logout(); } catch { /* ignore */ }
              setIdentity(null);
              window.location.reload();
            }}
            className="flex items-center gap-1.5 rounded-[6px] border border-[#ff1e2d] bg-[#ff1e2d]/15 px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_0_15px_rgba(255,30,45,0.3)] hover:bg-[#ff1e2d]/25 transition cursor-pointer"
            title="Log out and leave arena"
          >
            <LogOut className="h-3.5 w-3.5 text-[#ff1e2d]" />
            <span className="tracking-[0.08em]">LEAVE</span>
          </button>
        </div>
      </header>

      {/* Main Full-Width Content Container */}
      <div className="flex min-h-0 flex-1 flex-col">
        <GatedArena teamId={identity.teamId} displayName={identity.displayName} locked={!FULLSCREEN_LOCK_ENABLED || locked} />
      </div>

      {/* Modal Dialogs for Header Tabs */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="redline-panel max-w-md w-full rounded-[12px] border border-white/10 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[0.08em] text-white">
                LEADERBOARD
              </h3>
              <button
                type="button"
                onClick={() => setShowLeaderboard(false)}
                className="text-[var(--color-text-3)] hover:text-white font-bold text-[16px] px-2 py-1"
              >
                ✕
              </button>
            </div>
            <p className="text-[13px] text-[var(--color-text-2)] leading-relaxed">
              Active CTF Standing: Team <strong className="text-white">{identity.teamName || "VANGUARD"}</strong> currently holds <span className="text-[var(--color-gold-bright)] font-bold">{identity.elo ?? 928} ELO</span>.
            </p>
            <p className="text-[12px] text-[var(--color-text-3)]">
              Per competitive CTF rules, live team ranking is calculated dynamically and revealed by the Arena Marshals at stage completion.
            </p>
            <button
              type="button"
              onClick={() => setShowLeaderboard(false)}
              className="redline-primary-cta rounded-[8px] py-2.5 font-semibold text-[13px] mt-2"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {showIntel && <IntelModal onClose={() => setShowIntel(false)} />}

      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="redline-panel max-w-lg w-full rounded-[12px] border border-white/10 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[0.08em] text-white">
                REDLINE CTF ARENA
              </h3>
              <button
                type="button"
                onClick={() => setShowAbout(false)}
                className="text-[var(--color-text-3)] hover:text-white font-bold text-[16px] px-2 py-1"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px] text-[var(--color-text-2)] leading-relaxed">
              <p>
                <strong className="text-white">Mission:</strong> Infiltrate 8 persona-driven marks + 1 Arena Merchant through social engineering, psychology, and conversational exploitation.
              </p>
              <p>
                <strong className="text-white">Relics:</strong> Extract each character's authentic target item. Guard against decoys and fakes.
              </p>
              <p>
                <strong className="text-white">Round 2:</strong> File 5 or more relics to breach the vault gates and confront the legendary bosses.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAbout(false)}
              className="redline-primary-cta rounded-[8px] py-2.5 font-semibold text-[13px] mt-2"
            >
              ENTER ARENA
            </button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
