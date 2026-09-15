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
import { Trophy, LogOut, Coins, ChevronDown, X } from "lucide-react";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";
import type { AssessmentSettingsData } from "@contracts/events";

const DEFAULT_ASSESSMENT_SETTINGS: AssessmentSettingsData = {
  requireFullscreen: false,
  detectTabSwitches: false,
  singleTabMode: false,
  disableRightClick: false,
  disableCopyPaste: false,
};

export default function App(): React.JSX.Element {
  const [path] = useState(() => window.location.pathname);
  const [identity, setIdentity] = useState<IdentifyResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const [announcement, setAnnouncement] = useState<{ id: string; message: string; level: string; sender?: string } | null>(null);
  const [shellAccent, setShellAccent] = useState("var(--color-brass)");
  const [shellAccentInk, setShellAccentInk] = useState("var(--color-bg-0)");
  const [activeTab, setActiveTab] = useState<"arena" | "leaderboard" | "intel" | "about">("arena");
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [hideNav, setHideNav] = useState(false);
  const [assessmentSettings, setAssessmentSettings] = useState<AssessmentSettingsData>(DEFAULT_ASSESSMENT_SETTINGS);
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
      setIdentity((prev) => prev && custom.detail.teamId === prev.teamId ? { ...prev, elo: custom.detail.elo } : prev);
    }
    function handleAccent(e: Event) {
      const custom = e as CustomEvent<{ accent?: string; ink?: string }>;
      if (typeof custom.detail.accent === "string") setShellAccent(custom.detail.accent);
      if (typeof custom.detail.ink === "string") setShellAccentInk(custom.detail.ink);
    }
    function handleCredits(e: Event) {
      const custom = e as CustomEvent<number>;
      if (typeof custom.detail === "number") setCredits(custom.detail);
    }
    function handleAssessment(e: Event) {
      const custom = e as CustomEvent<AssessmentSettingsData>;
      setAssessmentSettings(custom.detail);
    }
    window.addEventListener("arena:assessment_settings", handleAssessment);
    function handleNavVis(e: Event) {
      const custom = e as CustomEvent<{ hidden: boolean }>;
      if (custom.detail && typeof custom.detail.hidden === "boolean") {
        setHideNav(custom.detail.hidden);
      }
    }
    window.addEventListener("arena:announcement", handleAnnouncement);
    window.addEventListener("arena:elo_update", handleEloUpdate);
    window.addEventListener("arena:accent", handleAccent);
    window.addEventListener("arena:credits", handleCredits);
    window.addEventListener("arena:nav_visibility", handleNavVis);
    return () => {
      window.removeEventListener("arena:announcement", handleAnnouncement);
      window.removeEventListener("arena:elo_update", handleEloUpdate);
      window.removeEventListener("arena:accent", handleAccent);
      window.removeEventListener("arena:credits", handleCredits);
      window.removeEventListener("arena:nav_visibility", handleNavVis);
      window.removeEventListener("arena:assessment_settings", handleAssessment);
    };
  }, []); // No dependencies needed
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
  }, [announcement]);

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
            void me().then((m) => {
              setIdentity(m);
            });
          }
        }}
      />
    );
  }

  return (
    <main className="bot-theme no-steal redline-bg relative flex min-h-[100dvh] flex-col text-[var(--color-text-1)]" style={{ "--accent": shellAccent, "--accent-ink": shellAccentInk } as React.CSSProperties}>
      {assessmentSettings.requireFullscreen && <FullscreenLock onLockChange={onLockChange} />}
      <AntiTamper settings={assessmentSettings} />
      <div aria-hidden="true" className="redline-veil pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex min-h-[100dvh] flex-col">
      {announcement && (
        <div
          ref={bannerRef}
          className={`acc-border flex items-center justify-between border-b bg-surface-2 px-4 py-2 sm:px-8 ${
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
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {!hideNav && (
        <header className="sticky top-0 z-30 flex min-h-[66px] items-center justify-between gap-3 border-b border-redline bg-bg-0 px-4 sm:px-6">
        {/* Left: REDLINE CTF ARENA + 3-line mini ticker */}
        <div className="flex items-center gap-3.5">
          <div className="flex flex-col leading-none">
            <div className="flex items-center gap-1.5">
              <span className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[0.14em] text-text-1">
                R<span className="text-brass">E</span>DLINE
              </span>
            </div>
            <span className="mt-0.5 font-[family-name:var(--font-code)] text-[9px] font-bold tracking-[0.32em] text-[var(--color-text-3)]">
              CTF ARENA
            </span>
          </div>
          <div className="hidden h-[32px] w-px bg-border sm:block sm:mx-2" />
          <div className="hidden lg:flex flex-col text-[7px] font-bold leading-[1.3] tracking-[0.24em] text-text-3 font-[family-name:var(--font-code)]">
            <span>PEOPLE</span>
            <span>MANIPULATE.</span>
            <span>WE BREAK SYSTEMS.</span>
          </div>
        </div>

        {/* Center: ARENA / ABOUT tabs */}
        <div className="hidden md:flex flex-1 items-center justify-center">
          <nav className="flex items-center gap-6" aria-label="Command Center">
            <button
              type="button"
              onClick={() => setActiveTab("arena")}
              className={`relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.25em] transition-colors ${
                activeTab === "arena"
                  ? "text-brass after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[2px] after:bg-brass"
                  : "text-text-3 hover:text-text-1"
              }`}
            >
              ARENA
            </button>

            <button
              type="button"
              onClick={() => setShowLeaderboard(true)}
              className="relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.2em] text-text-3 hover:text-text-1 transition-colors"
            >
              LEADERBOARD
            </button>

            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="relative px-4 py-4 text-[11px] font-[family-name:var(--font-code)] font-bold tracking-[0.2em] text-text-3 hover:text-text-1 transition-colors"
            >
              ABOUT
            </button>
          </nav>
        </div>

        {/* Right: Credits + Profile Dropdown */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("arena:open_satchel"))}
            title="Open Satchel & Credits"
            className="flex min-h-[38px] items-center gap-2 rounded-[6px] border border-gold-border bg-gold-wash px-3 py-1.5 font-[family-name:var(--font-code)] text-[12px] font-bold text-gold-bright transition hover:border-gold cursor-pointer"
          >
            <Coins className="h-3.5 w-3.5" />
            <span>{credits !== null ? credits : 0}</span>
          </button>

          <ProfileDropdown identity={identity} credits={credits} logout={logout} setIdentity={setIdentity} />
        </div>
      </header>
      )}

      {/* Main Full-Width Content Container */}
      <div className="flex min-h-0 flex-1 flex-col">
        <GatedArena teamId={identity.teamId} displayName={identity.displayName} locked={assessmentSettings.requireFullscreen ? locked : true} />
      </div>

      {/* Modal Dialogs for Header Tabs */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-1/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" className="redline-panel max-w-md w-full p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 id="leaderboard-title" className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[0.08em] text-text-1">
                LEADERBOARD
              </h3>
              <button
                type="button"
                onClick={() => setShowLeaderboard(false)}
                className="min-h-11 px-2 py-1 text-[16px] font-bold text-text-3 hover:text-text-1"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="text-[13px] text-[var(--color-text-2)] leading-relaxed">
              Team <strong className="text-text-1">{identity.teamName || "Vanguard"}</strong> currently holds <span className="font-bold text-brass">{identity.elo ?? 600} ELO</span>.
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
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-1/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="redline-panel max-w-lg w-full p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 id="about-title" className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[0.08em] text-text-1">
                REDLINE CTF ARENA
              </h3>
              <button
                type="button"
                onClick={() => setShowAbout(false)}
                className="min-h-11 px-2 py-1 text-[16px] font-bold text-text-3 hover:text-text-1"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px] text-[var(--color-text-2)] leading-relaxed">
              <p>
                <strong className="text-text-1">Mission:</strong> Build credible covers, earn eight relics through conversation, and file genuine articles at the merchant counter.
              </p>
              <p>
                <strong className="text-text-1">Scoring:</strong> Each verified relic earns matchup ELO. The fastest teams for each character also earn a small speed bonus.
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

interface ProfileDropdownProps {
  identity: IdentifyResult;
  credits: number | null;
  logout: () => Promise<void>;
  setIdentity: React.Dispatch<React.SetStateAction<IdentifyResult | null>>;
}

function ProfileDropdown({ identity, credits, logout, setIdentity }: ProfileDropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button 
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Open team menu"
        className="ml-1 flex min-h-[44px] items-center gap-1.5 cursor-pointer text-text-3 transition-colors hover:text-text-1"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-border-strong bg-surface-2 font-bold text-[12px] text-text-1">
          {identity.teamName ? identity.teamName.charAt(0).toUpperCase() : "V"}
        </div>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-60 origin-top-right flex-col gap-1 rounded-[8px] border border-border-strong bg-surface-1 p-2">
          <div className="mb-1 border-b border-border px-3 py-2">
            <p className="truncate text-[13px] font-bold text-text-1">{identity.teamName || "Vanguard"}</p>
            <p className="font-[family-name:var(--font-code)] text-[10px] text-[var(--color-text-3)] mt-0.5">Operative</p>
          </div>
          
          <div className="flex items-center justify-between px-3 py-2">
            <span className="flex items-center gap-2 text-[12px] text-text-2"><Trophy className="h-3.5 w-3.5 text-brass" /> ELO</span>
            <span className="font-mono font-bold text-[12px] text-brass">{identity.elo ?? 600}</span>
          </div>
          
          <div className="flex items-center justify-between px-3 py-2">
            <span className="flex items-center gap-2 text-[12px] text-[var(--color-text-2)]"><Coins className="h-3.5 w-3.5 text-[var(--color-gold-bright)]" /> Coins</span>
            <span className="font-bold text-[12px] text-[var(--color-gold-bright)]">{credits !== null ? credits : 0}</span>
          </div>

          <div className="my-1 h-px w-full bg-border" />
          
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Are you sure you want to leave the arena?")) return;
              try { await logout(); } catch { /* ignore */ }
              setIdentity(null);
              window.location.reload();
            }}
            className="flex min-h-[44px] items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[12px] font-bold text-seal transition-colors hover:bg-seal-wash cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>LOGOUT</span>
          </button>
        </div>
      )}
    </div>
  );
}
