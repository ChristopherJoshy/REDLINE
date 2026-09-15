import { useState, useEffect, useMemo } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { createTeam, type CreateTeamResult } from "@/api/teams";
import RoundControls from "@/components/RoundControls";
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
  locks?: Record<string, { displayName: string; since: string }>;
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

  const [tab, setTab] = useState<"teams" | "stream" | "broadcast" | "create" | "gates" | "diagnostics" | "settings">("teams");
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
        const [resOverview, resStream, resHealth, resAnnounce] = await Promise.all([
          apiFetch("/api/admin/overview", { headers }).catch(() => null),
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
        const newItem: AdminInventoryItem = {
          bot_id: botId,
          item_key: itemKey,
          is_real: 1,
          status,
          verified_at: status === "verified" ? new Date().toISOString() : null,
        };

        // Refresh local team view
        setTeams((prev) =>
          prev.map((t) => {
            if (t.id !== invModalTeam.id) return t;
            const newInv = [...t.inventory.filter((i) => i.bot_id !== botId), newItem];
            return { ...t, inventory: newInv, solved: newInv.filter((i) => i.status === "verified").length };
          })
        );

        // Update modal team state in real time
        setInvModalTeam((prev) => {
          if (!prev) return null;
          const newInv = [...prev.inventory.filter((i) => i.bot_id !== botId), newItem];
          return { ...prev, inventory: newInv, solved: newInv.filter((i) => i.status === "verified").length };
        });
      }
    } catch {
      alert("Failed to update inventory relic");
    }
  }

  // Handle Batch Inventory Override (Edit all 8 characters at once)
  async function handleBatchInventoryOverride(status: string): Promise<void> {
    if (!invModalTeam || adminCode === "") return;
    setBusy(true);
    try {
      const promises = R1_BOTS.map((botId) => {
        const char = CHARACTERS[botId];
        return apiFetch("/api/admin/inventory-override", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
          body: JSON.stringify({ teamId: invModalTeam.id, botId, itemKey: char.targetItem.name, status }),
        });
      });
      await Promise.all(promises);
      notify(`Updated all 8 characters to ${status.toUpperCase()}`);

      const newInv: AdminInventoryItem[] = R1_BOTS.map((botId) => ({
        bot_id: botId,
        item_key: CHARACTERS[botId].targetItem.name,
        is_real: 1,
        status,
        verified_at: status === "verified" ? new Date().toISOString() : null,
      }));

      setTeams((prev) =>
        prev.map((t) => (t.id === invModalTeam.id ? { ...t, inventory: newInv, solved: status === "verified" ? 8 : 0 } : t))
      );
      setInvModalTeam((prev) =>
        prev ? { ...prev, inventory: newInv, solved: status === "verified" ? 8 : 0 } : null
      );
    } catch {
      alert("Batch update failed");
    } finally {
      setBusy(false);
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
        const overviewRes = await apiFetch("/api/admin/overview", { headers: { "x-admin-code": adminCode } }).catch(() => null);
        if (overviewRes && overviewRes.ok) {
          const data = (await overviewRes.json()) as { teams: AdminTeamOverview[] };
          setTeams(data.teams);
        }
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
    if (!window.confirm(`Permanently reset team "${team.name}" (${code})? This removes the team, its operators, and all related game data. This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/admin/teams/${team.id}`, {
        method: "DELETE",
        headers: { "x-admin-code": adminCode },
      });
      if (res.ok) {
        notify(`Team ${team.name} (${code}) has been reset and removed.`);
        setTeams((prev) => prev.filter((x) => x.id !== team.id));
      } else {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(d?.error ?? "Failed to reset team");
      }
    } catch {
      alert("Failed to reset team");
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

  // Filter teams by search query
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
            <ShieldCheck className="w-11 h-11 text-[var(--color-brass)] animate-pulse" />
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg-0 p-6 text-text-1 font-sans">
        <div className="w-full max-w-[440px] rounded-md border border-border bg-surface-1 p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-md border border-border bg-bg-0">
              <Lock className="h-6 w-6 text-brass" />
            </span>
            <p className="mb-2 font-mono text-[11px]  tracking-[0.25em] text-text-3">
              REDLINE // PROVOCATEUR COMMAND
            </p>
            <h1 className="font-mono text-[24px] font-bold text-text-1 ">
              Command Auth
            </h1>
            <p className="mt-1 max-w-[320px] text-[13px] text-text-3">
              Strike Teams, Guardrail Bypass, and Sector controls.
            </p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between text-[12px] font-bold  tracking-wider text-text-3">
                <span>Command Access Code</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-text-3">
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
                  placeholder="ACCESS CODE"
                  aria-label="Admin access code"
                  className="h-12 w-full rounded-md border border-border bg-bg-0 pl-10 pr-11 font-mono text-[14px] text-text-1 placeholder:text-text-3/40 focus:border-brass focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthCode(!showAuthCode)}
                  tabIndex={-1}
                  aria-label={showAuthCode ? "Hide code" : "Show code"}
                  className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center pr-3.5 text-text-3 hover:text-text-1 transition"
                >
                  {showAuthCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="flex items-center gap-2 rounded-md border border-brass bg-brass/10 px-4 py-3 text-[12px] font-mono text-brass">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !authInput.trim()}
              className="mt-2 flex h-12 min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-brass text-[14px] font-bold text-text-1  tracking-wider hover:bg-brass/90 disabled:opacity-50 transition cursor-pointer"
            >
              {isVerifying ? (
                <span className="font-mono">Verifying Access...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authenticate Command</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center border-t border-border pt-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-[12px] font-mono text-text-3 hover:text-text-1 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Back to Arena</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-text-1 font-sans">
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-md border border-moss bg-surface-1 px-5 py-4 text-[14px] font-semibold text-moss shadow-none">
          <Check className="w-5 h-5 text-moss" />
          <span>{successToast}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between border-b border-border bg-surface-1 px-6 py-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="block h-8 w-[3px] bg-brass" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-[20px] font-bold tracking-[0.1em] text-text-1 ">
                COMMAND HUB
              </h1>
              <span className="flex items-center gap-1 rounded-md border border-moss/50 bg-bg-0 px-2 py-0.5 font-mono text-[11px] font-bold text-moss ">
                <Radio className="w-3 h-3 text-moss" />
                <span>Telemetry Live</span>
              </span>
            </div>
            <p className="text-[12px] text-text-3">
              Teams, Relic Solves & Gate Controls
            </p>
          </div>
        </div>

        {/* System Health Quick Strip & Auth controls */}
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          {systemHealth && (
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-md bg-bg-0 border border-border font-mono text-[12px] font-bold text-text-3">
              <span className="flex items-center gap-1.5 text-moss">
                <span className="w-2 h-2 rounded-none bg-moss" />
                <span>{systemHealth.activeConnections} Clients</span>
              </span>
              <span>•</span>
              <span className="text-text-1">Groq & Zen OK</span>
            </div>
          )}

          {/* Admin Authorized Pill */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-bg-0 border border-border text-moss font-mono text-[12px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-moss" />
            <span className="hidden sm:inline ">Command Active</span>
          </div>

          {/* Lock HQ Button */}
          <button
            type="button"
            onClick={handleLock}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 text-[12px] font-mono font-bold transition cursor-pointer"
            title="Lock Admin Session and Require Access Code"
          >
            <Lock className="w-3.5 h-3.5 text-text-3" />
            <span>Lock</span>
          </button>

          {/* Exit HQ Button */}
          <a
            href="/"
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 text-[12px] font-mono font-bold transition"
            title="Exit to Arena"
          >
            <LogOut className="w-3.5 h-3.5 text-text-3" />
            <span className="hidden sm:inline">Exit</span>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto p-6 sm:p-8 lg:p-10 flex flex-col gap-8">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("teams")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "teams"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Teams & Controls ({teams.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("stream")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "stream"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Stream ({activityStream.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("broadcast")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "broadcast"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <Megaphone className="w-4 h-4" />
              <span>Global Broadcast</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("create")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "create"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Team</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("gates")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "gates"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Gates & Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("diagnostics")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "diagnostics"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Diagnostics</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold  tracking-wider font-mono transition cursor-pointer ${
                tab === "settings"
                  ? "bg-brass text-text-1 border border-brass"
                  : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
              }`}
            >
              <KeyRound className="w-4 h-4 text-moss" />
              <span>API Pool {settingsUnlocked ? "🔓" : "🔒"}</span>
            </button>
          </div>

          {/* Projector Board Link */}
          <a
            href="/admin/board"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-brass bg-bg-0 text-brass font-mono text-[13px] font-bold  tracking-wider hover:bg-brass hover:text-text-1 transition"
          >
            <Trophy className="w-4 h-4" />
            <span>Clocktower Citadel Board ↗</span>
          </a>
        </div>

        {/* Global Key Metrics Strip - Doubled Padding, Sharp Edges, Monospace Telemetry */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          <div className="p-6 rounded-md border border-border bg-surface-1">
            <span className="text-[11px] font-mono font-bold text-text-3  tracking-wider">Total Teams</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-text-1">{teams.length}</span>
              <Users className="w-5 h-5 text-text-3" />
            </div>
          </div>

          <div className="p-6 rounded-md border border-border bg-surface-1">
            <span className="text-[11px] font-mono font-bold text-text-3  tracking-wider">Operators</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-text-1">{totalMembers}</span>
              <Activity className="w-5 h-5 text-moss" />
            </div>
          </div>

          <div className="p-6 rounded-md border border-border bg-surface-1">
            <span className="text-[11px] font-mono font-bold text-text-3  tracking-wider">Relic Solves</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-moss">{totalSolves}</span>
              <ShieldCheck className="w-5 h-5 text-moss" />
            </div>
          </div>

          <div className="p-6 rounded-md border border-border bg-surface-1">
            <span className="text-[11px] font-mono font-bold text-text-3  tracking-wider">Peak ELO</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-text-1">{highestElo}</span>
              <Trophy className="w-5 h-5 text-brass" />
            </div>
          </div>

          <div className="p-6 rounded-md border border-border bg-surface-1" title={`Prompt: ${(systemHealth?.promptTokens ?? 0).toLocaleString()} | Completion: ${(systemHealth?.completionTokens ?? 0).toLocaleString()}`}>
            <span className="text-[11px] font-mono font-bold text-text-3  tracking-wider">Total Tokens</span>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <span className="font-mono text-[24px] font-bold text-text-1">
                  {(systemHealth?.totalTokens ?? 0) >= 1_000_000
                    ? `${((systemHealth?.totalTokens ?? 0) / 1_000_000).toFixed(2)}M`
                    : (systemHealth?.totalTokens ?? 0) >= 10_000
                    ? `${((systemHealth?.totalTokens ?? 0) / 1_000).toFixed(1)}k`
                    : (systemHealth?.totalTokens ?? 0).toLocaleString()}
                </span>
                <span className="block text-[10px] font-mono text-text-3">
                  {((systemHealth?.promptTokens ?? 0) / 1000).toFixed(1)}k in · {((systemHealth?.completionTokens ?? 0) / 1000).toFixed(1)}k out
                </span>
              </div>
              <Cpu className="w-5 h-5 text-text-3" />
            </div>
          </div>

          <div className="p-6 rounded-md border border-border bg-surface-1" title={`Current: ${systemHealth?.currentTps ?? 0} tps | Peak: ${systemHealth?.peakTps ?? 0} tps | Avg: ${systemHealth?.averageTps ?? 0} tps`}>
            <span className="text-[11px] font-mono font-bold text-text-3  tracking-wider">Speed (TPS)</span>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-[24px] font-bold text-text-1">
                    {systemHealth?.currentTps ?? 0}
                  </span>
                  <span className="text-[11px] font-bold text-text-3">
                    TPS
                  </span>
                  <span className={`inline-block h-2 w-2 rounded-none ${(systemHealth?.currentTps ?? 0) > 0 ? "bg-moss" : "bg-text-3"}`} />
                </div>
                <span className="block text-[10px] font-mono text-text-3">
                  Peak: {systemHealth?.peakTps ?? 0} tps
                </span>
              </div>
              <Zap className="w-5 h-5 text-brass" />
            </div>
          </div>
        </div>

        {/* TAB 1: SQUADS & DIRECT COMMAND CONTROLS */}
        {tab === "teams" && (
          <div className="flex flex-col gap-6">
            {/* Search filter */}
            <div className="flex items-center gap-3 p-3 px-5 rounded-md border border-border bg-surface-1 max-w-[480px]">
              <Search className="w-4 h-4 text-text-3" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Team by name or join code..."
                className="w-full bg-transparent text-[14px] focus:outline-none text-text-1 placeholder:text-text-3/50 font-medium"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="text-text-3 hover:text-text-1 font-mono text-[12px] cursor-pointer">
                  Clear
                </button>
              )}
            </div>

            {filteredTeams.length === 0 ? (
              <div className="p-12 text-center rounded-md border border-border bg-surface-1 text-text-3">
                <Users className="w-12 h-12 mb-3 mx-auto text-text-3/40" />
                <p className="font-mono font-bold text-[18px] text-text-1 ">No Teams Match Query</p>
                <p className="text-[13px] mt-1">Verify search term or create a new team using the "Create Team" tab.</p>
              </div>
            ) : (
              filteredTeams.map((t) => (
                <div key={t.id} className="rounded-md border border-border bg-surface-1 flex flex-col overflow-hidden transition">
                  {/* Single Horizontal Top Bar Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-bg-0 border-b border-border">
                    {/* Left: Team Name + Join Code */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-surface-1 border border-border text-brass font-mono font-bold text-[15px] shrink-0">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-mono text-[17px] font-bold text-text-1  tracking-wider">
                          {t.name}
                        </h3>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-1 border border-border font-mono text-[12px]">
                          <KeyRound className="w-3.5 h-3.5 text-moss shrink-0" />
                          <span className="text-text-3  text-[10px] font-bold">Hint/Code:</span>
                          <span className="font-bold text-moss tracking-wider select-all">
                            {t.join_code || t.hint}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyCode(t.join_code || t.hint)}
                            className="p-0.5 hover:bg-border rounded-md text-moss cursor-pointer transition ml-0.5"
                            title="Copy join code"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: ELO Rating & Unified Action Button Group */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-surface-1 border border-border font-mono">
                        <span className="text-[10px] font-bold text-text-3 ">ELO:</span>
                        <span className="text-[16px] font-bold text-text-1">{t.elo}</span>
                      </div>

                      {/* Power Controls Button Group */}
                      <div className="flex items-center border border-border rounded-md overflow-hidden bg-surface-1 divide-x divide-border">
                        <button
                          type="button"
                          onClick={() => {
                            setEloModalTeam(t);
                            setEloDelta(50);
                            setEloReason("Creative Social Engineering Exploit");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold  tracking-wider text-text-1 hover:bg-border transition cursor-pointer"
                          title="Adjust team ELO rating"
                        >
                          <Sliders className="w-3.5 h-3.5 text-brass" />
                          <span>Adjust ELO</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInvModalTeam(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold  tracking-wider text-text-1 hover:bg-border transition cursor-pointer"
                          title="Inspect & override backpack relics"
                        >
                          <Package className="w-3.5 h-3.5 text-moss" />
                          <span>Relic Override</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCommsModalTeam(t);
                            setCommsBotFilter("all");
                            setCommsTab("messages");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold  tracking-wider text-text-1 hover:bg-border transition cursor-pointer"
                          title="Inspect chat messages and hidden AI reasoning traces"
                        >
                          <Eye className="w-3.5 h-3.5 text-text-1" />
                          <span>Inspect</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRewindConfirmTeam(t);
                            setRewindBot("all");
                            setRewindPenalty(0);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold  tracking-wider text-brass hover:bg-brass hover:text-text-1 transition cursor-pointer"
                          title="Force rewind conversation context"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Rewind</span>
                        </button>

                        {(t.id === "GW3Z-ABTF" || t.join_code === "GW3Z-ABTF" || t.hint === "GW3Z-ABTF") && (
                          <button
                            type="button"
                            onClick={() => void handleResetTeam(t)}
                            disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold  tracking-wider bg-brass text-text-1 hover:bg-brass/90 transition cursor-pointer disabled:opacity-50"
                            title="Permanently reset this team"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Live mark occupancy: who holds which mark right now */}
                  {t.locks && Object.keys(t.locks).length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-brass-wash)] px-3 py-2" aria-live="polite">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold  tracking-wider text-[var(--color-brass-ink)]">
                        <Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
                        <span>Live on marks</span>
                      </span>
                      {Object.entries(t.locks).map(([botId, lock]) => {
                        const char = CHARACTERS[botId as keyof typeof CHARACTERS];
                        return (
                          <span
                            key={botId}
                            title={`${lock.displayName} is talking to ${char?.name ?? botId} since ${lock.since.slice(11, 19)}`}
                            className="flex items-center gap-1.5 rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-2 py-1 text-[12px] font-semibold text-[var(--color-text-1)]"
                          >
                            {char?.avatar && (
                              <span className="block h-5 w-5 overflow-hidden rounded-[4px] border border-[var(--color-border)]">
                                <img src={char.avatar} alt="" className="h-full w-full object-cover" />
                              </span>
                            )}
                            <span>{char?.name ?? botId}</span>
                            <span aria-hidden="true" className="text-[var(--color-text-3)]">·</span>
                            <span className="text-[var(--color-brass-ink)]">{lock.displayName}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Body Content */}
                  <div className="p-4 flex flex-col gap-4">
                    {/* Operator Activity Grid (Multi-column, Zero excess padding, Glowing Dot) */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-mono font-bold  tracking-wider text-text-3">
                        Operator Activity:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {t.members.map((m) => (
                          <div key={m.display_name} className="px-3 py-2 rounded-md border border-border bg-bg-0 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-moss shrink-0 shadow-none" />
                              <span className="font-bold text-[13px] text-text-1 truncate">{m.display_name}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-surface-1 border border-border text-text-3 shrink-0">
                              {m.contribution} msgs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Held Relics (Row of small, dark, inline badges/chips reflecting real-time override status) */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold  tracking-wider text-text-3">
                          Held Relics ({t.inventory.filter((i) => i.status === "obtained" || i.status === "verified").length}/8 Held • {t.solved}/8 Solved):
                        </span>
                      </div>
                      <div className="p-2 rounded-md border border-border bg-bg-0 flex flex-wrap gap-1.5 items-center min-h-[42px]">
                        {t.inventory.filter((i) => i.status === "obtained" || i.status === "verified").length === 0 ? (
                          <span className="text-[11px] font-mono text-text-3/50 italic">No active relics in satchel</span>
                        ) : (
                          t.inventory
                            .filter((i) => i.status === "obtained" || i.status === "verified")
                            .map((item, idx) => {
                              const char = CHARACTERS[item.bot_id as keyof typeof CHARACTERS];
                              const isVerified = item.status === "verified";
                              return (
                                <div
                                  key={idx}
                                  title={`${item.item_key} (${item.status})`}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold transition ${
                                    isVerified
                                      ? "bg-moss/15 border-moss text-moss"
                                      : "bg-surface-1 border-text-1 text-text-1"
                                  }`}
                                >
                                  {isVerified ? (
                                    <ShieldCheck className="w-3.5 h-3.5 text-moss shrink-0" />
                                  ) : (
                                    <Package className="w-3.5 h-3.5 text-text-1 shrink-0" />
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
          <div className="flex flex-col gap-6 max-w-[960px] mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-[22px] font-bold text-text-1 ">
                  Live Stream Audit Trail
                </h2>
                <p className="text-[13px] text-text-3 mt-1">
                  Real-time chronological audit trail of all Relic Solves, ELO adjustments, and security flags.
                </p>
              </div>
              <span className="px-3.5 py-1.5 rounded-md bg-surface-1 border border-border font-mono text-[12px] font-bold text-moss ">
                Auto-sync 3s
              </span>
            </div>

            <div className="flex flex-col gap-3 mt-2">
              {activityStream.length === 0 ? (
                <div className="p-10 text-center rounded-md border border-border bg-surface-1 font-mono text-text-3">
                  No stream audit events recorded.
                </div>
              ) : (
                activityStream.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-4 px-6 rounded-md border border-border bg-surface-1 flex items-center justify-between gap-4 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-9 h-9 rounded-md shrink-0 border ${
                        evt.type === "solve"
                          ? "bg-moss/10 border-moss text-moss"
                          : evt.type === "security"
                          ? "bg-brass/10 border-brass text-brass"
                          : "bg-bg-0 border-border text-text-1"
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
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-[15px] text-text-1">{evt.teamName}</span>
                          <span className="text-[11px] font-mono font-bold  px-2 py-0.5 rounded-md bg-bg-0 border border-border text-text-3">
                            {evt.type === "solve" ? "RELIC SOLVED" : evt.type}
                          </span>
                        </div>
                        <p className="text-[13px] text-text-3 mt-1">{evt.detail}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-text-3 font-mono shrink-0">
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
          <div className="max-w-[760px] mx-auto w-full flex flex-col gap-6">
            <div className="p-8 rounded-md border border-border bg-surface-1 flex flex-col gap-6">
              <div>
                <h2 className="font-mono text-[22px] font-bold text-text-1  flex items-center gap-3">
                  <Megaphone className="w-6 h-6 text-brass" />
                  <span>Global Broadcast Station</span>
                </h2>
                <p className="text-[13px] text-text-3 mt-1">
                  Dispatch an instant announcement banner to all active operator terminals.
                </p>
              </div>

              <form onSubmit={handleSendBroadcast} className="flex flex-col gap-5">
                <div>
                  <label className="text-[12px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                    Broadcast Message:
                  </label>
                  <textarea
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="ATTENTION OPERATORS: Round 1 ending soon. Complete relic solves before gate closure."
                    rows={3}
                    className="w-full p-4 rounded-md border border-border bg-bg-0 text-[14px] text-text-1 placeholder:text-text-3/40 focus:border-brass focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                      Severity Level:
                    </label>
                    <select
                      value={broadcastLevel}
                      onChange={(e) => setBroadcastLevel(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-md border border-border bg-bg-0 text-[13px] font-mono font-bold text-text-1 focus:border-brass focus:outline-none transition"
                    >
                      <option value="info">Standard Transmission (Info)</option>
                      <option value="warning">Urgent Priority (Warning)</option>
                      <option value="alert">Critical Threat (Alert Flash)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[12px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                      Broadcast CallSign:
                    </label>
                    <input
                      value={broadcastSender}
                      onChange={(e) => setBroadcastSender(e.target.value)}
                      placeholder="ARENA MARSHAL"
                      className="w-full h-11 px-3 rounded-md border border-border bg-bg-0 text-[13px] font-mono font-bold text-text-1 focus:border-brass focus:outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || broadcastMsg.trim() === ""}
                  className="mt-2 py-4 px-6 rounded-md bg-brass hover:bg-brass/90 text-text-1 font-mono font-bold text-[14px]  tracking-wider disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4" />
                  <span>{busy ? "Transmitting…" : "Dispatch Global Broadcast"}</span>
                </button>
              </form>
            </div>

            {/* Broadcast History */}
            {announcements.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-[12px] font-mono font-bold  tracking-wider text-text-3 px-1">
                  Recent Broadcast Logs:
                </span>
                <div className="flex flex-col gap-2.5">
                  {announcements.map((a) => (
                    <div key={a.id} className="p-4 px-5 rounded-md border border-border bg-surface-1 text-[13px] flex items-center justify-between gap-3 font-mono">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[11px]  ${
                          a.level === "alert" ? "bg-brass text-text-1" : a.level === "warning" ? "bg-surface-1 border border-brass text-brass" : "bg-bg-0 text-text-3"
                        }`}>
                          {a.level}
                        </span>
                        <span className="font-bold text-text-1">{a.sender || "HQ"}:</span>
                        <span className="text-text-3 font-sans font-medium">{a.message}</span>
                      </div>
                      <span className="text-[11px] text-text-3 shrink-0">
                        {a.timestamp.slice(11, 19)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CREATE SQUAD */}
        {tab === "create" && (
          <div className="max-w-[620px] mx-auto w-full p-8 rounded-md border border-border bg-surface-1 flex flex-col gap-6">
            <div>
              <h2 className="font-mono text-[22px] font-bold text-text-1 ">
                Create New Team
              </h2>
              <p className="text-[13px] text-text-3 mt-1">
                Generates a confidential join code shown once. Issue directly to team lead.
              </p>
            </div>

            <form onSubmit={handleCreateTeam} className="flex flex-col gap-5">
              <div>
                <label className="text-[12px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                  Team Name:
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CyberVanguard"
                  className="w-full h-11 px-4 rounded-md border border-border bg-bg-0 text-[15px] text-text-1 placeholder:text-text-3/40 focus:border-brass focus:outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-mono font-bold  tracking-wider text-text-3">
                    Operators ({memberInputs.length} of 3 • min 2, max 3):
                  </label>
                  {memberInputs.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddMember}
                      className="flex items-center gap-1 text-[11px] font-mono font-bold  text-text-1 bg-bg-0 px-3 py-1 rounded-md border border-border hover:bg-border cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Operator</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {memberInputs.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          value={val}
                          onChange={(e) => handleMemberChange(idx, e.target.value)}
                          placeholder={`Operator ${idx + 1} Name`}
                          className="w-full h-11 px-4 rounded-md border border-border bg-bg-0 text-[15px] text-text-1 placeholder:text-text-3/40 focus:border-brass focus:outline-none transition"
                        />
                      </div>
                      {memberInputs.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(idx)}
                          aria-label={`Remove Operator ${idx + 1}`}
                          title="Remove operator"
                          className="h-11 w-11 shrink-0 flex items-center justify-center rounded-md border border-border bg-bg-0 text-text-3 hover:text-brass hover:bg-brass/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  busy ||
                  name.trim() === "" ||
                  memberInputs.filter((m) => m.trim() !== "").length < 2
                }
                className="mt-2 py-4 px-6 rounded-md bg-brass hover:bg-brass/90 text-text-1 font-mono font-bold text-[14px]  tracking-wider disabled:opacity-50 transition cursor-pointer"
              >
                {busy ? "Enrolling…" : "Generate Team Join Code"}
              </button>
            </form>

            {/* Created Code Alert */}
            {created && (
              <div className="p-6 rounded-md border border-moss bg-bg-0 text-moss flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-mono font-bold  tracking-wider text-moss">
                    Confidential Join Code (Single Display):
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCode(created.code)}
                    className="flex items-center gap-1 text-[12px] font-mono font-bold text-moss cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? "Copied!" : "Copy Code"}</span>
                  </button>
                </div>

                <div className="font-mono text-[32px] font-bold tracking-widest text-moss text-center py-3 bg-surface-1 rounded-md border border-border">
                  {created.code}
                </div>

                <p className="text-[13px] font-mono text-moss text-center">
                  Team: <span className="font-bold text-text-1">{created.name}</span> • Join Hint:{" "}
                  <span className="font-bold">{created.hint}</span>
                </p>
              </div>
            )}

            {error && (
              <p className="text-[13px] font-mono text-brass text-center">{error}</p>
            )}
          </div>
        )}

        {tab === "gates" && <RoundControls adminCode={adminCode} />}

        {/* TAB 6: SYSTEM DIAGNOSTICS */}
        {tab === "diagnostics" && (
          <div className="max-w-[860px] mx-auto w-full flex flex-col gap-6">
            {systemHealth && (
              <div className="p-8 rounded-md border border-border bg-surface-1 flex flex-col gap-6">
                <div>
                  <h2 className="font-mono text-[22px] font-bold text-text-1  flex items-center gap-3">
                    <Cpu className="w-6 h-6 text-brass" />
                    <span>System Diagnostics & LLM Status</span>
                  </h2>
                  <p className="text-[13px] text-text-3 mt-1">
                    Single-process LAN runtime status, model connectivity, and SQLite storage statistics.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono">
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">Uptime</span>
                    <p className="text-[16px] font-bold text-text-1 mt-1">
                      {Math.floor(systemHealth.uptime / 60)}m {systemHealth.uptime % 60}s
                    </p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">RAM Footprint</span>
                    <p className="text-[16px] font-bold text-text-1 mt-1">{systemHealth.memoryUsageMb} MB</p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">Active Sockets</span>
                    <p className="text-[16px] font-bold text-moss mt-1">{systemHealth.activeConnections} WS</p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">Groq Cloud (R1)</span>
                    <p className="text-[16px] font-bold text-moss mt-1">Ready</p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">OpenCode Zen (R2)</span>
                    <p className="text-[16px] font-bold text-moss mt-1">Ready</p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">Chat Logs</span>
                    <p className="text-[16px] font-bold text-text-1 mt-1">{systemHealth.messagesCount}</p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">Total Tokens</span>
                    <p className="text-[16px] font-bold text-text-1 mt-1 font-mono">
                      {(systemHealth.totalTokens ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-bg-0">
                    <span className="text-[11px] font-bold text-text-3 ">Throughput</span>
                    <p className="text-[16px] font-bold text-text-1 mt-1 font-mono">
                      {systemHealth.currentTps ?? 0} TPS
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-md bg-brass hover:bg-brass/90 text-text-1 font-mono font-bold text-[13px]  tracking-wider flex items-center gap-2 cursor-pointer"
                  >
                    <Database className="w-4 h-4" />
                    <span>Create DB Snapshot (.db)</span>
                  </button>

                  <a
                    href={`/api/admin/export.json?x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 font-mono font-bold text-[13px]  tracking-wider flex items-center gap-2 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON Dump</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=elo_log&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 font-mono text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: ELO Log</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=chat_logs&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 font-mono text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: Chat Logs</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=team_inventory&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 font-mono text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: Inventory</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: API SETTINGS & KEY ROTATION POOL */}
        {tab === "settings" && (
          <div className="max-w-[880px] mx-auto w-full flex flex-col gap-6">
            {!settingsUnlocked ? (
              <div className="p-10 rounded-md border border-border bg-surface-1 flex flex-col items-center text-center max-w-[520px] mx-auto">
                <div className="w-16 h-16 rounded-md bg-bg-0 border border-border text-brass flex items-center justify-center mb-4">
                  <Lock className="w-11 h-11" />
                </div>
                <h2 className="font-mono text-[22px] font-bold text-text-1 ">
                  API Settings Locked
                </h2>
                <p className="text-[13px] text-text-3 mt-2 max-w-[40ch]">
                  Enter the confidential <code className="px-1.5 py-0.5 rounded bg-bg-0 font-mono text-text-1">ADMIN_SETTINGS_PIN</code> to manage multi-API rotation pools.
                </p>

                <form onSubmit={handleUnlockSettings} className="mt-6 flex flex-col gap-4 w-full">
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-text-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="ENTER SETTINGS PIN"
                      autoFocus
                      className="w-full h-11 pl-10 pr-4 rounded-md border border-border bg-bg-0 text-[14px] font-mono text-text-1 focus:border-brass focus:outline-none transition"
                    />
                  </div>

                  {pinError && (
                    <p className="text-[12px] font-mono text-brass font-semibold">{pinError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!pinInput.trim()}
                    className="h-11 rounded-md bg-brass hover:bg-brass/90 text-text-1 font-mono font-bold text-[13px]  tracking-wider disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Unlock API Pool</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Header & Lock Button */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-8 rounded-md border border-border bg-surface-1">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="font-mono text-[22px] font-bold text-text-1 ">
                        Multi-API Key Rotation Engine
                      </h2>
                      <span className="px-3 py-1 rounded-md bg-bg-0 border border-moss text-moss font-mono font-bold text-[11px]  tracking-wider">
                        Active & Unlocked
                      </span>
                    </div>
                    <p className="text-[13px] text-text-3 mt-1">
                      Configure keys for Groq & OpenCode Zen. Automatic fallback on rate-limit (429).
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void fetchKeys()}
                      disabled={keysLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-bg-0 hover:bg-border text-text-1 font-mono text-[12px] font-bold  tracking-wider transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${keysLoading ? "animate-spin text-brass" : ""}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLockSettings}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-brass bg-brass/10 hover:bg-brass text-brass hover:text-text-1 font-mono text-[12px] font-bold  tracking-wider transition cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Lock Settings</span>
                    </button>
                  </div>
                </div>

                {/* Provider Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Groq Pool Card */}
                  <div className="p-6 rounded-md border border-border bg-bg-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-none bg-moss" />
                        <h3 className="font-mono font-bold text-[16px] text-text-1 ">Groq Cloud (Round 1)</h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-surface-1 border border-border text-text-3">
                        qwen/qwen3.8-27b
                      </span>
                    </div>
                    <p className="text-[12px] text-text-3">
                      Powers all 8 Round 1 AI characters (John Wick, Spider-Man, Escanor, Stark, etc.)
                    </p>
                    <div className="mt-2 pt-3 border-t border-border flex items-center justify-between text-[12px] font-mono">
                      <span className="text-text-3 ">Rotation Pool:</span>
                      <span className="font-bold text-moss">
                        {keysList.filter((k) => k.provider === "groq" && k.is_active).length} Custom Active + .env Fallback
                      </span>
                    </div>
                  </div>

                  {/* OpenCode Zen Pool Card */}
                  <div className="p-6 rounded-md border border-border bg-bg-0 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-none bg-moss" />
                        <h3 className="font-mono font-bold text-[16px] text-text-1 ">OpenCode Zen (Round 2)</h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-surface-1 border border-border text-text-3">
                        muse-spark-1.3
                      </span>
                    </div>
                    <p className="text-[12px] text-text-3">
                      Powers Nether Vault Bosses (Itachi Uchiha & Sosuke Aizen) with server reasoning traces
                    </p>
                    <div className="mt-2 pt-3 border-t border-border flex items-center justify-between text-[12px] font-mono">
                      <span className="text-text-3 ">Rotation Pool:</span>
                      <span className="font-bold text-moss">
                        {keysList.filter((k) => k.provider === "zen" && k.is_active).length} Custom Active + .env Fallback
                      </span>
                    </div>
                  </div>
                </div>

                {/* Add New Key Form */}
                <div className="p-6 sm:p-8 rounded-md border border-border bg-bg-0 flex flex-col gap-5">
                  <h3 className="font-mono font-bold text-[16px] text-text-1  flex items-center gap-2">
                    <Plus className="w-4 h-4 text-brass" />
                    <span>Add New API Key to Rotation Pool</span>
                  </h3>

                  <form onSubmit={handleAddKey} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end font-mono">
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-text-3  tracking-wider block mb-1">
                        Provider:
                      </label>
                      <select
                        value={newKeyProvider}
                        onChange={(e) => setNewKeyProvider(e.target.value as "groq" | "zen")}
                        className="w-full h-11 px-3 rounded-md border border-border bg-surface-1 text-[13px] font-bold text-text-1 focus:outline-none"
                      >
                        <option value="groq">Groq (Round 1)</option>
                        <option value="zen">OpenCode Zen (Round 2)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-5">
                      <label className="text-[11px] font-bold text-text-3  tracking-wider block mb-1">
                        API Key Value:
                      </label>
                      <input
                        type="password"
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder="gsk_... or sk-pw..."
                        className="w-full h-11 px-4 rounded-md border border-border bg-surface-1 text-[13px] text-text-1 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-text-3  tracking-wider block mb-1">
                        Label:
                      </label>
                      <input
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        placeholder="Key Label"
                        className="w-full h-11 px-3 rounded-md border border-border bg-surface-1 text-[13px] text-text-1 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={busy || !newKeyValue.trim()}
                        className="w-full h-11 rounded-md bg-brass hover:bg-brass/90 text-text-1 font-mono font-bold text-[13px]  tracking-wider disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Key</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Keys Pool List */}
                <div className="p-6 sm:p-8 rounded-md border border-border bg-bg-0 flex flex-col gap-5">
                  <div className="flex items-center justify-between font-mono">
                    <h3 className="font-bold text-[16px] text-text-1 ">
                      Configured Keys ({keysList.length + 2} in Pool)
                    </h3>
                    <span className="text-[12px] text-text-3">
                      Sorted by lowest fail count
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 font-mono">
                    {/* Permanent Fallback Key: Groq */}
                    <div className="p-4 px-5 rounded-md border border-border bg-surface-1 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span className="px-2.5 py-1 rounded-md bg-bg-0 text-text-3 text-[11px] font-bold  border border-border">
                          Groq
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-text-1">
                              System Fallback Key (.env)
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-moss/10 text-moss border border-moss text-[10px] font-bold ">
                              Always Active
                            </span>
                          </div>
                          <span className="text-[11px] text-text-3">Primary environment variable fallback</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-moss ">Built-in Fallback</span>
                    </div>

                    {/* Permanent Fallback Key: Zen */}
                    <div className="p-4 px-5 rounded-md border border-border bg-surface-1 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span className="px-2.5 py-1 rounded-md bg-bg-0 text-text-3 text-[11px] font-bold  border border-border">
                          Zen
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-text-1">
                              System Fallback Key (.env)
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-moss/10 text-moss border border-moss text-[10px] font-bold ">
                              Always Active
                            </span>
                          </div>
                          <span className="text-[11px] text-text-3">Primary environment variable fallback</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-moss ">Built-in Fallback</span>
                    </div>

                    {/* Custom Keys */}
                    {keysList.map((k) => (
                      <div
                        key={k.id}
                        className="p-4 px-5 rounded-md border border-border bg-surface-1 flex items-center justify-between gap-4 transition"
                      >
                        <div className="flex items-center gap-4">
                          <span className="px-2.5 py-1 rounded-md bg-bg-0 text-text-3 text-[11px] font-bold  border border-border">
                            {k.provider}
                          </span>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-text-1">
                                {k.masked_key}
                              </span>
                              {k.label && (
                                <span className="text-[12px] text-text-3">
                                  ({k.label})
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold  ${
                                k.is_active ? "bg-moss/10 text-moss border border-moss" : "bg-bg-0 text-text-3"
                              }`}>
                                {k.is_active ? "Active" : "Disabled"}
                              </span>
                              {k.fail_count > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-brass/10 text-brass text-[10px] font-bold">
                                  {k.fail_count} failures
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-text-3 mt-1">
                              Added: {k.created_at.slice(0, 10)} {k.last_used_at ? `• Last Used: ${k.last_used_at.slice(11, 19)}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleKey(k.id)}
                            className={`px-3 py-1.5 rounded-md text-[12px] font-mono font-bold  transition cursor-pointer ${
                              k.is_active
                                ? "bg-bg-0 border border-border text-text-3 hover:text-text-1"
                                : "bg-moss/10 border border-moss text-moss"
                            }`}
                          >
                            {k.is_active ? "Disable" : "Enable"}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteKey(k.id)}
                            className="p-2 rounded-md border border-brass/40 bg-brass/10 text-brass hover:bg-brass hover:text-text-1 transition cursor-pointer"
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
      {/* MODAL 1: LIVE ELO ADJUSTER (TACTICAL TERMINAL OVERHAUL)    */}
      {/* ========================================================= */}
      {eloModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 ">
          <div className="w-full max-w-[520px] rounded-md border-t-[1px] border-t-brass border-x border-b border-border bg-surface-1 p-6 sm:p-8 flex flex-col gap-5 text-text-1 shadow-none">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-[17px] font-mono font-bold text-text-1  tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brass" />
                  <span>Tactical ELO Override</span>
                </h3>
                <p className="text-[12px] text-text-3 font-mono mt-1">
                  Team: <span className="font-bold text-text-1">{eloModalTeam.name}</span> • Current ELO:{" "}
                  <span className="font-bold text-moss">{eloModalTeam.elo}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEloModalTeam(null)}
                className="w-11 h-11 rounded-md border border-border bg-bg-0 hover:bg-border flex items-center justify-center text-text-3 hover:text-text-1 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Adjust Presets (Severe Flat Rectangular Buttons) */}
            <div>
              <label className="text-[11px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                Quick Adjust Presets:
              </label>
              <div className="grid grid-cols-4 gap-2 font-mono">
                {[+100, +50, +25, +10, -10, -25, -50, -100].map((d) => {
                  const isPositive = d > 0;
                  const isSelected = eloDelta === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setEloDelta(d)}
                      className={`py-2 rounded-md font-bold text-[13px] border transition cursor-pointer ${
                        isSelected
                          ? "bg-brass text-text-1 border-brass"
                          : isPositive
                          ? "bg-bg-0 text-moss border-moss/40 hover:bg-moss/20"
                          : "bg-bg-0 text-brass border-brass/40 hover:bg-brass/20"
                      }`}
                    >
                      {isPositive ? `+${d}` : d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Delta Field */}
            <div>
              <label className="text-[11px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                Custom Delta Amount:
              </label>
              <input
                type="number"
                value={eloDelta}
                onChange={(e) => setEloDelta(Number(e.target.value))}
                className="w-full h-10 px-4 rounded-md border border-border bg-bg-0 font-mono font-bold text-[15px] text-text-1 focus:border-brass focus:outline-none transition"
              />
            </div>

            {/* Adjustment Reason: Horizontal Flex-Wrap Tactical Chips */}
            <div>
              <label className="text-[11px] font-mono font-bold  tracking-wider text-text-3 block mb-2">
                Adjustment Reason (Select Option):
              </label>
              <div className="flex flex-wrap gap-2 font-mono">
                {[
                  "Creative Social Engineering Exploit",
                  "Exceptional Prompt Engineering Technique",
                  "Organizer Discretionary Bonus",
                  "Rule Infraction / Anti-Tamper Penalty",
                  "Manual Score Recalibration",
                ].map((reasonOption) => {
                  const isSelected = eloReason === reasonOption;
                  return (
                    <button
                      key={reasonOption}
                      type="button"
                      onClick={() => setEloReason(reasonOption)}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold  tracking-wider transition cursor-pointer border ${
                        isSelected
                          ? "bg-brass text-text-1 border-brass"
                          : "bg-bg-0 text-text-3 border-border hover:text-text-1 hover:border-text-3"
                      }`}
                    >
                      {reasonOption}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary preview */}
            <div className="p-3.5 rounded-md bg-bg-0 border border-border font-mono text-[12px] flex items-center justify-between">
              <span className="text-text-3  font-bold">New Calculated ELO:</span>
              <span className="font-bold text-[16px] text-moss">
                {Math.max(0, eloModalTeam.elo + eloDelta)} ({eloDelta > 0 ? `+${eloDelta}` : eloDelta})
              </span>
            </div>

            {/* Action Buttons: Solid Crimson Confirm & Ghost Cancel */}
            <div className="flex items-center gap-3 pt-2 font-mono">
              <button
                type="button"
                onClick={() => setEloModalTeam(null)}
                className="flex-1 py-3 rounded-md border border-border bg-transparent hover:bg-border/50 font-bold text-[13px]  tracking-wider text-text-3 hover:text-text-1 cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyElo}
                disabled={busy}
                className="flex-1 py-3 rounded-md bg-brass hover:bg-brass/90 font-bold text-[13px]  tracking-wider text-text-1 cursor-pointer transition disabled:opacity-50"
              >
                {busy ? "Applying…" : "Confirm ELO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: SATCHEL CONTENTS / RELIC OVERRIDE MODAL           */}
      {/* ========================================================= */}
      {invModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 ">
          <div className="w-full max-w-[740px] max-h-[90vh] overflow-y-auto rounded-md border-t-[1px] border-t-brass border-x border-b border-border bg-surface-1 p-6 sm:p-8 flex flex-col gap-6 text-text-1 shadow-none font-mono">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-[17px] font-mono font-bold text-text-1  tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-moss" />
                  <span>Satchel Contents & Relic Override</span>
                </h3>
                <p className="text-[12px] text-text-3 font-mono mt-1">
                  Team: <span className="font-bold text-text-1">{invModalTeam.name}</span> • {invModalTeam.solved}/8 Verified Solved
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvModalTeam(null)}
                className="w-11 h-11 rounded-md border border-border bg-bg-0 hover:bg-border flex items-center justify-center text-text-3 hover:text-text-1 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Batch Actions Strip */}
            <div className="p-3 rounded-md bg-bg-0 border border-border flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-text-3  tracking-wider">
                Batch Edit All 8 Characters:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleBatchInventoryOverride("locked")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md bg-surface-1 border border-border text-text-3 hover:text-text-1 hover:bg-border text-[11px] font-bold  transition cursor-pointer disabled:opacity-50"
                >
                  Lock All
                </button>

                <button
                  type="button"
                  onClick={() => void handleBatchInventoryOverride("obtained")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md bg-bg-0 border border-border text-text-1 hover:bg-border text-[11px] font-bold  transition cursor-pointer disabled:opacity-50"
                >
                  Hold All
                </button>

                <button
                  type="button"
                  onClick={() => void handleBatchInventoryOverride("verified")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md bg-moss/10 border border-moss text-moss hover:bg-moss hover:text-bg-0 text-[11px] font-bold  transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Solve All</span>
                </button>
              </div>
            </div>

            {/* 2-Column Grid Layout for all 8 characters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
              {R1_BOTS.map((botId) => {
                const char = CHARACTERS[botId];
                const held = invModalTeam.inventory.find((i) => i.bot_id === botId);
                const currentStatus = held ? held.status : "locked";
                const isVerified = currentStatus === "verified";
                const isObtained = currentStatus === "obtained";

                return (
                  <div
                    key={botId}
                    className={`p-3.5 rounded-md flex flex-col justify-between gap-3 transition border ${
                      isVerified
                        ? "border-l-[4px] border-l-moss border-t border-r border-b border-border bg-bg-0"
                        : isObtained
                        ? "border-l-[4px] border-l-text-1 border-t border-r border-b border-border bg-bg-0"
                        : "border-l-[4px] border-l-border border-t border-r border-b border-border bg-bg-0"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-md bg-surface-1 border border-border overflow-hidden shrink-0">
                          <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-[13px] text-text-1 block truncate">{char.name}</span>
                          <span className="text-[11px] text-text-3 block truncate">{char.targetItem.name}</span>
                        </div>
                      </div>

                      {/* Iconography replacing repetitive text */}
                      <div className="shrink-0">
                        {isVerified ? (
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-moss/20 border border-moss text-moss" title="Verified Solved">
                            <ShieldCheck className="w-4 h-4 text-moss" />
                          </div>
                        ) : isObtained ? (
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-surface-1 border border-border text-text-1" title="Held in Satchel">
                            <Package className="w-4 h-4 text-text-1" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-surface-1 border border-border text-text-3" title="Locked">
                            <Lock className="w-4 h-4 text-text-3" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* High-Contrast Interactive Edit Buttons */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => void handleInventoryOverride(botId, char.targetItem.name, "locked")}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold  transition cursor-pointer ${
                          currentStatus === "locked"
                            ? "bg-border text-text-1 border border-border"
                            : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
                        }`}
                      >
                        Lock
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleInventoryOverride(botId, char.targetItem.name, "obtained")}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold  transition cursor-pointer ${
                          currentStatus === "obtained"
                            ? "bg-text-1 text-bg-0 font-bold"
                            : "bg-surface-1 border border-border text-text-3 hover:bg-border hover:text-text-1"
                        }`}
                      >
                        Held
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleInventoryOverride(botId, char.targetItem.name, "verified")}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-bold  transition cursor-pointer flex items-center justify-center gap-1 ${
                          currentStatus === "verified"
                            ? "bg-moss text-bg-0 font-bold"
                            : "bg-moss/10 border border-moss text-moss hover:bg-moss hover:text-bg-0"
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>Solve</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Footer: Ghost Cancel / Close */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setInvModalTeam(null)}
                className="w-full py-3 rounded-md border border-border bg-transparent hover:bg-border/50 text-text-3 hover:text-text-1 font-mono font-bold text-[13px]  tracking-wider cursor-pointer transition"
              >
                Close Satchel Overrides
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: COMMS & AI REASONING TRACES INSPECTOR            */}
      {/* ========================================================= */}
      {commsModalTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 ">
          <div className="w-full max-w-[860px] h-[85vh] rounded-md border-t-[1px] border-t-brass border-x border-b border-border bg-surface-1 p-6 sm:p-8 flex flex-col gap-5 text-text-1 shadow-none">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-[17px] font-mono font-bold text-text-1  tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-brass" />
                  <span>Comms & AI Reasoning Inspector</span>
                </h3>
                <p className="text-[12px] font-mono text-text-3 mt-1">
                  Team: <span className="font-bold text-text-1">{commsModalTeam.name}</span> • Chat Logs & Hidden AI Reasoning Traces
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommsModalTeam(null)}
                className="w-11 h-11 rounded-md border border-border bg-bg-0 hover:bg-border flex items-center justify-center text-text-3 hover:text-text-1 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Tabs and Tactical Target Bar */}
            <div className="flex flex-col gap-3 border-b border-border pb-3 font-mono">
              <div className="flex items-center gap-2 p-1 rounded-md bg-bg-0 border border-border self-start">
                <button
                  type="button"
                  onClick={() => setCommsTab("messages")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold  transition cursor-pointer ${
                    commsTab === "messages" ? "bg-brass text-text-1" : "text-text-3 hover:text-text-1"
                  }`}
                >
                  Chat Logs ({commsMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCommsTab("traces")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold  transition cursor-pointer ${
                    commsTab === "traces" ? "bg-brass text-text-1" : "text-text-3 hover:text-text-1"
                  }`}
                >
                  AI Reasoning Traces ({commsTraces.length})
                </button>
              </div>

              {/* Tactical Target Bar */}
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setCommsBotFilter("all")}
                  className={`px-3 py-1 rounded-md text-[11px] font-mono font-bold  tracking-wider transition cursor-pointer border ${
                    commsBotFilter === "all"
                      ? "bg-brass text-text-1 border-brass"
                      : "bg-bg-0 text-text-3 border-border hover:text-text-1 hover:border-text-3"
                  }`}
                >
                  Global
                </button>
                {R1_BOTS.map((b) => {
                  const charName = CHARACTERS[b]?.name ?? b;
                  const isSelected = commsBotFilter === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setCommsBotFilter(b)}
                      className={`px-3 py-1 rounded-md text-[11px] font-mono font-bold  tracking-wider transition cursor-pointer border ${
                        isSelected
                          ? "bg-brass text-text-1 border-brass"
                          : "bg-bg-0 text-text-3 border-border hover:text-text-1 hover:border-text-3"
                      }`}
                    >
                      {charName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 rounded-md bg-bg-0 border border-border flex flex-col gap-3 font-mono">
              {commsLoading ? (
                <div className="m-auto text-center text-text-3 font-bold text-[14px] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-brass" />
                  <span>Loading comms transcript…</span>
                </div>
              ) : commsTab === "messages" ? (
                commsMessages.length === 0 ? (
                  <p className="m-auto text-text-3 italic text-[13px]">No chat messages found for this query.</p>
                ) : (
                  commsMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-md max-w-[85%] text-[13px] flex flex-col gap-1.5 ${
                        msg.role === "user"
                          ? "ml-auto bg-surface-1 border border-border text-text-1"
                          : "mr-auto bg-surface-1 border border-border text-text-1"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] text-text-3 font-bold">
                        <div className="flex items-center gap-2">
                          <span>{msg.role === "user" ? "OPERATOR PROMPT" : `BOT: ${CHARACTERS[msg.bot_id as keyof typeof CHARACTERS]?.name ?? msg.bot_id}`}</span>
                        </div>
                        <span>{msg.created_at.slice(11, 19)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed font-sans">{msg.text_final}</p>
                    </div>
                  ))
                )
              ) : (
                commsTraces.length === 0 ? (
                  <p className="m-auto text-text-3 italic text-[13px]">No internal reasoning traces recorded.</p>
                ) : (
                  commsTraces.map((trace) => {
                    let traceObj: any = {};
                    let guardObj: any = {};
                    try { traceObj = JSON.parse(trace.trace_json); } catch {}
                    try { guardObj = JSON.parse(trace.guard_json); } catch {}

                    return (
                      <div key={trace.id} className="p-4 rounded-md border border-border bg-surface-1 flex flex-col gap-2 font-mono">
                        <div className="flex items-center justify-between text-[11px] font-bold text-text-3">
                          <span>Bot: {trace.bot_id} • Phase: {trace.phase}</span>
                          <span>Latency: {traceObj.ms ? `${traceObj.ms}ms` : "N/A"} • {trace.created_at.slice(11, 19)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md  ${
                            guardObj.risk === "flagged" ? "bg-brass/10 border border-brass text-brass" : "bg-moss/10 border border-moss text-moss"
                          }`}>
                            Guard: {guardObj.risk || "clean"}
                          </span>
                        </div>
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
                className="w-full py-3 rounded-md border border-border bg-transparent hover:bg-border/50 text-text-3 hover:text-text-1 font-mono font-bold text-[13px]  tracking-wider cursor-pointer transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: EMERGENCY REWIND CONFIRMATION (TERMINAL OVERHAUL) */}
      {/* ========================================================= */}
      {rewindConfirmTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 ">
          <div className="w-full max-w-[520px] rounded-md border-t-[1px] border-t-brass border-x border-b border-border bg-surface-1 p-6 sm:p-8 flex flex-col gap-5 text-text-1 font-mono shadow-none">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-[17px] font-bold text-brass  tracking-wider flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  <span>Force Context Rewind</span>
                </h3>
                <p className="text-[12px] text-text-3 mt-1">
                  Team: <span className="font-bold text-text-1">{rewindConfirmTeam.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRewindConfirmTeam(null)}
                className="w-11 h-11 rounded-md border border-border bg-bg-0 hover:bg-border flex items-center justify-center text-text-3 hover:text-text-1 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-text-3 font-sans">
              This operation purges conversation memory for this team on the target bot, resetting engagement state.
            </p>

            {/* Target Bot Input: Horizontal Flex-Wrap Tactical Chips */}
            <div>
              <label className="text-[11px] font-bold  tracking-wider text-text-3 block mb-2">
                Target Bot to Reset (Select Option):
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRewindBot("all")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold  tracking-wider transition cursor-pointer border ${
                    rewindBot === "all"
                      ? "bg-brass text-text-1 border-brass"
                      : "bg-bg-0 text-text-3 border-border hover:text-text-1 hover:border-text-3"
                  }`}
                >
                  All Characters (Full Team Wipe)
                </button>
                {R1_BOTS.map((b) => {
                  const isSelected = rewindBot === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setRewindBot(b)}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold  tracking-wider transition cursor-pointer border ${
                        isSelected
                          ? "bg-brass text-text-1 border-brass"
                          : "bg-bg-0 text-text-3 border-border hover:text-text-1 hover:border-text-3"
                      }`}
                    >
                      {CHARACTERS[b].name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional ELO Penalty Field */}
            <div>
              <label className="text-[11px] font-bold  tracking-wider text-text-3 block mb-2">
                Optional ELO Penalty Deduction:
              </label>
              <input
                type="number"
                min={0}
                value={rewindPenalty}
                onChange={(e) => setRewindPenalty(Number(e.target.value))}
                className="w-full h-10 px-4 rounded-md border border-border bg-bg-0 font-mono font-bold text-[15px] text-text-1 focus:border-brass focus:outline-none transition"
              />
            </div>

            {/* Action Buttons: Solid Crimson Confirm & Ghost Cancel */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRewindConfirmTeam(null)}
                className="flex-1 py-3 rounded-md border border-border bg-transparent hover:bg-border/50 font-bold text-[13px]  tracking-wider text-text-3 hover:text-text-1 cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRewind}
                disabled={busy}
                className="flex-1 py-3 rounded-md bg-brass hover:bg-brass/90 font-bold text-[13px]  tracking-wider text-text-1 cursor-pointer transition disabled:opacity-50"
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

