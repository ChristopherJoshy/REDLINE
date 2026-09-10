import { useState, useEffect, useMemo } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { createTeam, type CreateTeamResult } from "@/api/teams";
import { getGates, openVault, endRound1, type Gates } from "@/api/gates";
import { apiFetch } from "@/api/client";
import { CHARACTERS } from "@/data/characterLore";
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Sparkles, 
  Trophy, 
  Package, 
  Copy, 
  Check, 
  Lock, 
  Unlock, 
  Activity, 
  KeyRound, 
  RefreshCw,
  Megaphone,
  Terminal,
  Sliders,
  Search,
  AlertTriangle,
  FileText,
  Database,
  Download,
  Eye,
  RotateCcw,
  Cpu,
  Radio,
  LogOut,
  X,
  Trash2,
  Plus,
  ShieldAlert,
  EyeOff,
  Zap
} from "lucide-react";


interface AdminMember {
  display_name: string;
  role: string;
  joined_at: string;
  contribution: number;
  currentActivity: string;
}

interface AdminInventoryItem {
  bot_id: string;
  item_key: string;
  is_real: number;
  status: string;
  verified_at: string | null;
}

interface AdminTeamOverview {
  id: string;
  name: string;
  hint: string;
  join_code?: string;
  elo: number;
  created_at: string;
  members: AdminMember[];
  inventory: AdminInventoryItem[];
  solved: number;
  lastActivity: string;
}

interface ApiKeyRecord {
  id: number;
  provider: "groq" | "zen";
  masked_key: string;
  label: string | null;
  is_active: boolean;
  fail_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface ActivityEvent {
  id: string;
  type: "elo" | "solve" | "security";
  teamId: string;
  teamName: string;
  detail: string;
  timestamp: string;
}

interface SystemHealth {
  uptime: number;
  activeConnections: number;
  teamsCount: number;
  membersCount: number;
  messagesCount: number;
  solvesCount: number;
  groqConfigured: boolean;
  zenConfigured: boolean;
  nodeVersion: string;
  memoryUsageMb: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  currentTps?: number;
  peakTps?: number;
  averageTps?: number;
  totalLlmRequests?: number;
}

interface ChatLogMessage {
  id: number;
  bot_id: string;
  role: string;
  text_final: string;
  created_at: string;
}

interface ReasoningTrace {
  id: number;
  bot_id: string;
  phase: string;
  trace_json: string;
  guard_json: string;
  created_at: string;
}

interface AnnouncementItem {
  id: string;
  message: string;
  level: "info" | "warning" | "alert";
  sender?: string;
  timestamp: string;
}

const R1_BOTS = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool"] as const;

export default function AdminTeams(): React.JSX.Element {
  const [adminCode, setAdminCode] = useState<string>(() => localStorage.getItem("redline_admin_code") ?? "");
  const [authed, setAuthed] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(() => Boolean(localStorage.getItem("redline_admin_code")));
  const [authInput, setAuthInput] = useState<string>("");
  const [showAuthCode, setShowAuthCode] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const [tab, setTab] = useState<"squads" | "stream" | "broadcast" | "create" | "gates" | "diagnostics" | "settings">("squads");
  useDocumentTitle(`Console · ${tab[0]?.toUpperCase() ?? ""}${tab.slice(1)} — REDLINE Arena`);
  
  // On mount: if a stored adminCode exists, verify it with the backend
  useEffect(() => {
    const saved = localStorage.getItem("redline_admin_code") ?? "";
    if (!saved) {
      setCheckingAuth(false);
      setAuthed(false);
      return;
    }

    let active = true;
    async function verifySaved(): Promise<void> {
      try {
        const res = await apiFetch("/api/admin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-code": saved },
          body: JSON.stringify({ code: saved }),
        });
        if (!active) return;
        if (res.ok) {
          setAdminCode(saved);
          setAuthed(true);
          setAuthError("");
        } else {
          localStorage.removeItem("redline_admin_code");
          setAdminCode("");
          setAuthed(false);
          setAuthError("Session expired or invalid admin code. Please re-enter.");
        }
      } catch {
        if (active) {
          setAuthed(false);
          setAuthError("Could not reach arena server to verify credentials.");
        }
      } finally {
        if (active) setCheckingAuth(false);
      }
    }

    void verifySaved();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const code = authInput.trim();
    if (!code) {
      setAuthError("Please enter the Admin Access Code.");
      return;
    }

    setIsVerifying(true);
    setAuthError("");

    try {
      const res = await apiFetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": code },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        localStorage.setItem("redline_admin_code", code);
        setAdminCode(code);
        setAuthed(true);
        setAuthError("");
        setAuthInput("");
      } else {
        setAuthError("Access Denied: Invalid Admin Access Code.");
      }
    } catch {
      setAuthError("Network error: Failed to connect to server.");
    } finally {
      setIsVerifying(false);
    }
  }

  function handleLock(): void {
    localStorage.removeItem("redline_admin_code");
    sessionStorage.removeItem("redline_settings_pin");
    setAdminCode("");
    setAuthed(false);
    setSettingsUnlocked(false);
    setAuthInput("");
    setAuthError("");
  }

  // API Settings State (PIN Protected)
  const [settingsUnlocked, setSettingsUnlocked] = useState(() => Boolean(sessionStorage.getItem("redline_settings_pin")));
  const [settingsPin, setSettingsPin] = useState(() => sessionStorage.getItem("redline_settings_pin") ?? "");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [keysList, setKeysList] = useState<ApiKeyRecord[]>([]);
  const [envFallbacks, setEnvFallbacks] = useState<{ groqConfigured: boolean; zenConfigured: boolean }>({ groqConfigured: true, zenConfigured: true });
  const [newKeyProvider, setNewKeyProvider] = useState<"groq" | "zen">("groq");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [keysLoading, setKeysLoading] = useState(false);

  // Data State
  const [teams, setTeams] = useState<AdminTeamOverview[]>([]);
  const [gates, setGates] = useState<Gates | null>(null);
  const [activityStream, setActivityStream] = useState<ActivityEvent[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Registration Form State
  const [name, setName] = useState("");
  const [memberInputs, setMemberInputs] = useState<string[]>(["", ""]);
  const [created, setCreated] = useState<CreateTeamResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Broadcast Form State
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastLevel, setBroadcastLevel] = useState<"info" | "warning" | "alert">("info");
  const [broadcastSender, setBroadcastSender] = useState("ARENA MARSHAL");

  // Modal States
  const [eloModalTeam, setEloModalTeam] = useState<AdminTeamOverview | null>(null);
  const [eloDelta, setEloDelta] = useState<number>(50);
  const [eloReason, setEloReason] = useState<string>("Creative Social Engineering Exploit");

  const [invModalTeam, setInvModalTeam] = useState<AdminTeamOverview | null>(null);

  const [commsModalTeam, setCommsModalTeam] = useState<AdminTeamOverview | null>(null);
  const [commsBotFilter, setCommsBotFilter] = useState<string>("all");
  const [commsTab, setCommsTab] = useState<"messages" | "traces">("messages");
  const [commsMessages, setCommsMessages] = useState<ChatLogMessage[]>([]);
  const [commsTraces, setCommsTraces] = useState<ReasoningTrace[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  const [rewindConfirmTeam, setRewindConfirmTeam] = useState<AdminTeamOverview | null>(null);
  const [rewindBot, setRewindBot] = useState<string>("all");
  const [rewindPenalty, setRewindPenalty] = useState<number>(0);

  function notify(msg: string): void {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(""), 3500);
  }

  // Periodic polling for overview, stream, health (only active when authenticated)
  useEffect(() => {
    if (!authed || adminCode === "") return;
    localStorage.setItem("redline_admin_code", adminCode);

    let dead = false;
    async function poll(): Promise<void> {
      try {
        const headers = { "x-admin-code": adminCode };
        const [resOverview, resGates, resStream, resHealth, resAnnounce] = await Promise.all([
          apiFetch("/api/admin/overview", { headers }).catch(() => null),
          getGates().catch(() => null),
          apiFetch("/api/admin/activity-stream", { headers }).catch(() => null),
          apiFetch("/api/admin/system-health", { headers }).catch(() => null),
          apiFetch("/api/admin/announcements", { headers }).catch(() => null),
        ]);

        if (resOverview && resOverview.ok && !dead) {
          const data = (await resOverview.json()) as { teams: AdminTeamOverview[] };
          setTeams(data.teams);
          setError("");
        } else if (resOverview && resOverview.status === 401 && !dead) {
          handleLock();
          setAuthError("Session expired or Admin Code revoked.");
          return;
        }

        if (resGates && !dead) setGates(resGates);

        if (resStream && resStream.ok && !dead) {
          const data = (await resStream.json()) as { stream: ActivityEvent[] };
          setActivityStream(data.stream);
        }

        if (resHealth && resHealth.ok && !dead) {
          const data = (await resHealth.json()) as SystemHealth;
          setSystemHealth(data);
        }

        if (resAnnounce && resAnnounce.ok && !dead) {
          const data = (await resAnnounce.json()) as { announcements: AnnouncementItem[] };
          setAnnouncements(data.announcements);
        }
      } catch {
        // Keep prior state
      }
    }

    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [authed, adminCode]);

  // Load comms transcript when modal opens
  useEffect(() => {
    if (!commsModalTeam || adminCode === "") return;
    let dead = false;
    async function loadComms(): Promise<void> {
      setCommsLoading(true);
      try {
        const url = `/api/admin/transcripts?teamId=${commsModalTeam?.id}&botId=${commsBotFilter}`;
        const res = await apiFetch(url, { headers: { "x-admin-code": adminCode } });
        if (res.ok && !dead) {
          const data = (await res.json()) as { messages: ChatLogMessage[]; traces: ReasoningTrace[] };
          setCommsMessages(data.messages);
          setCommsTraces(data.traces);
        }
      } catch {
        // ignore
      } finally {
        if (!dead) setCommsLoading(false);
      }
    }
    void loadComms();
    return () => { dead = true; };
  }, [commsModalTeam, commsBotFilter, adminCode]);

  // Settings API Handlers
  const fetchKeys = async (pinOverride?: string): Promise<void> => {
    const pin = pinOverride ?? settingsPin;
    if (!pin || adminCode === "") return;
    setKeysLoading(true);
    try {
      const res = await apiFetch("/api/admin/keys", {
        headers: { "x-admin-code": adminCode, "x-settings-pin": pin },
      });
      if (res.ok) {
        const data = (await res.json()) as { keys: ApiKeyRecord[]; envFallbacks: { groqConfigured: boolean; zenConfigured: boolean } };
        setKeysList(data.keys);
        setEnvFallbacks(data.envFallbacks);
      }
    } catch {
      // ignore
    } finally {
      setKeysLoading(false);
    }
  };

  useEffect(() => {
    if (settingsUnlocked && settingsPin) {
      void fetchKeys();
    }
  }, [settingsUnlocked, settingsPin, adminCode]);

  async function handleUnlockSettings(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPinError("");
    try {
      const res = await apiFetch("/api/admin/settings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) {
        sessionStorage.setItem("redline_settings_pin", pinInput);
        setSettingsPin(pinInput);
        setSettingsUnlocked(true);
        void fetchKeys(pinInput);
        notify("Settings unlocked!");
      } else {
        setPinError("Invalid Settings PIN");
      }
    } catch {
      setPinError("Failed to verify PIN");
    }
  }

  function handleLockSettings(): void {
    sessionStorage.removeItem("redline_settings_pin");
    setSettingsPin("");
    setSettingsUnlocked(false);
    setPinInput("");
    notify("API Settings locked.");
  }

  async function handleAddKey(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!newKeyValue.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-code": adminCode,
          "x-settings-pin": settingsPin,
        },
        body: JSON.stringify({
          provider: newKeyProvider,
          keyValue: newKeyValue.trim(),
          label: newKeyLabel.trim() || undefined,
        }),
      });
      if (res.ok) {
        notify(`Added ${newKeyProvider.toUpperCase()} API key to pool`);
        setNewKeyValue("");
        setNewKeyLabel("");
        void fetchKeys();
      } else {
        const d = (await res.json()) as { error?: string };
        alert(d.error ?? "Failed to add API key");
      }
    } catch {
      alert("Failed to add API key");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteKey(id: number): Promise<void> {
    if (!confirm("Are you sure you want to remove this key from the pool?")) return;
    try {
      const res = await apiFetch(`/api/admin/keys/${id}`, {
        method: "DELETE",
        headers: { "x-admin-code": adminCode, "x-settings-pin": settingsPin },
      });
      if (res.ok) {
        notify("Key removed from pool");
        void fetchKeys();
      }
    } catch {
      alert("Failed to delete key");
    }
  }

  async function handleToggleKey(id: number): Promise<void> {
    try {
      const res = await apiFetch(`/api/admin/keys/${id}/toggle`, {
        method: "PATCH",
        headers: { "x-admin-code": adminCode, "x-settings-pin": settingsPin },
      });
      if (res.ok) {
        const data = (await res.json()) as { is_active: boolean };
        notify(`Key ${data.is_active ? "activated" : "deactivated"}`);
        void fetchKeys();
      }
    } catch {
      alert("Failed to toggle key status");
    }
  }

  // Member input helpers (min 2, max 3)
  function handleMemberChange(index: number, val: string): void {
    setMemberInputs((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  }

  function handleAddMember(): void {
    if (memberInputs.length < 3) {
      setMemberInputs((prev) => [...prev, ""]);
    }
  }

  function handleRemoveMember(index: number): void {
    if (memberInputs.length > 2) {
      setMemberInputs((prev) => prev.filter((_, i) => i !== index));
    }
  }

  // Handle Team Creation
  async function handleCreateTeam(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    setCopied(false);
    try {
      const members = memberInputs
        .map((m) => m.trim())
        .filter((m) => m !== "");
      if (members.length < 2 || members.length > 3) {
        setError("Need 2 to 3 valid operator names.");
        setBusy(false);
        return;
      }
      const res = await createTeam(adminCode, name.trim(), members);
      setCreated(res);
      setName("");
      setMemberInputs(["", ""]);
      notify(`Team ${res.name} enrolled with join code: ${res.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create team failed");
    } finally {
      setBusy(false);
    }
  }

  // Handle ELO Adjust
  async function handleApplyElo(): Promise<void> {
    if (!eloModalTeam || adminCode === "") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/elo-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ teamId: eloModalTeam.id, delta: eloDelta, reason: eloReason }),
      });
      if (res.ok) {
        const data = (await res.json()) as { after?: number };
        const newElo = typeof data.after === "number" ? data.after : eloModalTeam.elo + eloDelta;
        notify(`Adjusted ${eloModalTeam.name} ELO by ${eloDelta > 0 ? "+" : ""}${eloDelta}`);
        setTeams((prev) =>
          prev.map((t) => (t.id === eloModalTeam.id ? { ...t, elo: newElo } : t))
        );
        setEloModalTeam(null);
      } else {
        const d = (await res.json()) as { error?: string };
        alert(d.error ?? "Failed to adjust ELO");
      }
    } catch {
      alert("Network error adjusting ELO");
    } finally {
      setBusy(false);
    }
  }

  // Handle Inventory Status Override
  async function handleInventoryOverride(botId: string, itemKey: string, status: string): Promise<void> {
    if (!invModalTeam || adminCode === "") return;
    try {
      const res = await apiFetch("/api/admin/inventory-override", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ teamId: invModalTeam.id, botId, itemKey, status }),
      });
      if (res.ok) {
        notify(`Updated ${itemKey} status to ${status}`);
        // Refresh local team view
        setTeams((prev) =>
          prev.map((t) => {
            if (t.id !== invModalTeam.id) return t;
            const newInv = [...t.inventory.filter((i) => i.bot_id !== botId), {
              bot_id: botId,
              item_key: itemKey,
              is_real: 1,
              status,
              verified_at: status === "verified" ? new Date().toISOString() : null,
            }];
            return { ...t, inventory: newInv, solved: newInv.filter((i) => i.status === "verified").length };
          })
        );
      }
    } catch {
      alert("Failed to update inventory relic");
    }
  }

  // Handle Team Rewind
  async function handleRewind(): Promise<void> {
    if (!rewindConfirmTeam || adminCode === "") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/team-rewind", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({
          teamId: rewindConfirmTeam.id,
          botId: rewindBot === "all" ? undefined : rewindBot,
          penalty: rewindPenalty,
        }),
      });
      if (res.ok) {
        notify(`Rewound context for ${rewindConfirmTeam.name} (${rewindBot})`);
        setRewindConfirmTeam(null);
      }
    } catch {
      alert("Rewind failed");
    } finally {
      setBusy(false);
    }
  }
  // Handle Team Reset (admin-only): permanently removes team + members + related data.
  async function handleResetTeam(team: AdminTeamOverview): Promise<void> {
    if (adminCode === "") return;
    const code = team.join_code || team.hint;
    if (!window.confirm(`Permanently reset squad "${team.name}" (${code})? This removes the team, its operators, and all related game data. This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/admin/teams/${team.id}`, {
        method: "DELETE",
        headers: { "x-admin-code": adminCode },
      });
      if (res.ok) {
        notify(`Squad ${team.name} (${code}) has been reset and removed.`);
        setTeams((prev) => prev.filter((x) => x.id !== team.id));
      } else {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(d?.error ?? "Failed to reset squad");
      }
    } catch {
      alert("Failed to reset squad");
    } finally {
      setBusy(false);
    }
  }

  // Handle Global Announcement Broadcast
  async function handleSendBroadcast(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (broadcastMsg.trim() === "" || adminCode === "") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({
          message: broadcastMsg.trim(),
          level: broadcastLevel,
          sender: broadcastSender.trim() || "ARENA MARSHAL",
        }),
      });
      if (res.ok) {
        notify("Global announcement broadcasted to all active operator consoles!");
        setBroadcastMsg("");
      }
    } catch {
      alert("Broadcast failed");
    } finally {
      setBusy(false);
    }
  }

  // Handle Instant DB Backup
  async function handleBackup(): Promise<void> {
    if (adminCode === "") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/backup", {
        method: "POST",
        headers: { "x-admin-code": adminCode },
      });
      if (res.ok) {
        const data = (await res.json()) as { file: string };
        notify(`Backup snapshot created: ${data.file}`);
      }
    } catch {
      alert("Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Filter squads by search query
  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return teams;
    const q = searchQuery.toLowerCase();
    return teams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q)
    );
  }, [teams, searchQuery]);

  const totalMembers = teams.reduce((acc, t) => acc + t.members.length, 0);
  const totalSolves = teams.reduce((acc, t) => acc + t.solved, 0);
  const highestElo = teams.length > 0 ? Math.max(...teams.map((t) => t.elo)) : 1200;

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-0)] text-[var(--color-text-2)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center w-16 h-16 rounded-[8px] bg-[var(--color-text-1)]/20 border border-[var(--color-border-strong)]">
            <ShieldCheck className="w-8 h-8 text-[var(--color-brass)] animate-pulse" />
          </div>
          <p className="text-[13px] font-mono text-[var(--color-text-faint)] tracking-wider">
            VERIFYING COMMAND CREDENTIALS...
          </p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="dark-cinematic flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg-0)] p-4">
        <div className="w-full max-w-[440px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-[8px] border border-[var(--color-border-strong)]">
              <Lock className="h-6 w-6 text-[var(--color-brass)]" />
            </span>
            <p className="mb-2 font-[family-name:var(--font-code)] text-[11px] tracking-[0.2em] text-[var(--color-text-3)]">
              ORGANIZER ONLY
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)]">
              Command
            </h1>
            <p className="mt-1 max-w-[320px] text-[13px] text-[var(--color-text-3)]">
              Squads, scores, and round controls.
            </p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center justify-between text-[12px] font-semibold text-[var(--color-text-2)]">
                <span>Access code</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--color-text-3)]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showAuthCode ? "text" : "password"}
                  value={authInput}
                  onChange={(e) => {
                    setAuthInput(e.target.value);
                    if (authError) setAuthError("");
                  }}
                  autoFocus
                  placeholder="Code"
                  aria-label="Admin access code"
                  className="h-12 w-full rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] pl-10 pr-11 font-[family-name:var(--font-code)] text-[14px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-brass)] focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthCode(!showAuthCode)}
                  tabIndex={-1}
                  aria-label={showAuthCode ? "Hide code" : "Show code"}
                  className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center pr-3.5 text-[var(--color-text-3)] transition"
                >
                  {showAuthCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="flex items-center gap-2 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--color-seal)]">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !authInput.trim()}
              className="mt-2 flex h-12 min-h-[48px] w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--color-text-1)] text-[14px] font-semibold text-[var(--color-bg-0)] hover:opacity-90 disabled:opacity-50 transition"
            >
              {isVerifying ? (
                <span>Checking</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sign in</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center border-t border-[var(--color-border)] pt-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Back to arena</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-0)] text-[var(--color-text-1)]">
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] px-4 py-3 text-[14px] font-semibold text-[var(--color-moss)]">
          <Check className="w-5 h-5" />
          <span>{successToast}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-6 py-3.5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="block h-8 w-[3px] bg-[var(--color-brass)]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-[family-name:var(--font-display)] text-[20px] font-bold tracking-[0.08em] leading-tight text-[var(--color-text-1)]">
                COMMAND
              </h1>
              <span className="flex items-center gap-1 rounded-[6px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-moss)]">
                <Radio className="w-3 h-3" />
                <span>Live</span>
              </span>
            </div>
            <p className="text-[12px] text-[var(--color-text-3)]">
              Squads, scores, and round controls
            </p>
          </div>
        </div>

        {/* System Health Quick Strip & Auth controls */}
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          {systemHealth && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[12px] font-bold text-[var(--color-text-2)]">
              <span className="flex items-center gap-1 text-[var(--color-moss)]">
                <span className="w-2 h-2 rounded-full bg-[var(--color-moss)] animate-ping" />
                <span>{systemHealth.activeConnections} Clients Online</span>
              </span>
              <span>•</span>
              <span className="text-[var(--color-brass)]">Groq & Zen OK</span>
            </div>
          )}

          {/* Admin Authorized Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[var(--color-moss-wash)] border border-[var(--color-moss-border)] text-[var(--color-moss)] text-[12px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-moss)]" />
            <span className="hidden sm:inline">Admin Authorized</span>
            <span className="sm:hidden">Authorized</span>
          </div>

          {/* Lock HQ Button */}
          <button
            type="button"
            onClick={handleLock}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]   text-[var(--color-text-2)] text-[12px] font-bold transition cursor-pointer "
            title="Lock Admin Session and Require Access Code"
          >
            <Lock className="w-3.5 h-3.5 text-[var(--color-text-3)]" />
            <span>Lock HQ</span>
          </button>

          {/* Exit HQ Button */}
          <a
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] text-[12px] font-bold transition "
            title="Exit to Arena"
          >
            <LogOut className="w-3.5 h-3.5 text-[var(--color-text-3)]" />
            <span className="hidden sm:inline">Exit</span>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("squads")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "squads"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Squads & Controls ({teams.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("stream")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "stream"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Activity Feed ({activityStream.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("broadcast")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "broadcast"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <Megaphone className="w-4 h-4" />
              <span>Global Broadcast</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("create")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "create"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Register Squad</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("gates")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "gates"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Gates & Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("diagnostics")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "diagnostics"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Diagnostics & Exports</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`flex items-center gap-2 px-4 py-2 rounded-[6px] text-[14px] font-bold transition cursor-pointer ${
                tab === "settings"
                  ? "bg-[var(--color-text-1)] text-white "
                  : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <KeyRound className="w-4 h-4 text-[var(--color-brass)]" />
              <span>API Settings {settingsUnlocked ? "🔓" : "🔒"}</span>
            </button>
          </div>

          {/* Projector Board Link */}
          <a
            href="/admin/board"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)] text-[13px] font-bold hover:bg-[var(--color-surface-2)] transition "
          >
            <Trophy className="w-4 h-4 text-[var(--color-brass)]" />
            <span>Clocktower Citadel Board ↗</span>
          </a>
        </div>

        {/* Global Key Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
            <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-wider">Enrolled Squads</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-[family-name:var(--font-display)] text-[26px] font-bold text-[var(--color-text-1)]">{teams.length}</span>
              <Users className="w-5 h-5 text-[var(--color-brass)] opacity-60" />
            </div>
          </div>

          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
            <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-wider">Operators</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-[family-name:var(--font-display)] text-[26px] font-bold text-[var(--color-text-1)]">{totalMembers}</span>
              <Activity className="w-5 h-5 text-[var(--color-moss)] opacity-60" />
            </div>
          </div>

          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
            <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-wider">Relic Solves</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-[family-name:var(--font-display)] text-[26px] font-bold text-[var(--color-text-1)]">{totalSolves}</span>
              <ShieldCheck className="w-5 h-5 text-[var(--color-brass)] opacity-60" />
            </div>
          </div>

          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]">
            <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-wider">Peak ELO</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-[family-name:var(--font-display)] text-[26px] font-bold text-[var(--color-text-1)]">{highestElo}</span>
              <Trophy className="w-5 h-5 text-yellow-500 opacity-60" />
            </div>
          </div>

          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]" title={`Prompt: ${(systemHealth?.promptTokens ?? 0).toLocaleString()} | Completion: ${(systemHealth?.completionTokens ?? 0).toLocaleString()}`}>
            <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-wider">Total Tokens</span>
            <div className="mt-1 flex items-center justify-between">
              <div>
                <span className="font-[family-name:var(--font-code)] text-[24px] font-bold text-[var(--color-text-1)]">
                  {(systemHealth?.totalTokens ?? 0) >= 1_000_000
                    ? `${((systemHealth?.totalTokens ?? 0) / 1_000_000).toFixed(2)}M`
                    : (systemHealth?.totalTokens ?? 0) >= 10_000
                    ? `${((systemHealth?.totalTokens ?? 0) / 1_000).toFixed(1)}k`
                    : (systemHealth?.totalTokens ?? 0).toLocaleString()}
                </span>
                <span className="block text-[10px] text-[var(--color-text-3)] font-medium">
                  {((systemHealth?.promptTokens ?? 0) / 1000).toFixed(1)}k in · {((systemHealth?.completionTokens ?? 0) / 1000).toFixed(1)}k out
                </span>
              </div>
              <Cpu className="w-5 h-5 text-[var(--color-brass)] opacity-60" />
            </div>
          </div>

          <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]" title={`Current: ${systemHealth?.currentTps ?? 0} tps | Peak: ${systemHealth?.peakTps ?? 0} tps | Avg: ${systemHealth?.averageTps ?? 0} tps`}>
            <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-wider">Speed (TPS)</span>
            <div className="mt-1 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-[family-name:var(--font-code)] text-[24px] font-bold text-[var(--color-text-1)]">
                    {systemHealth?.currentTps ?? 0}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--color-text-3)] font-[family-name:var(--font-code)]">
                    TPS
                  </span>
                  <span className={`inline-block h-2 w-2 rounded-full ${(systemHealth?.currentTps ?? 0) > 0 ? "bg-[var(--color-moss)] animate-pulse" : "bg-[var(--color-text-faint)]"}`} />
                </div>
                <span className="block text-[10px] text-[var(--color-text-3)] font-medium">
                  Peak: {systemHealth?.peakTps ?? 0} tps
                </span>
              </div>
              <Zap className="w-5 h-5 text-amber-500 opacity-60" />
            </div>
          </div>
        </div>

        {/* TAB 1: SQUADS & DIRECT COMMAND CONTROLS */}
        {tab === "squads" && (
          <div className="flex flex-col gap-5">
            {/* Search filter */}
            <div className="flex items-center gap-3 p-2 px-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  max-w-[420px]">
              <Search className="w-4 h-4 text-[var(--color-text-faint)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search squad by name or hint code..."
                className="w-full bg-transparent text-[14px] focus:outline-none text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] font-medium"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="text-[var(--color-text-faint)] hover:text-[var(--color-text-2)] text-[12px] cursor-pointer">
                  Clear
                </button>
              )}
            </div>

            {filteredTeams.length === 0 ? (
              <div className="p-12 text-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-faint)]">
                <Users className="w-12 h-12 mb-3 mx-auto opacity-40 text-[var(--color-text-3)]" />
                <p className="font-bold text-[18px] text-[var(--color-text-2)]">No squads match your query</p>
                <p className="text-[14px] mt-1">Check the search term or use the "Register Squad" tab.</p>
              </div>
            ) : (
              filteredTeams.map((t) => (
                <div key={t.id} className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6  flex flex-col gap-5 transition ">
                  {/* Top Team Header Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 rounded-[8px] bg-[var(--color-brass-wash)] border border-[var(--color-border)] text-[var(--color-brass-ink)] font-bold text-[18px]">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-[family-name:var(--font-display)] text-[20px] font-bold text-[var(--color-text-1)]">
                            {t.name}
                          </h3>
                          {/* Full Confidential Join Code with 1-Click Copy */}
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-[6px] bg-[var(--color-moss-wash)] border border-[var(--color-moss-border)] text-[var(--color-moss)] font-[family-name:var(--font-code)] ">
                            <KeyRound className="w-3.5 h-3.5 text-[var(--color-moss)] shrink-0" />
                            <span className="text-[11px] font-bold uppercase text-[var(--color-moss)]">Code:</span>
                            <span className="text-[14px] font-bold tracking-widest text-[var(--color-moss)] select-all">
                              {t.join_code || t.hint}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyCode(t.join_code || t.hint)}
                              className="p-1 hover:bg-[var(--color-surface-2)]/60 rounded text-[var(--color-moss)] cursor-pointer ml-0.5 transition"
                              title="Copy full join code"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[12px] text-[var(--color-text-3)]">
                          Enrolled: {t.created_at.slice(0, 10)} • Solved: {t.solved}/8 marks ({Math.round((t.solved / 8) * 100)}%)
                        </p>
                      </div>
                    </div>

                    {/* Stats & Quick Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right mr-2">
                        <span className="text-[11px] font-bold uppercase text-[var(--color-text-faint)] block">ELO Rating</span>
                        <span className="font-[family-name:var(--font-code)] text-[22px] font-bold text-[var(--color-brass)]">
                          {t.elo}
                        </span>
                      </div>

                      {/* Power Controls Button Group */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEloModalTeam(t);
                            setEloDelta(50);
                            setEloReason("Creative Social Engineering Exploit");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-brass-wash)] hover:bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)] text-[12px] font-bold transition cursor-pointer"
                          title="Adjust team ELO score"
                        >
                          <Sliders className="w-3.5 h-3.5 text-[var(--color-brass)]" />
                          <span>Adjust ELO</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInvModalTeam(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] hover:bg-[var(--color-surface-2)] text-[var(--color-brass-ink)] text-[12px] font-bold transition cursor-pointer"
                          title="Inspect & override backpack relics"
                        >
                          <Package className="w-3.5 h-3.5 text-[var(--color-brass)]" />
                          <span>Relic Override</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCommsModalTeam(t);
                            setCommsBotFilter("all");
                            setCommsTab("messages");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-1)] text-[12px] font-bold transition cursor-pointer"
                          title="Inspect chat messages and hidden AI reasoning traces"
                        >
                          <Eye className="w-3.5 h-3.5 text-[var(--color-brass)]" />
                          <span>Inspect Comms</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRewindConfirmTeam(t);
                            setRewindBot("all");
                            setRewindPenalty(0);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] hover:bg-[var(--color-surface-2)] text-[var(--color-seal)] text-[12px] font-bold transition cursor-pointer"
                          title="Force rewind conversation context"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[var(--color-seal)]" />
                          <span>Rewind</span>
                        </button>
                        {(t.id === "GW3Z-ABTF" || t.join_code === "GW3Z-ABTF" || t.hint === "GW3Z-ABTF") && (
                          <button
                            type="button"
                            onClick={() => void handleResetTeam(t)}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] hover:bg-[var(--color-surface-2)] text-[var(--color-seal)] text-[12px] font-bold transition cursor-pointer disabled:opacity-50"
                            title="Permanently reset this squad (remove team, operators, and game data)"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[var(--color-seal)]" />
                            <span>Reset Team</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Two Columns: Member Activity vs Held Inventory */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Member Contributions & Activity */}
                    <div className="lg:col-span-7 flex flex-col gap-2.5">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-2)]">
                        Squad Operators & Real-Time Activity:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {t.members.map((m) => (
                          <div key={m.display_name} className="p-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]/80 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[14px] text-[var(--color-text-1)]">{m.display_name}</span>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)] font-[family-name:var(--font-code)]">
                                {m.contribution} msgs
                              </span>
                            </div>
                            <p className="mt-2 text-[12px] text-[var(--color-text-2)] flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[var(--color-moss)] animate-pulse shrink-0" />
                              <span className="truncate">{m.currentActivity}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Team Inventory Grid */}
                    <div className="lg:col-span-5 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-2)]">
                          Held Relics ({t.inventory.length}/8):
                        </span>
                        <span className="text-[11px] font-bold text-[var(--color-moss)]">
                          {t.solved} Verified Solved
                        </span>
                      </div>

                      <div className="p-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 min-h-[100px] flex flex-wrap gap-2 items-center">
                        {t.inventory.length === 0 ? (
                          <p className="text-[12px] text-[var(--color-text-faint)] italic mx-auto">No items in backpack yet</p>
                        ) : (
                          t.inventory.map((item, idx) => {
                            const char = CHARACTERS[item.bot_id as keyof typeof CHARACTERS];
                            const isVerified = item.status === "verified";
                            return (
                              <div
                                key={idx}
                                title={`${item.item_key} (${item.status})`}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border text-[12px] font-semibold ${
                                  isVerified
                                    ? "bg-[var(--color-moss-wash)] border-[var(--color-moss-border)] text-[var(--color-moss)] "
                                    : "bg-[var(--color-brass-wash)] border-[var(--color-border-strong)] text-[var(--color-brass-ink)] "
                                }`}
                              >
                                <div className="w-5 h-5 rounded-md overflow-hidden bg-[var(--color-surface-3)] shrink-0 border border-[var(--color-border)]">
                                  {char?.avatar && (
                                    <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                                  )}
                                </div>
                                {isVerified ? (
                                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-moss)] shrink-0" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-[var(--color-brass)] shrink-0" />
                                )}
                                <span>{char?.targetItem.name ?? item.item_key}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: LIVE MISSION STREAM */}
        {tab === "stream" && (
          <div className="flex flex-col gap-4 max-w-[900px] mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)]">
                  Live Arena Mission Feed
                </h2>
                <p className="text-[13px] text-[var(--color-text-3)]">
                  Real-time chronological audit trail of all solves, ELO modifications, and deterrence flags.
                </p>
              </div>
              <span className="px-3 py-1 rounded-[6px] bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)] font-[family-name:var(--font-code)] text-[12px] font-bold">
                Auto-updates every 3s
              </span>
            </div>

            <div className="flex flex-col gap-2.5 mt-2">
              {activityStream.length === 0 ? (
                <div className="p-10 text-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-faint)]">
                  No arena events recorded yet.
                </div>
              ) : (
                activityStream.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3.5 px-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex items-center justify-between gap-3  transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-[6px] shrink-0 ${
                        evt.type === "solve"
                          ? "bg-[var(--color-moss-wash)] text-[var(--color-moss)]"
                          : evt.type === "security"
                          ? "bg-[var(--color-seal-wash)] text-[var(--color-seal)]"
                          : "bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]"
                      }`}>
                        {evt.type === "solve" ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : evt.type === "security" ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Trophy className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[14px] text-[var(--color-text-1)]">{evt.teamName}</span>
                          <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-2)] font-[family-name:var(--font-code)]">
                            {evt.type}
                          </span>
                        </div>
                        <p className="text-[13px] text-[var(--color-text-2)] mt-0.5">{evt.detail}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-[var(--color-text-faint)] font-[family-name:var(--font-code)] shrink-0">
                      {evt.timestamp.slice(11, 19)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: GLOBAL BROADCAST STATION */}
        {tab === "broadcast" && (
          <div className="max-w-[700px] mx-auto w-full flex flex-col gap-6">
            <div className="p-6 sm:p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-5">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)] flex items-center gap-2">
                  <Megaphone className="w-6 h-6 text-[var(--color-brass)]" />
                  <span>Global Arena Broadcast</span>
                </h2>
                <p className="text-[13px] text-[var(--color-text-3)] mt-1">
                  Push an instant visual notification banner with audio chime to all connected operator consoles.
                </p>
              </div>

              <form onSubmit={handleSendBroadcast} className="flex flex-col gap-4">
                <div>
                  <label className="text-[13px] font-bold text-[var(--color-text-2)] block mb-1.5">
                    Announcement Message:
                  </label>
                  <textarea
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="e.g. ATTENTION OPERATORS: 15 minutes remaining in Round 1! Verify all relics with the Merchant before the Vault opens."
                    rows={3}
                    className="w-full p-4 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[14px] focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[13px] font-bold text-[var(--color-text-2)] block mb-1.5">
                      Severity Level:
                    </label>
                    <select
                      value={broadcastLevel}
                      onChange={(e) => setBroadcastLevel(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[14px] font-semibold focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
                    >
                      <option value="info">Standard Info (Indigo Banner)</option>
                      <option value="warning">Urgent Notice (Amber Banner)</option>
                      <option value="alert">Emergency Flash (Crimson Banner)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[13px] font-bold text-[var(--color-text-2)] block mb-1.5">
                      Sender Tag:
                    </label>
                    <input
                      value={broadcastSender}
                      onChange={(e) => setBroadcastSender(e.target.value)}
                      placeholder="ARENA MARSHAL"
                      className="w-full h-11 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[14px] font-semibold focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || broadcastMsg.trim() === ""}
                  className="mt-2 py-3.5 px-6 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[15px]  disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span>{busy ? "Broadcasting…" : "Broadcast to All Operator Terminals"}</span>
                </button>
              </form>
            </div>

            {/* Broadcast History */}
            {announcements.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-text-2)] px-1">
                  Recent Broadcast Transmissions:
                </span>
                <div className="flex flex-col gap-2">
                  {announcements.map((a) => (
                    <div key={a.id} className="p-3 px-4 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] text-[13px] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] uppercase font-[family-name:var(--font-code)] ${
                          a.level === "alert" ? "bg-[var(--color-seal-wash)] text-[var(--color-seal)]" : a.level === "warning" ? "bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]" : "bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]"
                        }`}>
                          {a.level}
                        </span>
                        <span className="font-bold text-[var(--color-text-1)]">{a.sender || "HQ"}:</span>
                        <span className="text-[var(--color-text-2)] font-medium">{a.message}</span>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-faint)] font-[family-name:var(--font-code)] shrink-0">
                        {a.timestamp.slice(11, 19)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ENROLL NEW SQUAD */}
        {tab === "create" && (
          <div className="max-w-[560px] mx-auto w-full p-6 sm:p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-5">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)]">
                Enroll New Squad
              </h2>
              <p className="text-[13px] text-[var(--color-text-3)] mt-1">
                Generates a secure 8-character confidential code shown once. Share directly with the squad captain.
              </p>
            </div>

            <form onSubmit={handleCreateTeam} className="flex flex-col gap-4">
              <div>
                <label className="text-[13px] font-bold text-[var(--color-text-2)] block mb-1">
                  Squad Name:
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CyberVanguard"
                  className="w-full h-11 px-4 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[15px] focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[13px] font-bold text-[var(--color-text-2)]">
                    Operators ({memberInputs.length} of 3 • min 2, max 3):
                  </label>
                  {memberInputs.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddMember}
                      className="flex items-center gap-1 text-[12px] font-semibold text-[var(--color-brass)] hover:text-[var(--color-brass-ink)] bg-[var(--color-brass-wash)]/60 px-2 py-0.5 rounded-[4px] border border-[var(--color-border)] cursor-pointer transition active:scale-[0.98]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Member</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  {memberInputs.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          value={val}
                          onChange={(e) => handleMemberChange(idx, e.target.value)}
                          placeholder={`Operator ${idx + 1} name (e.g. Agent ${idx + 1})`}
                          className="w-full h-11 px-4 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[15px] focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
                        />
                      </div>
                      {memberInputs.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(idx)}
                          aria-label={`Remove Operator ${idx + 1}`}
                          title="Remove operator"
                          className="h-11 w-11 shrink-0 flex items-center justify-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-[var(--color-seal)] hover:bg-[var(--color-seal-wash)] transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-[var(--color-text-3)] mt-1.5">
                  Names can contain spaces, letters, numbers, and symbols.
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  busy ||
                  name.trim() === "" ||
                  memberInputs.filter((m) => m.trim() !== "").length < 2
                }
                className="mt-2 py-3.5 px-6 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[15px] disabled:opacity-50 transition cursor-pointer active:scale-[0.98]"
              >
                {busy ? "Registering…" : "Generate Squad Access Code"}
              </button>
            </form>

            {/* Created Code Alert */}
            {created && (
              <div className="p-6 rounded-[8px] border border-[var(--color-moss-border)] bg-[var(--color-moss-wash)]/70 text-[var(--color-moss)] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-moss)]">
                    Confidential Join Code (Shown Once):
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCode(created.code)}
                    className="flex items-center gap-1 text-[12px] font-bold text-[var(--color-moss)] hover:text-[var(--color-moss)] cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-[var(--color-moss)]" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? "Copied!" : "Copy Code"}</span>
                  </button>
                </div>

                <div className="font-[family-name:var(--font-code)] text-[32px] font-bold tracking-widest text-[var(--color-moss)] text-center py-2 bg-[var(--color-surface-1)]/80 rounded-[6px] border border-[var(--color-moss-border)]">
                  {created.code}
                </div>

                <p className="text-[13px] text-[var(--color-moss)] text-center">
                  Squad: <span className="font-bold">{created.name}</span> • Public Hint:{" "}
                  <span className="font-bold font-[family-name:var(--font-code)]">{created.hint}</span>
                </p>
              </div>
            )}

            {error && (
              <p className="text-[13px] text-[var(--color-seal)] font-medium text-center">{error}</p>
            )}
          </div>
        )}

        {/* TAB 5: GATES & VAULT PROGRESSION */}
        {tab === "gates" && (
          <div className="max-w-[620px] mx-auto w-full p-6 sm:p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-6">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)]">
                Gates & Phase Progression
              </h2>
              <p className="text-[13px] text-[var(--color-text-3)] mt-1">
                Oversee Round 1 qualification status and authorize the Round 2 Nether Vault opening.
              </p>
            </div>

            {gates && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Round 1 State</span>
                    <p className="mt-1 font-bold text-[16px] text-[var(--color-text-1)]">
                      {gates.round1Open ? "ACTIVE & ACCEPTING" : "FROZEN"}
                    </p>
                  </div>
                  <div className="p-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Vault Door</span>
                    <p className="mt-1 font-bold text-[16px] text-[var(--color-text-1)]">
                      {gates.vaultOpen ? "OPEN TO QUALIFIERS" : "SEALED"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await endRound1(adminCode);
                      setGates(await getGates());
                      notify("Round 1 submissions frozen!");
                    }}
                    className="py-3 px-4 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] hover:bg-[var(--color-surface-2)] text-[var(--color-brass-ink)] font-bold text-[14px] transition cursor-pointer"
                  >
                    Freeze / End Round 1 Submissions
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await openVault(adminCode);
                      setGates(await getGates());
                      notify("Round 2 Nether Vault unlocked!");
                    }}
                    className="py-3.5 px-4 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[15px]  transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Open Round 2 Nether Vault Door</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SYSTEM DIAGNOSTICS & EXPORTS */}
        {tab === "diagnostics" && (
          <div className="max-w-[800px] mx-auto w-full flex flex-col gap-6">
            {systemHealth && (
              <div className="p-6 sm:p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-5">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)] flex items-center gap-2">
                    <Cpu className="w-6 h-6 text-[var(--color-brass)]" />
                    <span>System Diagnostics & LLM Status</span>
                  </h2>
                  <p className="text-[13px] text-[var(--color-text-3)] mt-1">
                    Single-process LAN runtime status, model connectivity, and SQLite storage statistics.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Server Uptime</span>
                    <p className="text-[16px] font-bold text-[var(--color-text-1)] mt-0.5">
                      {Math.floor(systemHealth.uptime / 60)}m {systemHealth.uptime % 60}s
                    </p>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">RAM Footprint</span>
                    <p className="text-[16px] font-bold text-[var(--color-text-1)] mt-0.5">{systemHealth.memoryUsageMb} MB</p>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Active Sockets</span>
                    <p className="text-[16px] font-bold text-[var(--color-moss)] mt-0.5">{systemHealth.activeConnections} WS Clients</p>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Groq Cloud (R1)</span>
                    <p className="text-[16px] font-bold text-[var(--color-moss)] mt-0.5">Connected & Ready</p>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">OpenCode Zen (R2)</span>
                    <p className="text-[16px] font-bold text-[var(--color-moss)] mt-0.5">Connected & Ready</p>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Chat Logs Total</span>
                    <p className="text-[16px] font-bold text-[var(--color-text-1)] mt-0.5">{systemHealth.messagesCount} msgs</p>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">Total Tokens</span>
                    <p className="text-[16px] font-bold text-[var(--color-text-1)] mt-0.5 font-[family-name:var(--font-code)]">
                      {(systemHealth.totalTokens ?? 0).toLocaleString()}
                    </p>
                    <span className="text-[11px] text-[var(--color-text-3)]">
                      {(systemHealth.promptTokens ?? 0).toLocaleString()} in / {(systemHealth.completionTokens ?? 0).toLocaleString()} out
                    </span>
                  </div>
                  <div className="p-3.5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
                    <span className="text-[11px] font-bold text-[var(--color-text-3)] uppercase">LLM Speed & Throughput</span>
                    <p className="text-[16px] font-bold text-[var(--color-text-1)] mt-0.5 font-[family-name:var(--font-code)]">
                      {systemHealth.currentTps ?? 0} <span className="text-[12px] font-normal text-[var(--color-text-3)]">current</span> / {systemHealth.peakTps ?? 0} <span className="text-[12px] font-normal text-[var(--color-text-3)]">peak</span>
                    </p>
                    <span className="text-[11px] text-[var(--color-text-3)]">
                      Avg: {systemHealth.averageTps ?? 0} tps · {systemHealth.totalLlmRequests ?? 0} generations
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[13px] flex items-center gap-2 cursor-pointer "
                  >
                    <Database className="w-4 h-4" />
                    <span>Create Database Snapshot (.db)</span>
                  </button>

                  <a
                    href={`/api/admin/export.json?x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-1)] font-bold text-[13px] flex items-center gap-2 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON Dump</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=elo_log&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-1)] font-semibold text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: ELO Log</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=chat_logs&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-1)] font-semibold text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: Chat Logs</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=team_inventory&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-1)] font-semibold text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: Inventory</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: API SETTINGS & KEY ROTATION POOL (PIN LOCKED) */}
        {tab === "settings" && (
          <div className="max-w-[860px] mx-auto w-full flex flex-col gap-6">
            {!settingsUnlocked ? (
              <div className="p-8 sm:p-12 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col items-center text-center max-w-[500px] mx-auto">
                <div className="w-16 h-16 rounded-[8px] bg-[var(--color-brass-wash)] border border-[var(--color-border-strong)] text-[var(--color-brass)] flex items-center justify-center mb-4 ">
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-[24px] font-bold text-[var(--color-text-1)]">
                  API Settings Locked
                </h2>
                <p className="text-[13px] text-[var(--color-text-3)] mt-1 max-w-[38ch]">
                  Enter the confidential <code className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] font-bold text-[var(--color-text-1)]">ADMIN_SETTINGS_PIN</code> configured in your environment to manage multi-API rotation pools.
                </p>

                <form onSubmit={handleUnlockSettings} className="mt-6 flex flex-col gap-3 w-full">
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[var(--color-text-faint)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="Enter Settings PIN"
                      autoFocus
                      className="w-full h-11 pl-10 pr-4 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[14px] font-[family-name:var(--font-code)] focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
                    />
                  </div>

                  {pinError && (
                    <p className="text-[12px] text-[var(--color-seal)] font-semibold">{pinError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!pinInput.trim()}
                    className="mt-1 h-11 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[14px]  disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Unlock API Configuration</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Header & Lock Button */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-6 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] ">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)]">
                        Multi-API Key Rotation Engine
                      </h2>
                      <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-moss-wash)] text-[var(--color-moss)] font-bold text-[11px] uppercase tracking-wider">
                        Active & Unlocked
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--color-text-3)] mt-1">
                      Configure secondary keys for Groq & OpenCode Zen. When a key is rate-limited (429) or fails, the server automatically rotates to the next key. Fallback keys from .env remain active.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchKeys()}
                      disabled={keysLoading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] text-[12px] font-bold transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${keysLoading ? "animate-spin text-[var(--color-brass)]" : ""}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLockSettings}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] hover:bg-[var(--color-surface-2)] text-[var(--color-seal)] text-[12px] font-bold transition cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Lock Settings</span>
                    </button>
                  </div>
                </div>

                {/* Provider Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Groq Pool Card */}
                  <div className="p-5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[var(--color-surface-2)]0" />
                        <h3 className="font-bold text-[16px] text-[var(--color-text-1)]">Groq Cloud (Round 1)</h3>
                      </div>
                      <span className="text-[11px] font-[family-name:var(--font-code)] font-bold px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-2)]">
                        qwen/qwen3.8-27b
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--color-text-3)]">
                      Powers all 8 Round 1 AI characters (John Wick, Spider-Man, Escanor, Stark, etc.)
                    </p>
                    <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-text-2)] font-medium">Rotation Pool:</span>
                      <span className="font-bold text-[var(--color-text-1)]">
                        {keysList.filter((k) => k.provider === "groq" && k.is_active).length} Custom Active + .env Fallback
                      </span>
                    </div>
                  </div>

                  {/* OpenCode Zen Pool Card */}
                  <div className="p-5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[var(--color-surface-2)]0" />
                        <h3 className="font-bold text-[16px] text-[var(--color-text-1)]">OpenCode Zen (Round 2)</h3>
                      </div>
                      <span className="text-[11px] font-[family-name:var(--font-code)] font-bold px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-2)]">
                        muse-spark-1.3
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--color-text-3)]">
                      Powers Nether Vault Bosses (Itachi Uchiha & Sosuke Aizen) with server reasoning traces
                    </p>
                    <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-text-2)] font-medium">Rotation Pool:</span>
                      <span className="font-bold text-[var(--color-text-1)]">
                        {keysList.filter((k) => k.provider === "zen" && k.is_active).length} Custom Active + .env Fallback
                      </span>
                    </div>
                  </div>
                </div>

                {/* Add New Key Form */}
                <div className="p-6 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-4">
                  <h3 className="font-bold text-[16px] text-[var(--color-text-1)] flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[var(--color-brass)]" />
                    <span>Add New API Key to Rotation Pool</span>
                  </h3>

                  <form onSubmit={handleAddKey} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-[var(--color-text-2)] uppercase tracking-wider block mb-1">
                        Provider:
                      </label>
                      <select
                        value={newKeyProvider}
                        onChange={(e) => setNewKeyProvider(e.target.value as "groq" | "zen")}
                        className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[13px] font-semibold focus:bg-[var(--color-surface-1)] focus:outline-none"
                      >
                        <option value="groq">Groq (Round 1)</option>
                        <option value="zen">OpenCode Zen (Round 2)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-5">
                      <label className="text-[11px] font-bold text-[var(--color-text-2)] uppercase tracking-wider block mb-1">
                        API Key Value:
                      </label>
                      <input
                        type="password"
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder="gsk_... or sk-pw..."
                        className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[13px] font-[family-name:var(--font-code)] focus:bg-[var(--color-surface-1)] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-[var(--color-text-2)] uppercase tracking-wider block mb-1">
                        Label (Optional):
                      </label>
                      <input
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        placeholder="Backup Key 2"
                        className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[13px] focus:bg-[var(--color-surface-1)] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={busy || !newKeyValue.trim()}
                        className="w-full h-10 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[13px]  disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Key</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Keys Pool List */}
                <div className="p-6 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)]  flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-[16px] text-[var(--color-text-1)]">
                      Configured Keys ({keysList.length + 2} in Pool)
                    </h3>
                    <span className="text-[12px] text-[var(--color-text-3)]">
                      Sorted by lowest fail count
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {/* Permanent Fallback Key: Groq */}
                    <div className="p-3.5 px-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] text-[11px] font-bold uppercase">
                          Groq
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-[family-name:var(--font-code)] text-[13px] font-bold text-[var(--color-text-1)]">
                              System Fallback Key (.env)
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[var(--color-moss-wash)] text-[var(--color-moss)] text-[10px] font-bold uppercase">
                              Always Active
                            </span>
                          </div>
                          <span className="text-[11px] text-[var(--color-text-3)]">Primary server environment variable fallback</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-[var(--color-moss)]">Built-in Fallback</span>
                    </div>

                    {/* Permanent Fallback Key: Zen */}
                    <div className="p-3.5 px-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-2)] text-[11px] font-bold uppercase">
                          Zen
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-[family-name:var(--font-code)] text-[13px] font-bold text-[var(--color-text-1)]">
                              System Fallback Key (.env)
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[var(--color-moss-wash)] text-[var(--color-moss)] text-[10px] font-bold uppercase">
                              Always Active
                            </span>
                          </div>
                          <span className="text-[11px] text-[var(--color-text-3)]">Primary server environment variable fallback</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-[var(--color-moss)]">Built-in Fallback</span>
                    </div>

                    {/* Custom Keys */}
                    {keysList.map((k) => (
                      <div
                        key={k.id}
                        className="p-3.5 px-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border)]  flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase ${
                            k.provider === "groq" ? "bg-[var(--color-surface-2)] text-[var(--color-text-2)]" : "bg-[var(--color-surface-2)] text-[var(--color-text-2)]"
                          }`}>
                            {k.provider}
                          </span>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-[family-name:var(--font-code)] text-[14px] font-bold text-[var(--color-text-1)]">
                                {k.masked_key}
                              </span>
                              {k.label && (
                                <span className="text-[12px] font-semibold text-[var(--color-text-2)]">
                                  ({k.label})
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                k.is_active ? "bg-[var(--color-moss-wash)] text-[var(--color-moss)]" : "bg-[var(--color-surface-2)] text-[var(--color-text-2)]"
                              }`}>
                                {k.is_active ? "Active" : "Disabled"}
                              </span>
                              {k.fail_count > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)] text-[10px] font-bold">
                                  {k.fail_count} failures
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5 font-[family-name:var(--font-code)]">
                              Added: {k.created_at.slice(0, 10)} {k.last_used_at ? `• Last Used: ${k.last_used_at.slice(11, 19)}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleKey(k.id)}
                            className={`px-3 py-1 rounded-[6px] text-[12px] font-bold transition cursor-pointer ${
                              k.is_active
                                ? "bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)]"
                                : "bg-[var(--color-moss-wash)] hover:bg-[var(--color-surface-2)] text-[var(--color-moss)]"
                            }`}
                          >
                            {k.is_active ? "Disable" : "Enable"}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteKey(k.id)}
                            className="p-1.5 rounded-[6px] hover:bg-[var(--color-seal-wash)] text-[var(--color-seal)] hover:text-[var(--color-seal)] transition cursor-pointer"
                            title="Delete API key"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: LIVE ELO ADJUSTER                                */}
      {/* ========================================================= */}
      {eloModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
          <div className="w-full max-w-[480px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6  flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div>
                <h3 className="text-[18px] font-bold text-[var(--color-text-1)] flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-[var(--color-brass)]" />
                  <span>Adjust ELO Rating</span>
                </h3>
                <p className="text-[12px] text-[var(--color-text-3)] font-medium">
                  Squad: <span className="font-bold text-[var(--color-text-1)]">{eloModalTeam.name}</span> • Current:{" "}
                  <span className="font-bold font-[family-name:var(--font-code)] text-[var(--color-brass)]">
                    {eloModalTeam.elo} ELO
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEloModalTeam(null)}
                className="w-8 h-8 rounded-full hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Delta Presets */}
            <div>
              <label className="text-[12px] font-bold text-[var(--color-text-2)] block mb-1.5">
                Quick Adjust Presets:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[+100, +50, +25, +10, -10, -25, -50, -100].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEloDelta(d)}
                    className={`py-1.5 rounded-[6px] font-[family-name:var(--font-code)] font-bold text-[13px] border transition cursor-pointer ${
                      eloDelta === d
                        ? "bg-[var(--color-text-1)] text-white border-[var(--color-brass)] "
                        : d > 0
                        ? "bg-[var(--color-moss-wash)] text-[var(--color-moss)] border-[var(--color-moss-border)] hover:bg-[var(--color-moss-wash)]"
                        : "bg-[var(--color-seal-wash)] text-[var(--color-seal)] border-[var(--color-seal)] hover:bg-[var(--color-surface-2)]"
                    }`}
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Delta Field */}
            <div>
              <label className="text-[12px] font-bold text-[var(--color-text-2)] block mb-1">
                Custom Delta Amount:
              </label>
              <input
                type="number"
                value={eloDelta}
                onChange={(e) => setEloDelta(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] font-[family-name:var(--font-code)] font-bold text-[15px] focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
              />
            </div>

            {/* Reason Field */}
            <div>
              <label className="text-[12px] font-bold text-[var(--color-text-2)] block mb-1">
                Adjustment Reason / Note:
              </label>
              <select
                value={eloReason}
                onChange={(e) => setEloReason(e.target.value)}
                className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[13px] font-semibold focus:bg-[var(--color-surface-1)] focus:border-[var(--color-brass)] focus:outline-none transition"
              >
                <option value="Creative Social Engineering Exploit">Creative Social Engineering Exploit</option>
                <option value="Exceptional Prompt Engineering Technique">Exceptional Prompt Engineering Technique</option>
                <option value="Organizer Discretionary Bonus">Organizer Discretionary Bonus</option>
                <option value="Rule Infraction / Anti-Tamper Penalty">Rule Infraction / Anti-Tamper Penalty</option>
                <option value="Manual Score Recalibration">Manual Score Recalibration</option>
              </select>
            </div>

            {/* Summary preview */}
            <div className="p-3 rounded-[6px] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[13px] flex items-center justify-between">
              <span className="text-[var(--color-text-2)] font-medium">New Calculated ELO:</span>
              <span className="font-bold font-[family-name:var(--font-code)] text-[16px] text-[var(--color-brass-ink)]">
                {Math.max(0, eloModalTeam.elo + eloDelta)} ({eloDelta > 0 ? `+${eloDelta}` : eloDelta})
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEloModalTeam(null)}
                className="flex-1 py-2.5 rounded-[6px] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] font-bold text-[14px] text-[var(--color-text-2)] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyElo}
                disabled={busy}
                className="flex-1 py-2.5 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[14px]  cursor-pointer transition"
              >
                {busy ? "Applying…" : "Confirm ELO Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: INVENTORY & RELIC OVERRIDER                      */}
      {/* ========================================================= */}
      {invModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
          <div className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6  flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div>
                <h3 className="text-[18px] font-bold text-[var(--color-text-1)] flex items-center gap-2">
                  <Package className="w-5 h-5 text-[var(--color-brass)]" />
                  <span>Satchel contents</span>
                </h3>
                <p className="text-[12px] text-[var(--color-text-3)] font-medium">
                  Squad: <span className="font-bold text-[var(--color-text-1)]">{invModalTeam.name}</span> • Instant WebSocket Sync
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvModalTeam(null)}
                className="w-8 h-8 rounded-full hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {R1_BOTS.map((botId) => {
                const char = CHARACTERS[botId];
                const held = invModalTeam.inventory.find((i) => i.bot_id === botId);
                const currentStatus = held ? held.status : "locked";

                return (
                  <div
                    key={botId}
                    className="p-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[6px] bg-[var(--color-surface-2)] border border-[var(--color-border)] overflow-hidden shrink-0 ">
                        <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[14px] text-[var(--color-text-1)]">{char.name}</span>
                          <span className="text-[11px] text-[var(--color-text-3)] font-semibold">
                            ({char.targetItem.name})
                          </span>
                        </div>
                        <span className={`text-[11px] font-bold uppercase tracking-wider font-[family-name:var(--font-code)] ${
                          currentStatus === "verified" ? "text-[var(--color-moss)]" : currentStatus === "obtained" ? "text-[var(--color-brass-ink)]" : "text-[var(--color-text-faint)]"
                        }`}>
                          Status: {currentStatus}
                        </span>
                      </div>
                    </div>

                    {/* Quick 3-button status toggle */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleInventoryOverride(botId, char.targetItem.name, "locked")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          currentStatus === "locked"
                            ? "bg-[var(--color-surface-3)] text-[var(--color-text-1)] "
                            : "bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
                        }`}
                      >
                        Locked
                      </button>

                      <button
                        type="button"
                        onClick={() => handleInventoryOverride(botId, char.targetItem.name, "obtained")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          currentStatus === "obtained"
                            ? "bg-[var(--color-brass-wash)] text-[var(--color-text-1)] font-bold "
                            : "bg-[var(--color-brass-wash)] border border-[var(--color-border-strong)] text-[var(--color-brass-ink)] hover:bg-[var(--color-surface-2)]"
                        }`}
                      >
                        Held
                      </button>

                      <button
                        type="button"
                        onClick={() => handleInventoryOverride(botId, char.targetItem.name, "verified")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                          currentStatus === "verified"
                            ? "bg-[var(--color-moss)] text-white font-bold "
                            : "bg-[var(--color-moss-wash)] border border-[var(--color-moss-border)] text-[var(--color-moss)] hover:bg-[var(--color-moss-wash)]"
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>Verified Solved</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setInvModalTeam(null)}
                className="w-full py-2.5 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[14px] cursor-pointer transition"
              >
                Close Overrides
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: COMMS & AI REASONING TRACES INSPECTOR            */}
      {/* ========================================================= */}
      {commsModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
          <div className="w-full max-w-[800px] h-[85vh] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6  flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div>
                <h3 className="text-[18px] font-bold text-[var(--color-text-1)] flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[var(--color-brass)]" />
                  <span>Comms & AI Reasoning Inspector</span>
                </h3>
                <p className="text-[12px] text-[var(--color-text-3)] font-medium">
                  Squad: <span className="font-bold text-[var(--color-text-1)]">{commsModalTeam.name}</span> • Full Chat Logs & Hidden Traces
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommsModalTeam(null)}
                className="w-8 h-8 rounded-full hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2">
              {/* Tab Selector: Messages vs AI Reasoning */}
              <div className="flex items-center gap-1.5 p-1 rounded-[6px] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setCommsTab("messages")}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold transition cursor-pointer ${
                    commsTab === "messages" ? "bg-[var(--color-surface-1)] text-[var(--color-text-1)] " : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                  }`}
                >
                  Chat Messages ({commsMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCommsTab("traces")}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold transition cursor-pointer ${
                    commsTab === "traces" ? "bg-[var(--color-surface-1)] text-[var(--color-text-1)] " : "text-[var(--color-text-2)] hover:text-[var(--color-text-1)]"
                  }`}
                >
                  AI Reasoning Traces &lt;think&gt; ({commsTraces.length})
                </button>
              </div>

              {/* Bot Selector */}
              <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--color-text-2)]">
                <span>Filter Bot:</span>
                <select
                  value={commsBotFilter}
                  onChange={(e) => setCommsBotFilter(e.target.value)}
                  className="h-8 px-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] font-semibold text-[12px] focus:outline-none"
                >
                  <option value="all">All Characters</option>
                  {R1_BOTS.map((b) => (
                    <option key={b} value={b}>{CHARACTERS[b].name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-3 rounded-[8px] bg-[var(--color-surface-2)] border border-[var(--color-border)] flex flex-col gap-3">
              {commsLoading ? (
                <div className="m-auto text-center text-[var(--color-text-faint)] font-bold text-[14px] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[var(--color-brass)]" />
                  <span>Loading comms transcript…</span>
                </div>
              ) : commsTab === "messages" ? (
                commsMessages.length === 0 ? (
                  <p className="m-auto text-[var(--color-text-faint)] italic text-[13px]">No chat messages found for this query.</p>
                ) : (
                  commsMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-[8px] max-w-[85%] text-[13px] flex flex-col gap-1 ${
                        msg.role === "user"
                          ? "ml-auto bg-[var(--color-text-1)] text-white rounded-br-xs"
                          : "mr-auto bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-1)] rounded-bl-xs "
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] opacity-80 font-semibold">
                        <div className="flex items-center gap-1.5">
                          {msg.role !== "user" && CHARACTERS[msg.bot_id as keyof typeof CHARACTERS]?.avatar && (
                            <img
                              src={CHARACTERS[msg.bot_id as keyof typeof CHARACTERS].avatar}
                              alt={msg.bot_id}
                              className="w-4 h-4 rounded-full object-cover border border-[var(--color-border)] inline-block"
                            />
                          )}
                          <span>{msg.role === "user" ? "Operator Prompt" : `Bot: ${CHARACTERS[msg.bot_id as keyof typeof CHARACTERS]?.name ?? msg.bot_id}`}</span>
                        </div>
                        <span className="font-[family-name:var(--font-code)]">{msg.created_at.slice(11, 19)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text_final}</p>
                    </div>
                  ))
                )
              ) : (
                commsTraces.length === 0 ? (
                  <p className="m-auto text-[var(--color-text-faint)] italic text-[13px]">No internal reasoning traces recorded yet.</p>
                ) : (
                  commsTraces.map((trace) => {
                    let traceObj: any = {};
                    let guardObj: any = {};
                    try { traceObj = JSON.parse(trace.trace_json); } catch {}
                    try { guardObj = JSON.parse(trace.guard_json); } catch {}

                    return (
                      <div key={trace.id} className="p-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] flex flex-col gap-2 ">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[var(--color-text-3)] font-[family-name:var(--font-code)]">
                          <span>Bot: {trace.bot_id} • Phase: {trace.phase}</span>
                          <span>Latency: {traceObj.ms ? `${traceObj.ms}ms` : "N/A"} • {trace.created_at.slice(11, 19)}</span>
                        </div>

                        {/* Guard Risk Badge */}
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase ${
                            guardObj.risk === "flagged" ? "bg-[var(--color-seal-wash)] text-[var(--color-seal)]" : "bg-[var(--color-moss-wash)] text-[var(--color-moss)]"
                          }`}>
                            Guard: {guardObj.risk || "clean"}
                          </span>
                          {guardObj.flags && guardObj.flags.length > 0 && (
                            <span className="text-[11px] text-[var(--color-seal)] font-semibold">
                              Flags: {guardObj.flags.join(", ")}
                            </span>
                          )}
                        </div>

                        {/* Tool calls inspected */}
                        {traceObj.toolCalls && traceObj.toolCalls.length > 0 && (
                          <div className="p-2 rounded-[6px] bg-[var(--color-text-1)] text-[var(--color-brass-wash)] font-[family-name:var(--font-code)] text-[12px] overflow-x-auto">
                            <span className="text-[var(--color-text-faint)] block text-[10px] mb-1 uppercase">Tool Calls Executed:</span>
                            <pre>{JSON.stringify(traceObj.toolCalls, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setCommsModalTeam(null)}
                className="w-full py-2.5 rounded-[6px] bg-[var(--color-text-1)] hover:opacity-90 text-white font-bold text-[14px] cursor-pointer transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: EMERGENCY REWIND CONFIRMATION                    */}
      {/* ========================================================= */}
      {rewindConfirmTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ">
          <div className="w-full max-w-[460px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6  flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div>
                <h3 className="text-[18px] font-bold text-[var(--color-seal)] flex items-center gap-2">
                  <RotateCcw className="w-5 h-5" />
                  <span>Force Rewind Context</span>
                </h3>
                <p className="text-[12px] text-[var(--color-text-3)] font-medium">
                  Squad: <span className="font-bold text-[var(--color-text-1)]">{rewindConfirmTeam.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRewindConfirmTeam(null)}
                className="w-8 h-8 rounded-full hover:bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-[var(--color-text-2)]">
              This will wipe the LLM conversation memory for this team on the target bot, allowing them to restart their social engineering engagement from scratch.
            </p>

            <div>
              <label className="text-[12px] font-bold text-[var(--color-text-2)] block mb-1">
                Target Bot to Reset:
              </label>
              <select
                value={rewindBot}
                onChange={(e) => setRewindBot(e.target.value)}
                className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[13px] font-semibold focus:outline-none"
              >
                <option value="all">All Characters (Full Squad Wipe)</option>
                {R1_BOTS.map((b) => (
                  <option key={b} value={b}>{CHARACTERS[b].name}</option>
                ))}
              </select>
              {rewindBot !== "all" && CHARACTERS[rewindBot as keyof typeof CHARACTERS] && (
                <div className="mt-2 flex items-center gap-3 p-2.5 rounded-[6px] bg-[var(--color-seal-wash)] border border-[var(--color-seal)]">
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-[var(--color-seal)]">
                    <img
                      src={CHARACTERS[rewindBot as keyof typeof CHARACTERS].avatar}
                      alt={CHARACTERS[rewindBot as keyof typeof CHARACTERS].name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-[13px] text-[var(--color-seal)]">
                      {CHARACTERS[rewindBot as keyof typeof CHARACTERS].name}
                    </span>
                    <p className="text-[11px] text-[var(--color-seal)]">
                      Relic: {CHARACTERS[rewindBot as keyof typeof CHARACTERS].targetItem.name}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-[12px] font-bold text-[var(--color-text-2)] block mb-1">
                Optional ELO Penalty Deduction:
              </label>
              <input
                type="number"
                min={0}
                value={rewindPenalty}
                onChange={(e) => setRewindPenalty(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-2)] font-[family-name:var(--font-code)] font-bold text-[14px] focus:outline-none"
              />
              <span className="text-[11px] text-[var(--color-text-faint)] mt-1 block">Set to 0 for organizer-approved free reset.</span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRewindConfirmTeam(null)}
                className="flex-1 py-2.5 rounded-[6px] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] font-bold text-[14px] text-[var(--color-text-2)] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRewind}
                disabled={busy}
                className="flex-1 py-2.5 rounded-[6px] bg-[var(--color-seal)] hover:opacity-90 text-white font-bold text-[14px]  cursor-pointer transition"
              >
                {busy ? "Rewinding…" : "Confirm Rewind"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
