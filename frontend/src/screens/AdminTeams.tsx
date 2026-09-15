import { useState, useEffect, useMemo } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { createTeam, type CreateTeamResult } from "@/api/teams";
import { getGates, openVault, endRound1, startRound1, startRound2, stopRound2, extendRound2, type Gates } from "@/api/gates";
import { apiFetch } from "@/api/client";
import { CHARACTERS } from "@/data/characterLore";
import AssessmentControls from "@/components/AssessmentControls";
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
  is_qualified: number;
  created_at: string;
  members: AdminMember[];
  inventory: AdminInventoryItem[];
  solved: number;
  lastActivity: string;
  locks?: Record<string, { displayName: string; since: string }>;
}

interface Round2State {
  status: "off" | "countdown" | "active";
  timeLeft: number;
  duration: number;
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
  const [round2, setRound2] = useState<Round2State>({ status: "off", timeLeft: 0, duration: 1800 });
  const [roundDurationMins, setRoundDurationMins] = useState(30);
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

  // WS for live telemetry
  useEffect(() => {
    if (!authed || adminCode === "") return;
    let wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      const p = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${p}//${window.location.host}/ws`;
    }
    wsUrl += `?token=${encodeURIComponent(adminCode)}`;
    
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.event === "admin_telemetry") {
          setSystemHealth(prev => prev ? { ...prev, tokenMetrics: ev.data } : null);
        }
      } catch {}
    };
    return () => ws.close();
  }, [authed, adminCode]);

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
          const data = (await resOverview.json()) as { teams: AdminTeamOverview[]; round2?: Round2State };
          setTeams(data.teams);
          if (data.round2) {
            setRound2(data.round2);
          }
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

  // Tick round2 timer locally between polls
  useEffect(() => {
    if (round2.status === "off") return;
    const tick = setInterval(() => {
      setRound2((prev) => {
        if (prev.status === "off") return prev;
        const next = Math.max(0, prev.timeLeft - 1);
        if (next <= 0) return { ...prev, status: "off", timeLeft: 0 };
        return { ...prev, timeLeft: next };
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [round2.status]);

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

  async function handleToggleQualify(teamId: string, current: number): Promise<void> {
    if (adminCode === "") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/qualify-team", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": adminCode },
        body: JSON.stringify({ teamId, qualified: current === 0 }),
      });
      if (res.ok) {
        notify(current === 0 ? "Team Qualified for R2" : "Team Disqualified");
        setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, is_qualified: current === 0 ? 1 : 0 } : t)));
      } else {
        const d = (await res.json()) as { error?: string };
        alert(d.error ?? "Failed to toggle qualification");
      }
    } catch {
      alert("Request failed");
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
          const data = (await overviewRes.json()) as { teams: AdminTeamOverview[]; round2?: Round2State };
          setTeams(data.teams);
          if (data.round2) setRound2(data.round2);
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#18181B] p-6 text-[#F4F4F5] font-sans">
        <div className="w-full max-w-[440px] rounded-[2px] border border-[#3F3F46] bg-[#27272A] p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
              <Lock className="h-6 w-6 text-[#EF4444]" />
            </span>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-[#A1A1AA]">
              REDLINE // PROVOCATEUR COMMAND
            </p>
            <h1 className="font-mono text-[24px] font-bold text-[#F4F4F5] uppercase">
              Command Auth
            </h1>
            <p className="mt-1 max-w-[320px] text-[13px] text-[#A1A1AA]">
              Strike Teams, Guardrail Bypass, and Sector controls.
            </p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between text-[12px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                <span>Command Access Code</span>
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#A1A1AA]">
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
                  className="h-12 w-full rounded-[2px] border border-[#3F3F46] bg-[#18181B] pl-10 pr-11 font-mono text-[14px] text-[#F4F4F5] placeholder:text-[#A1A1AA]/40 focus:border-[#EF4444] focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthCode(!showAuthCode)}
                  tabIndex={-1}
                  aria-label={showAuthCode ? "Hide code" : "Show code"}
                  className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center pr-3.5 text-[#A1A1AA] hover:text-[#F4F4F5] transition"
                >
                  {showAuthCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="flex items-center gap-2 rounded-[2px] border border-[#EF4444] bg-[#EF4444]/10 px-4 py-3 text-[12px] font-mono text-[#EF4444]">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || !authInput.trim()}
              className="mt-2 flex h-12 min-h-[48px] w-full items-center justify-center gap-2 rounded-[2px] bg-[#EF4444] text-[14px] font-bold text-[#F4F4F5] uppercase tracking-wider hover:bg-[#EF4444]/90 disabled:opacity-50 transition cursor-pointer"
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

          <div className="mt-6 flex items-center justify-center border-t border-[#3F3F46] pt-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-[12px] font-mono text-[#A1A1AA] hover:text-[#F4F4F5] transition"
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
    <div className="flex min-h-screen flex-col bg-[#18181B] text-[#F4F4F5] font-sans">
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-[2px] border border-[#10B981] bg-[#27272A] px-5 py-4 text-[14px] font-semibold text-[#10B981] shadow-none">
          <Check className="w-5 h-5 text-[#10B981]" />
          <span>{successToast}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between border-b border-[#3F3F46] bg-[#27272A] px-6 py-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="block h-8 w-[3px] bg-[#EF4444]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-[20px] font-bold tracking-[0.1em] text-[#F4F4F5] uppercase">
                COMMAND HUB
              </h1>
              <span className="flex items-center gap-1 rounded-[2px] border border-[#10B981]/50 bg-[#18181B] px-2 py-0.5 font-mono text-[11px] font-bold text-[#10B981] uppercase">
                <Radio className="w-3 h-3 text-[#10B981]" />
                <span>Telemetry Live</span>
              </span>
            </div>
            <p className="text-[12px] text-[#A1A1AA]">
              Squads, Relic Solves & Gate Controls
            </p>
          </div>
        </div>

        {/* System Health Quick Strip & Auth controls */}
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          {systemHealth && (
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-[2px] bg-[#18181B] border border-[#3F3F46] font-mono text-[12px] font-bold text-[#A1A1AA]">
              <span className="flex items-center gap-1.5 text-[#10B981]">
                <span className="w-2 h-2 rounded-none bg-[#10B981]" />
                <span>{systemHealth.activeConnections} Clients</span>
              </span>
              <span>•</span>
              <span className="text-[#F4F4F5]">Groq & Zen OK</span>
            </div>
          )}

          {/* Admin Authorized Pill */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-[2px] bg-[#18181B] border border-[#3F3F46] text-[#10B981] font-mono text-[12px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="hidden sm:inline uppercase">Command Active</span>
          </div>

          {/* Lock HQ Button */}
          <button
            type="button"
            onClick={handleLock}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] text-[12px] font-mono font-bold transition cursor-pointer"
            title="Lock Admin Session and Require Access Code"
          >
            <Lock className="w-3.5 h-3.5 text-[#A1A1AA]" />
            <span>Lock</span>
          </button>

          {/* Exit HQ Button */}
          <a
            href="/"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] text-[12px] font-mono font-bold transition"
            title="Exit to Arena"
          >
            <LogOut className="w-3.5 h-3.5 text-[#A1A1AA]" />
            <span className="hidden sm:inline">Exit</span>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto p-6 sm:p-8 lg:p-10 flex flex-col gap-8">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3F3F46] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("squads")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "squads"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Squads & Controls ({teams.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("stream")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "stream"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Live Stream ({activityStream.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("broadcast")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "broadcast"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <Megaphone className="w-4 h-4" />
              <span>Global Broadcast</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("create")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "create"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Squad</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("gates")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "gates"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Gates & Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("diagnostics")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "diagnostics"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Diagnostics</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-[2px] text-[13px] font-bold uppercase tracking-wider font-mono transition cursor-pointer ${
                tab === "settings"
                  ? "bg-[#EF4444] text-[#F4F4F5] border border-[#EF4444]"
                  : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
              }`}
            >
              <KeyRound className="w-4 h-4 text-[#10B981]" />
              <span>API Pool {settingsUnlocked ? "🔓" : "🔒"}</span>
            </button>
          </div>

          {/* Projector Board Link */}
          <a
            href="/admin/board"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-[2px] border border-[#EF4444] bg-[#18181B] text-[#EF4444] font-mono text-[13px] font-bold uppercase tracking-wider hover:bg-[#EF4444] hover:text-[#F4F4F5] transition"
          >
            <Trophy className="w-4 h-4" />
            <span>Leaderboard ↗</span>
          </a>
        </div>

        {/* Global Key Metrics Strip - Doubled Padding, Sharp Edges, Monospace Telemetry */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A]">
            <span className="text-[11px] font-mono font-bold text-[#A1A1AA] uppercase tracking-wider">Total Squads</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-[#F4F4F5]">{teams.length}</span>
              <Users className="w-5 h-5 text-[#A1A1AA]" />
            </div>
          </div>

          <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A]">
            <span className="text-[11px] font-mono font-bold text-[#A1A1AA] uppercase tracking-wider">Operators</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-[#F4F4F5]">{totalMembers}</span>
              <Activity className="w-5 h-5 text-[#10B981]" />
            </div>
          </div>

          <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A]">
            <span className="text-[11px] font-mono font-bold text-[#A1A1AA] uppercase tracking-wider">Relic Solves</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-[#10B981]">{totalSolves}</span>
              <ShieldCheck className="w-5 h-5 text-[#10B981]" />
            </div>
          </div>

          <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A]">
            <span className="text-[11px] font-mono font-bold text-[#A1A1AA] uppercase tracking-wider">Peak ELO</span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[28px] font-bold text-[#F4F4F5]">{highestElo}</span>
              <Trophy className="w-5 h-5 text-[#EF4444]" />
            </div>
          </div>

          <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A]" title={`Prompt: ${(systemHealth?.promptTokens ?? 0).toLocaleString()} | Completion: ${(systemHealth?.completionTokens ?? 0).toLocaleString()}`}>
            <span className="text-[11px] font-mono font-bold text-[#A1A1AA] uppercase tracking-wider">Total Tokens</span>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <span className="font-mono text-[24px] font-bold text-[#F4F4F5]">
                  {(systemHealth?.totalTokens ?? 0) >= 1_000_000
                    ? `${((systemHealth?.totalTokens ?? 0) / 1_000_000).toFixed(2)}M`
                    : (systemHealth?.totalTokens ?? 0) >= 10_000
                    ? `${((systemHealth?.totalTokens ?? 0) / 1_000).toFixed(1)}k`
                    : (systemHealth?.totalTokens ?? 0).toLocaleString()}
                </span>
                <span className="block text-[10px] font-mono text-[#A1A1AA]">
                  {((systemHealth?.promptTokens ?? 0) / 1000).toFixed(1)}k in · {((systemHealth?.completionTokens ?? 0) / 1000).toFixed(1)}k out
                </span>
              </div>
              <Cpu className="w-5 h-5 text-[#A1A1AA]" />
            </div>
          </div>

          <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A]" title={`Current: ${systemHealth?.currentTps ?? 0} tps | Peak: ${systemHealth?.peakTps ?? 0} tps | Avg: ${systemHealth?.averageTps ?? 0} tps`}>
            <span className="text-[11px] font-mono font-bold text-[#A1A1AA] uppercase tracking-wider">Speed (TPS)</span>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-[24px] font-bold text-[#F4F4F5]">
                    {systemHealth?.currentTps ?? 0}
                  </span>
                  <span className="text-[11px] font-bold text-[#A1A1AA]">
                    TPS
                  </span>
                  <span className={`inline-block h-2 w-2 rounded-none ${(systemHealth?.currentTps ?? 0) > 0 ? "bg-[#10B981]" : "bg-[#A1A1AA]"}`} />
                </div>
                <span className="block text-[10px] font-mono text-[#A1A1AA]">
                  Peak: {systemHealth?.peakTps ?? 0} tps
                </span>
              </div>
              <Zap className="w-5 h-5 text-[#EF4444]" />
            </div>
          </div>
        </div>

        {/* TAB 1: SQUADS & DIRECT COMMAND CONTROLS */}
        {tab === "squads" && (
          <div className="flex flex-col gap-6">
            {/* Search filter */}
            <div className="flex items-center gap-3 p-3 px-5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] max-w-[480px]">
              <Search className="w-4 h-4 text-[#A1A1AA]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Squad by name or join code..."
                className="w-full bg-transparent text-[14px] focus:outline-none text-[#F4F4F5] placeholder:text-[#A1A1AA]/50 font-medium"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="text-[#A1A1AA] hover:text-[#F4F4F5] font-mono text-[12px] cursor-pointer">
                  Clear
                </button>
              )}
            </div>

            {filteredTeams.length === 0 ? (
              <div className="p-12 text-center rounded-[2px] border border-[#3F3F46] bg-[#27272A] text-[#A1A1AA]">
                <Users className="w-12 h-12 mb-3 mx-auto text-[#A1A1AA]/40" />
                <p className="font-mono font-bold text-[18px] text-[#F4F4F5] uppercase">No Squads Match Query</p>
                <p className="text-[13px] mt-1">Verify search term or create a new squad using the "Create Squad" tab.</p>
              </div>
            ) : (
              filteredTeams.map((t) => (
                <div key={t.id} className="rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col overflow-hidden transition">
                  {/* Single Horizontal Top Bar Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[#18181B] border-b border-[#3F3F46]">
                    {/* Left: Squad Name + Join Code */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#EF4444] font-mono font-bold text-[15px] shrink-0">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-mono text-[17px] font-bold text-[#F4F4F5] uppercase tracking-wider">
                          {t.name}
                        </h3>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-[#27272A] border border-[#3F3F46] font-mono text-[12px]">
                          <KeyRound className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                          <span className="text-[#A1A1AA] uppercase text-[10px] font-bold">Hint/Code:</span>
                          <span className="font-bold text-[#10B981] tracking-wider select-all">
                            {t.join_code || t.hint}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyCode(t.join_code || t.hint)}
                            className="p-0.5 hover:bg-[#3F3F46] rounded-[2px] text-[#10B981] cursor-pointer transition ml-0.5"
                            title="Copy join code"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: ELO Rating & Unified Action Button Group */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-[2px] bg-[#27272A] border border-[#3F3F46] font-mono">
                        <span className="text-[10px] font-bold text-[#A1A1AA] uppercase">ELO:</span>
                        <span className="text-[16px] font-bold text-[#F4F4F5]">{t.elo}</span>
                      </div>

                      {/* Power Controls Button Group */}
                      <div className="flex items-center border border-[#3F3F46] rounded-[2px] overflow-hidden bg-[#27272A] divide-x divide-[#3F3F46]">
                        <button
                          type="button"
                          onClick={() => void handleToggleQualify(t.id, t.is_qualified)}
                          disabled={busy}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#F4F4F5] transition cursor-pointer disabled:opacity-50 ${t.is_qualified ? "bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981]" : "hover:bg-[#3F3F46]"}`}
                          title={t.is_qualified ? "Qualified for Round 2 (Click to revoke)" : "Not qualified (Click to qualify)"}
                        >
                          <Trophy className={`w-3.5 h-3.5 ${t.is_qualified ? "text-[#10B981]" : "text-[#A1A1AA]"}`} />
                          <span>{t.is_qualified ? "R2 Qualified" : "Qualify"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEloModalTeam(t);
                            setEloDelta(50);
                            setEloReason("Creative Social Engineering Exploit");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#F4F4F5] hover:bg-[#3F3F46] transition cursor-pointer"
                          title="Adjust team ELO rating"
                        >
                          <Sliders className="w-3.5 h-3.5 text-[#EF4444]" />
                          <span>Adjust ELO</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInvModalTeam(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#F4F4F5] hover:bg-[#3F3F46] transition cursor-pointer"
                          title="Inspect & override backpack relics"
                        >
                          <Package className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>Relic Override</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCommsModalTeam(t);
                            setCommsBotFilter("all");
                            setCommsTab("messages");
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#F4F4F5] hover:bg-[#3F3F46] transition cursor-pointer"
                          title="Inspect chat messages and hidden AI reasoning traces"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#F4F4F5]" />
                          <span>Inspect</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRewindConfirmTeam(t);
                            setRewindBot("all");
                            setRewindPenalty(0);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[#EF4444] hover:bg-[#EF4444] hover:text-[#F4F4F5] transition cursor-pointer"
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
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wider bg-[#EF4444] text-[#F4F4F5] hover:bg-[#EF4444]/90 transition cursor-pointer disabled:opacity-50"
                            title="Permanently reset this squad"
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
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-brass-ink)]">
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
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA]">
                        Operator Activity:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {t.members.map((m) => (
                          <div key={m.display_name} className="px-3 py-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0 shadow-[0_0_6px_#10B981]" />
                              <span className="font-bold text-[13px] text-[#F4F4F5] truncate">{m.display_name}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] shrink-0">
                              {m.contribution} msgs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Held Relics (Row of small, dark, inline badges/chips reflecting real-time override status) */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA]">
                          Held Relics ({t.inventory.filter((i) => i.status === "obtained" || i.status === "verified").length}/8 Held • {t.solved}/8 Solved):
                        </span>
                      </div>
                      <div className="p-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex flex-wrap gap-1.5 items-center min-h-[42px]">
                        {t.inventory.filter((i) => i.status === "obtained" || i.status === "verified").length === 0 ? (
                          <span className="text-[11px] font-mono text-[#A1A1AA]/50 italic">No active relics in satchel</span>
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
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border text-[11px] font-mono font-bold transition ${
                                    isVerified
                                      ? "bg-[#10B981]/15 border-[#10B981] text-[#10B981]"
                                      : "bg-[#27272A] border-[#F4F4F5] text-[#F4F4F5]"
                                  }`}
                                >
                                  {isVerified ? (
                                    <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                                  ) : (
                                    <Package className="w-3.5 h-3.5 text-[#F4F4F5] shrink-0" />
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
                <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase">
                  Live Stream Audit Trail
                </h2>
                <p className="text-[13px] text-[#A1A1AA] mt-1">
                  Real-time chronological audit trail of all Relic Solves, ELO adjustments, and security flags.
                </p>
              </div>
              <span className="px-3.5 py-1.5 rounded-[2px] bg-[#27272A] border border-[#3F3F46] font-mono text-[12px] font-bold text-[#10B981] uppercase">
                Auto-sync 3s
              </span>
            </div>

            <div className="flex flex-col gap-3 mt-2">
              {activityStream.length === 0 ? (
                <div className="p-10 text-center rounded-[2px] border border-[#3F3F46] bg-[#27272A] font-mono text-[#A1A1AA]">
                  No stream audit events recorded.
                </div>
              ) : (
                activityStream.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-4 px-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex items-center justify-between gap-4 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-9 h-9 rounded-[2px] shrink-0 border ${
                        evt.type === "solve"
                          ? "bg-[#10B981]/10 border-[#10B981] text-[#10B981]"
                          : evt.type === "security"
                          ? "bg-[#EF4444]/10 border-[#EF4444] text-[#EF4444]"
                          : "bg-[#18181B] border-[#3F3F46] text-[#F4F4F5]"
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
                          <span className="font-bold text-[15px] text-[#F4F4F5]">{evt.teamName}</span>
                          <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded-[2px] bg-[#18181B] border border-[#3F3F46] text-[#A1A1AA]">
                            {evt.type === "solve" ? "RELIC SOLVED" : evt.type}
                          </span>
                        </div>
                        <p className="text-[13px] text-[#A1A1AA] mt-1">{evt.detail}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#A1A1AA] font-mono shrink-0">
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
            <div className="p-8 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col gap-6">
              <div>
                <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase flex items-center gap-3">
                  <Megaphone className="w-6 h-6 text-[#EF4444]" />
                  <span>Global Broadcast Station</span>
                </h2>
                <p className="text-[13px] text-[#A1A1AA] mt-1">
                  Dispatch an instant announcement banner to all active operator terminals.
                </p>
              </div>

              <form onSubmit={handleSendBroadcast} className="flex flex-col gap-5">
                <div>
                  <label className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                    Broadcast Message:
                  </label>
                  <textarea
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    placeholder="ATTENTION OPERATORS: Round 1 ending soon. Complete relic solves before gate closure."
                    rows={3}
                    className="w-full p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[14px] text-[#F4F4F5] placeholder:text-[#A1A1AA]/40 focus:border-[#EF4444] focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                      Severity Level:
                    </label>
                    <select
                      value={broadcastLevel}
                      onChange={(e) => setBroadcastLevel(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[13px] font-mono font-bold text-[#F4F4F5] focus:border-[#EF4444] focus:outline-none transition"
                    >
                      <option value="info">Standard Transmission (Info)</option>
                      <option value="warning">Urgent Priority (Warning)</option>
                      <option value="alert">Critical Threat (Alert Flash)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                      Broadcast CallSign:
                    </label>
                    <input
                      value={broadcastSender}
                      onChange={(e) => setBroadcastSender(e.target.value)}
                      placeholder="ARENA MARSHAL"
                      className="w-full h-11 px-3 rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[13px] font-mono font-bold text-[#F4F4F5] focus:border-[#EF4444] focus:outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || broadcastMsg.trim() === ""}
                  className="mt-2 py-4 px-6 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[14px] uppercase tracking-wider disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4" />
                  <span>{busy ? "Transmitting…" : "Dispatch Global Broadcast"}</span>
                </button>
              </form>
            </div>

            {/* Broadcast History */}
            {announcements.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] px-1">
                  Recent Broadcast Logs:
                </span>
                <div className="flex flex-col gap-2.5">
                  {announcements.map((a) => (
                    <div key={a.id} className="p-4 px-5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] text-[13px] flex items-center justify-between gap-3 font-mono">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-[2px] font-bold text-[11px] uppercase ${
                          a.level === "alert" ? "bg-[#EF4444] text-[#F4F4F5]" : a.level === "warning" ? "bg-[#27272A] border border-[#EF4444] text-[#EF4444]" : "bg-[#18181B] text-[#A1A1AA]"
                        }`}>
                          {a.level}
                        </span>
                        <span className="font-bold text-[#F4F4F5]">{a.sender || "HQ"}:</span>
                        <span className="text-[#A1A1AA] font-sans font-medium">{a.message}</span>
                      </div>
                      <span className="text-[11px] text-[#A1A1AA] shrink-0">
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
          <div className="max-w-[620px] mx-auto w-full p-8 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col gap-6">
            <div>
              <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase">
                Create New Squad
              </h2>
              <p className="text-[13px] text-[#A1A1AA] mt-1">
                Generates a confidential join code shown once. Issue directly to team lead.
              </p>
            </div>

            <form onSubmit={handleCreateTeam} className="flex flex-col gap-5">
              <div>
                <label className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                  Squad Name:
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CyberVanguard"
                  className="w-full h-11 px-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[15px] text-[#F4F4F5] placeholder:text-[#A1A1AA]/40 focus:border-[#EF4444] focus:outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA]">
                    Operators ({memberInputs.length} of 3 • min 2, max 3):
                  </label>
                  {memberInputs.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddMember}
                      className="flex items-center gap-1 text-[11px] font-mono font-bold uppercase text-[#F4F4F5] bg-[#18181B] px-3 py-1 rounded-[2px] border border-[#3F3F46] hover:bg-[#3F3F46] cursor-pointer transition"
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
                          className="w-full h-11 px-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[15px] text-[#F4F4F5] placeholder:text-[#A1A1AA]/40 focus:border-[#EF4444] focus:outline-none transition"
                        />
                      </div>
                      {memberInputs.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(idx)}
                          aria-label={`Remove Operator ${idx + 1}`}
                          title="Remove operator"
                          className="h-11 w-11 shrink-0 flex items-center justify-center rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[#A1A1AA] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition cursor-pointer"
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
                className="mt-2 py-4 px-6 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[14px] uppercase tracking-wider disabled:opacity-50 transition cursor-pointer"
              >
                {busy ? "Enrolling…" : "Generate Squad Join Code"}
              </button>
            </form>

            {/* Created Code Alert */}
            {created && (
              <div className="p-6 rounded-[2px] border border-[#10B981] bg-[#18181B] text-[#10B981] flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-mono font-bold uppercase tracking-wider text-[#10B981]">
                    Confidential Join Code (Single Display):
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCode(created.code)}
                    className="flex items-center gap-1 text-[12px] font-mono font-bold text-[#10B981] cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? "Copied!" : "Copy Code"}</span>
                  </button>
                </div>

                <div className="font-mono text-[32px] font-bold tracking-widest text-[#10B981] text-center py-3 bg-[#27272A] rounded-[2px] border border-[#3F3F46]">
                  {created.code}
                </div>

                <p className="text-[13px] font-mono text-[#10B981] text-center">
                  Team: <span className="font-bold text-[#F4F4F5]">{created.name}</span> • Join Hint:{" "}
                  <span className="font-bold">{created.hint}</span>
                </p>
              </div>
            )}

            {error && (
              <p className="text-[13px] font-mono text-[#EF4444] text-center">{error}</p>
            )}
          </div>
        )}

        {/* TAB 5: GATES & VAULT */}
        {tab === "gates" && (
          <div className="max-w-[660px] mx-auto w-full p-8 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col gap-6">
            <div>
              <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase">
                Gates & Vault Controls
              </h2>
              <p className="text-[13px] text-[#A1A1AA] mt-1">
                Oversee Round 1 qualification status and authorize the Round 2 Nether Vault opening.
              </p>
            </div>

            {gates && (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-3 gap-4 font-mono">
                  <div className="p-5 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Round 1</span>
                    <p className="mt-2 font-bold text-[16px] text-[#F4F4F5]">
                      {gates.round1Open ? "ACTIVE" : "FROZEN"}
                    </p>
                  </div>
                  <div className="p-5 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Vault</span>
                    <p className="mt-2 font-bold text-[16px] text-[#F4F4F5]">
                      {gates.vaultOpen ? "OPEN" : "SEALED"}
                    </p>
                  </div>
                  <div className="p-5 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Round 2</span>
                    <p className={`mt-2 font-bold text-[16px] ${round2.status === "active" ? "text-[#10B981]" : round2.status === "countdown" ? "text-[#F59E0B]" : "text-[#F4F4F5]"}`}>
                      {round2.status === "active" ? "ACTIVE" : round2.status === "countdown" ? "COUNTDOWN" : "OFF"}
                    </p>
                  </div>
                </div>

                {/* Round 2 Timer Display */}
                {round2.status !== "off" && (
                  <div className="p-5 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#A1A1AA] uppercase font-mono">
                        {round2.status === "countdown" ? "Starts In" : "Time Remaining"}
                      </span>
                      <span className="text-[11px] font-bold text-[#A1A1AA] uppercase font-mono">
                        Total: {Math.floor(round2.duration / 60)}m
                      </span>
                    </div>
                    <p className="font-mono text-[36px] font-bold text-[#10B981] tracking-wider">
                      {Math.floor(round2.timeLeft / 60)}:{String(round2.timeLeft % 60).padStart(2, "0")}
                    </p>
                    {round2.status === "active" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await extendRound2(adminCode, 300);
                            notify("Extended Round 2 by 5 minutes");
                          }}
                          className="px-3 py-1.5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[11px] font-bold uppercase transition cursor-pointer"
                        >
                          +5 min
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await extendRound2(adminCode, 600);
                            notify("Extended Round 2 by 10 minutes");
                          }}
                          className="px-3 py-1.5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[11px] font-bold uppercase transition cursor-pointer"
                        >
                          +10 min
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await extendRound2(adminCode, 1800);
                            notify("Extended Round 2 by 30 minutes");
                          }}
                          className="px-3 py-1.5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[11px] font-bold uppercase transition cursor-pointer"
                        >
                          +30 min
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-4 border-t border-[#3F3F46]">
                  {round2.status === "off" && (
                    <label className="flex flex-col gap-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] p-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                      Round duration (minutes)
                      <input type="number" min="1" max="1440" value={roundDurationMins} onChange={(e) => setRoundDurationMins(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))} className="h-10 w-full rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-3 font-mono text-[#F4F4F5] focus:border-[#EF4444] focus:outline-none" />
                    </label>
                  )}
                  {gates.round1.status === "not_started" && (
                    <div className="flex flex-col gap-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] p-3">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await startRound1(adminCode, roundDurationMins * 60);
                            setGates(await getGates());
                            notify(`Round 1 scheduled: 30s countdown, then ${roundDurationMins} minutes.`);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Could not start Round 1.");
                          }
                        }}
                        className="py-3 px-4 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider transition cursor-pointer"
                      >
                        Start Round 1 (30s countdown)
                      </button>
                    </div>
                  )}
                  {round2.status === "off" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await startRound2(adminCode, roundDurationMins * 60);
                          const g = await getGates();
                          setGates(g);
                          notify(`Round 2 scheduled: 30s countdown, then ${roundDurationMins} minutes.`);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not start Round 2.");
                        }
                      }}
                      className="py-4 px-4 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[14px] uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Unlock className="w-4 h-4" />
                      <span>Start Round 2 (30s countdown)</span>
                    </button>
                  )}

                  {round2.status !== "off" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await stopRound2(adminCode);
                        const g = await getGates();
                        setGates(g);
                        notify("Round 2 stopped!");
                      }}
                      className="py-3.5 px-4 rounded-[2px] border border-[#EF4444] bg-[#EF4444]/10 hover:bg-[#EF4444]/20 text-[#EF4444] font-mono font-bold text-[13px] uppercase tracking-wider transition cursor-pointer"
                    >
                      Stop Round 2
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      await endRound1(adminCode);
                      setGates(await getGates());
                      notify("Round 1 submissions frozen!");
                    }}
                    className="py-3.5 px-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider transition cursor-pointer"
                  >
                    Freeze / End Round 1 Only
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SYSTEM DIAGNOSTICS */}
        {tab === "diagnostics" && (
          <div className="max-w-[860px] mx-auto w-full flex flex-col gap-6">
            {systemHealth && (
              <div className="p-8 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col gap-6">
                <div>
                  <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase flex items-center gap-3">
                    <Cpu className="w-6 h-6 text-[#EF4444]" />
                    <span>System Diagnostics & LLM Status</span>
                  </h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">
                    Single-process LAN runtime status, model connectivity, and SQLite storage statistics.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono">
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Uptime</span>
                    <p className="text-[16px] font-bold text-[#F4F4F5] mt-1">
                      {Math.floor(systemHealth.uptime / 60)}m {systemHealth.uptime % 60}s
                    </p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">RAM Footprint</span>
                    <p className="text-[16px] font-bold text-[#F4F4F5] mt-1">{systemHealth.memoryUsageMb} MB</p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Active Sockets</span>
                    <p className="text-[16px] font-bold text-[#10B981] mt-1">{systemHealth.activeConnections} WS</p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Groq Cloud (R1)</span>
                    <p className="text-[16px] font-bold text-[#10B981] mt-1">Ready</p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">OpenCode Zen (R2)</span>
                    <p className="text-[16px] font-bold text-[#10B981] mt-1">Ready</p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Chat Logs</span>
                    <p className="text-[16px] font-bold text-[#F4F4F5] mt-1">{systemHealth.messagesCount}</p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Total Tokens</span>
                    <p className="text-[16px] font-bold text-[#F4F4F5] mt-1 font-mono">
                      {(systemHealth.totalTokens ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B]">
                    <span className="text-[11px] font-bold text-[#A1A1AA] uppercase">Throughput</span>
                    <p className="text-[16px] font-bold text-[#F4F4F5] mt-1 font-mono">
                      {systemHealth.currentTps ?? 0} TPS
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#3F3F46] flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                  >
                    <Database className="w-4 h-4" />
                    <span>Create DB Snapshot (.db)</span>
                  </button>

                  <a
                    href={`/api/admin/export.json?x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider flex items-center gap-2 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON Dump</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=elo_log&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: ELO Log</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=chat_logs&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[12px] flex items-center gap-1.5 transition"
                  >
                    <span>CSV: Chat Logs</span>
                  </a>

                  <a
                    href={`/api/admin/export.csv?table=team_inventory&x-admin-code=${adminCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[12px] flex items-center gap-1.5 transition"
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
            <AssessmentControls adminCode={adminCode} />
            {!settingsUnlocked ? (
              <div className="p-10 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col items-center text-center max-w-[520px] mx-auto">
                <div className="w-16 h-16 rounded-[2px] bg-[#18181B] border border-[#3F3F46] text-[#EF4444] flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase">
                  API Settings Locked
                </h2>
                <p className="text-[13px] text-[#A1A1AA] mt-2 max-w-[40ch]">
                  Enter the confidential <code className="px-1.5 py-0.5 rounded bg-[#18181B] font-mono text-[#F4F4F5]">ADMIN_SETTINGS_PIN</code> to manage multi-API rotation pools.
                </p>

                <form onSubmit={handleUnlockSettings} className="mt-6 flex flex-col gap-4 w-full">
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#A1A1AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="ENTER SETTINGS PIN"
                      autoFocus
                      className="w-full h-11 pl-10 pr-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] text-[14px] font-mono text-[#F4F4F5] focus:border-[#EF4444] focus:outline-none transition"
                    />
                  </div>

                  {pinError && (
                    <p className="text-[12px] font-mono text-[#EF4444] font-semibold">{pinError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!pinInput.trim()}
                    className="h-11 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Unlock API Pool</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Header & Lock Button */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-8 rounded-[2px] border border-[#3F3F46] bg-[#27272A]">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="font-mono text-[22px] font-bold text-[#F4F4F5] uppercase">
                        Multi-API Key Rotation Engine
                      </h2>
                      <span className="px-3 py-1 rounded-[2px] bg-[#18181B] border border-[#10B981] text-[#10B981] font-mono font-bold text-[11px] uppercase tracking-wider">
                        Active & Unlocked
                      </span>
                    </div>
                    <p className="text-[13px] text-[#A1A1AA] mt-1">
                      Configure keys for Groq & OpenCode Zen. Automatic fallback on rate-limit (429).
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void fetchKeys()}
                      disabled={keysLoading}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] text-[#F4F4F5] font-mono text-[12px] font-bold uppercase tracking-wider transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${keysLoading ? "animate-spin text-[#EF4444]" : ""}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLockSettings}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-[2px] border border-[#EF4444] bg-[#EF4444]/10 hover:bg-[#EF4444] text-[#EF4444] hover:text-[#F4F4F5] font-mono text-[12px] font-bold uppercase tracking-wider transition cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Lock Settings</span>
                    </button>
                  </div>
                </div>

                {/* Provider Status Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Groq Pool Card */}
                  <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-none bg-[#10B981]" />
                        <h3 className="font-mono font-bold text-[16px] text-[#F4F4F5] uppercase">Groq Cloud (Round 1)</h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA]">
                        qwen/qwen3.8-27b
                      </span>
                    </div>
                    <p className="text-[12px] text-[#A1A1AA]">
                      Powers all 8 Round 1 AI characters (John Wick, Spider-Man, Escanor, Stark, etc.)
                    </p>
                    <div className="mt-2 pt-3 border-t border-[#3F3F46] flex items-center justify-between text-[12px] font-mono">
                      <span className="text-[#A1A1AA] uppercase">Rotation Pool:</span>
                      <span className="font-bold text-[#10B981]">
                        {keysList.filter((k) => k.provider === "groq" && k.is_active).length} Custom Active + .env Fallback
                      </span>
                    </div>
                  </div>

                  {/* OpenCode Zen Pool Card */}
                  <div className="p-6 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-none bg-[#10B981]" />
                        <h3 className="font-mono font-bold text-[16px] text-[#F4F4F5] uppercase">OpenCode Zen (Round 2)</h3>
                      </div>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA]">
                        muse-spark-1.3
                      </span>
                    </div>
                    <p className="text-[12px] text-[#A1A1AA]">
                      Powers Nether Vault Bosses (Itachi Uchiha & Sosuke Aizen) with server reasoning traces
                    </p>
                    <div className="mt-2 pt-3 border-t border-[#3F3F46] flex items-center justify-between text-[12px] font-mono">
                      <span className="text-[#A1A1AA] uppercase">Rotation Pool:</span>
                      <span className="font-bold text-[#10B981]">
                        {keysList.filter((k) => k.provider === "zen" && k.is_active).length} Custom Active + .env Fallback
                      </span>
                    </div>
                  </div>
                </div>

                {/* Add New Key Form */}
                <div className="p-6 sm:p-8 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex flex-col gap-5">
                  <h3 className="font-mono font-bold text-[16px] text-[#F4F4F5] uppercase flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#EF4444]" />
                    <span>Add New API Key to Rotation Pool</span>
                  </h3>

                  <form onSubmit={handleAddKey} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end font-mono">
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-1">
                        Provider:
                      </label>
                      <select
                        value={newKeyProvider}
                        onChange={(e) => setNewKeyProvider(e.target.value as "groq" | "zen")}
                        className="w-full h-11 px-3 rounded-[2px] border border-[#3F3F46] bg-[#27272A] text-[13px] font-bold text-[#F4F4F5] focus:outline-none"
                      >
                        <option value="groq">Groq (Round 1)</option>
                        <option value="zen">OpenCode Zen (Round 2)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-5">
                      <label className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-1">
                        API Key Value:
                      </label>
                      <input
                        type="password"
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder="gsk_... or sk-pw..."
                        className="w-full h-11 px-4 rounded-[2px] border border-[#3F3F46] bg-[#27272A] text-[13px] text-[#F4F4F5] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider block mb-1">
                        Label:
                      </label>
                      <input
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        placeholder="Key Label"
                        className="w-full h-11 px-3 rounded-[2px] border border-[#3F3F46] bg-[#27272A] text-[13px] text-[#F4F4F5] focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={busy || !newKeyValue.trim()}
                        className="w-full h-11 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Key</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Keys Pool List */}
                <div className="p-6 sm:p-8 rounded-[2px] border border-[#3F3F46] bg-[#18181B] flex flex-col gap-5">
                  <div className="flex items-center justify-between font-mono">
                    <h3 className="font-bold text-[16px] text-[#F4F4F5] uppercase">
                      Configured Keys ({keysList.length + 2} in Pool)
                    </h3>
                    <span className="text-[12px] text-[#A1A1AA]">
                      Sorted by lowest fail count
                    </span>
                  </div>

                  <div className="flex flex-col gap-3 font-mono">
                    {/* Permanent Fallback Key: Groq */}
                    <div className="p-4 px-5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span className="px-2.5 py-1 rounded-[2px] bg-[#18181B] text-[#A1A1AA] text-[11px] font-bold uppercase border border-[#3F3F46]">
                          Groq
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-[#F4F4F5]">
                              System Fallback Key (.env)
                            </span>
                            <span className="px-2 py-0.5 rounded-[2px] bg-[#10B981]/10 text-[#10B981] border border-[#10B981] text-[10px] font-bold uppercase">
                              Always Active
                            </span>
                          </div>
                          <span className="text-[11px] text-[#A1A1AA]">Primary environment variable fallback</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-[#10B981] uppercase">Built-in Fallback</span>
                    </div>

                    {/* Permanent Fallback Key: Zen */}
                    <div className="p-4 px-5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span className="px-2.5 py-1 rounded-[2px] bg-[#18181B] text-[#A1A1AA] text-[11px] font-bold uppercase border border-[#3F3F46]">
                          Zen
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-[#F4F4F5]">
                              System Fallback Key (.env)
                            </span>
                            <span className="px-2 py-0.5 rounded-[2px] bg-[#10B981]/10 text-[#10B981] border border-[#10B981] text-[10px] font-bold uppercase">
                              Always Active
                            </span>
                          </div>
                          <span className="text-[11px] text-[#A1A1AA]">Primary environment variable fallback</span>
                        </div>
                      </div>
                      <span className="text-[12px] font-bold text-[#10B981] uppercase">Built-in Fallback</span>
                    </div>

                    {/* Custom Keys */}
                    {keysList.map((k) => (
                      <div
                        key={k.id}
                        className="p-4 px-5 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex items-center justify-between gap-4 transition"
                      >
                        <div className="flex items-center gap-4">
                          <span className="px-2.5 py-1 rounded-[2px] bg-[#18181B] text-[#A1A1AA] text-[11px] font-bold uppercase border border-[#3F3F46]">
                            {k.provider}
                          </span>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-[#F4F4F5]">
                                {k.masked_key}
                              </span>
                              {k.label && (
                                <span className="text-[12px] text-[#A1A1AA]">
                                  ({k.label})
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold uppercase ${
                                k.is_active ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]" : "bg-[#18181B] text-[#A1A1AA]"
                              }`}>
                                {k.is_active ? "Active" : "Disabled"}
                              </span>
                              {k.fail_count > 0 && (
                                <span className="px-2 py-0.5 rounded-[2px] bg-[#EF4444]/10 text-[#EF4444] text-[10px] font-bold">
                                  {k.fail_count} failures
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#A1A1AA] mt-1">
                              Added: {k.created_at.slice(0, 10)} {k.last_used_at ? `• Last Used: ${k.last_used_at.slice(11, 19)}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleKey(k.id)}
                            className={`px-3 py-1.5 rounded-[2px] text-[12px] font-mono font-bold uppercase transition cursor-pointer ${
                              k.is_active
                                ? "bg-[#18181B] border border-[#3F3F46] text-[#A1A1AA] hover:text-[#F4F4F5]"
                                : "bg-[#10B981]/10 border border-[#10B981] text-[#10B981]"
                            }`}
                          >
                            {k.is_active ? "Disable" : "Enable"}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteKey(k.id)}
                            className="p-2 rounded-[2px] border border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444] hover:text-[#F4F4F5] transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-[520px] rounded-[2px] border-t-[1px] border-t-[#EF4444] border-x border-b border-[#3F3F46] bg-[#27272A] p-6 sm:p-8 flex flex-col gap-5 text-[#F4F4F5] shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-[#3F3F46] pb-4">
              <div>
                <h3 className="text-[17px] font-mono font-bold text-[#F4F4F5] uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#EF4444]" />
                  <span>Tactical ELO Override</span>
                </h3>
                <p className="text-[12px] text-[#A1A1AA] font-mono mt-1">
                  Squad: <span className="font-bold text-[#F4F4F5]">{eloModalTeam.name}</span> • Current ELO:{" "}
                  <span className="font-bold text-[#10B981]">{eloModalTeam.elo}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEloModalTeam(null)}
                className="w-8 h-8 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Adjust Presets (Severe Flat Rectangular Buttons) */}
            <div>
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
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
                      className={`py-2 rounded-[2px] font-bold text-[13px] border transition cursor-pointer ${
                        isSelected
                          ? "bg-[#EF4444] text-[#F4F4F5] border-[#EF4444]"
                          : isPositive
                          ? "bg-[#18181B] text-[#10B981] border-[#10B981]/40 hover:bg-[#10B981]/20"
                          : "bg-[#18181B] text-[#EF4444] border-[#EF4444]/40 hover:bg-[#EF4444]/20"
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
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                Custom Delta Amount:
              </label>
              <input
                type="number"
                value={eloDelta}
                onChange={(e) => setEloDelta(Number(e.target.value))}
                className="w-full h-10 px-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] font-mono font-bold text-[15px] text-[#F4F4F5] focus:border-[#EF4444] focus:outline-none transition"
              />
            </div>

            {/* Adjustment Reason: Horizontal Flex-Wrap Tactical Chips */}
            <div>
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
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
                      className={`px-3 py-1.5 rounded-[2px] text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border ${
                        isSelected
                          ? "bg-[#EF4444] text-[#F4F4F5] border-[#EF4444]"
                          : "bg-[#18181B] text-[#A1A1AA] border-[#3F3F46] hover:text-[#F4F4F5] hover:border-[#A1A1AA]"
                      }`}
                    >
                      {reasonOption}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary preview */}
            <div className="p-3.5 rounded-[2px] bg-[#18181B] border border-[#3F3F46] font-mono text-[12px] flex items-center justify-between">
              <span className="text-[#A1A1AA] uppercase font-bold">New Calculated ELO:</span>
              <span className="font-bold text-[16px] text-[#10B981]">
                {Math.max(0, eloModalTeam.elo + eloDelta)} ({eloDelta > 0 ? `+${eloDelta}` : eloDelta})
              </span>
            </div>

            {/* Action Buttons: Solid Crimson Confirm & Ghost Cancel */}
            <div className="flex items-center gap-3 pt-2 font-mono">
              <button
                type="button"
                onClick={() => setEloModalTeam(null)}
                className="flex-1 py-3 rounded-[2px] border border-[#3F3F46] bg-transparent hover:bg-[#3F3F46]/50 font-bold text-[13px] uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyElo}
                disabled={busy}
                className="flex-1 py-3 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 font-bold text-[13px] uppercase tracking-wider text-[#F4F4F5] cursor-pointer transition disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-[740px] max-h-[90vh] overflow-y-auto rounded-[2px] border-t-[1px] border-t-[#EF4444] border-x border-b border-[#3F3F46] bg-[#27272A] p-6 sm:p-8 flex flex-col gap-6 text-[#F4F4F5] shadow-[0_25px_60px_rgba(0,0,0,0.95)] font-mono">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#3F3F46] pb-4">
              <div>
                <h3 className="text-[17px] font-mono font-bold text-[#F4F4F5] uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#10B981]" />
                  <span>Satchel Contents & Relic Override</span>
                </h3>
                <p className="text-[12px] text-[#A1A1AA] font-mono mt-1">
                  Squad: <span className="font-bold text-[#F4F4F5]">{invModalTeam.name}</span> • {invModalTeam.solved}/8 Verified Solved
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvModalTeam(null)}
                className="w-8 h-8 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Batch Actions Strip */}
            <div className="p-3 rounded-[2px] bg-[#18181B] border border-[#3F3F46] flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-[#A1A1AA] uppercase tracking-wider">
                Batch Edit All 8 Characters:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleBatchInventoryOverride("locked")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#3F3F46] text-[11px] font-bold uppercase transition cursor-pointer disabled:opacity-50"
                >
                  Lock All
                </button>

                <button
                  type="button"
                  onClick={() => void handleBatchInventoryOverride("obtained")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-[2px] bg-[#18181B] border border-[#3F3F46] text-[#F4F4F5] hover:bg-[#3F3F46] text-[11px] font-bold uppercase transition cursor-pointer disabled:opacity-50"
                >
                  Hold All
                </button>

                <button
                  type="button"
                  onClick={() => void handleBatchInventoryOverride("verified")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-[2px] bg-[#10B981]/10 border border-[#10B981] text-[#10B981] hover:bg-[#10B981] hover:text-[#18181B] text-[11px] font-bold uppercase transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
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
                    className={`p-3.5 rounded-[2px] flex flex-col justify-between gap-3 transition border ${
                      isVerified
                        ? "border-l-[4px] border-l-[#10B981] border-t border-r border-b border-[#3F3F46] bg-[#18181B]"
                        : isObtained
                        ? "border-l-[4px] border-l-[#F4F4F5] border-t border-r border-b border-[#3F3F46] bg-[#18181B]"
                        : "border-l-[4px] border-l-[#3F3F46] border-t border-r border-b border-[#3F3F46] bg-[#18181B]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-[2px] bg-[#27272A] border border-[#3F3F46] overflow-hidden shrink-0">
                          <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-[13px] text-[#F4F4F5] block truncate">{char.name}</span>
                          <span className="text-[11px] text-[#A1A1AA] block truncate">{char.targetItem.name}</span>
                        </div>
                      </div>

                      {/* Iconography replacing repetitive text */}
                      <div className="shrink-0">
                        {isVerified ? (
                          <div className="flex items-center justify-center w-7 h-7 rounded-[2px] bg-[#10B981]/20 border border-[#10B981] text-[#10B981]" title="Verified Solved">
                            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                          </div>
                        ) : isObtained ? (
                          <div className="flex items-center justify-center w-7 h-7 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#F4F4F5]" title="Held in Satchel">
                            <Package className="w-4 h-4 text-[#F4F4F5]" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center w-7 h-7 rounded-[2px] bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA]" title="Locked">
                            <Lock className="w-4 h-4 text-[#A1A1AA]" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* High-Contrast Interactive Edit Buttons */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-[#3F3F46]/60">
                      <button
                        type="button"
                        onClick={() => void handleInventoryOverride(botId, char.targetItem.name, "locked")}
                        className={`flex-1 py-1.5 rounded-[2px] text-[10px] font-bold uppercase transition cursor-pointer ${
                          currentStatus === "locked"
                            ? "bg-[#3F3F46] text-[#F4F4F5] border border-[#3F3F46]"
                            : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
                        }`}
                      >
                        Lock
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleInventoryOverride(botId, char.targetItem.name, "obtained")}
                        className={`flex-1 py-1.5 rounded-[2px] text-[10px] font-bold uppercase transition cursor-pointer ${
                          currentStatus === "obtained"
                            ? "bg-[#F4F4F5] text-[#18181B] font-bold"
                            : "bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#F4F4F5]"
                        }`}
                      >
                        Held
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleInventoryOverride(botId, char.targetItem.name, "verified")}
                        className={`flex-1 py-1.5 rounded-[2px] text-[10px] font-bold uppercase transition cursor-pointer flex items-center justify-center gap-1 ${
                          currentStatus === "verified"
                            ? "bg-[#10B981] text-[#18181B] font-bold"
                            : "bg-[#10B981]/10 border border-[#10B981] text-[#10B981] hover:bg-[#10B981] hover:text-[#18181B]"
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
                className="w-full py-3 rounded-[2px] border border-[#3F3F46] bg-transparent hover:bg-[#3F3F46]/50 text-[#A1A1AA] hover:text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider cursor-pointer transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-[860px] h-[85vh] rounded-[2px] border-t-[1px] border-t-[#EF4444] border-x border-b border-[#3F3F46] bg-[#27272A] p-6 sm:p-8 flex flex-col gap-5 text-[#F4F4F5] shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
            <div className="flex items-center justify-between border-b border-[#3F3F46] pb-4">
              <div>
                <h3 className="text-[17px] font-mono font-bold text-[#F4F4F5] uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#EF4444]" />
                  <span>Comms & AI Reasoning Inspector</span>
                </h3>
                <p className="text-[12px] font-mono text-[#A1A1AA] mt-1">
                  Squad: <span className="font-bold text-[#F4F4F5]">{commsModalTeam.name}</span> • Chat Logs & Hidden AI Reasoning Traces
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommsModalTeam(null)}
                className="w-8 h-8 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Tabs and Tactical Target Bar */}
            <div className="flex flex-col gap-3 border-b border-[#3F3F46] pb-3 font-mono">
              <div className="flex items-center gap-2 p-1 rounded-[2px] bg-[#18181B] border border-[#3F3F46] self-start">
                <button
                  type="button"
                  onClick={() => setCommsTab("messages")}
                  className={`px-3 py-1.5 rounded-[2px] text-[11px] font-bold uppercase transition cursor-pointer ${
                    commsTab === "messages" ? "bg-[#EF4444] text-[#F4F4F5]" : "text-[#A1A1AA] hover:text-[#F4F4F5]"
                  }`}
                >
                  Chat Logs ({commsMessages.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCommsTab("traces")}
                  className={`px-3 py-1.5 rounded-[2px] text-[11px] font-bold uppercase transition cursor-pointer ${
                    commsTab === "traces" ? "bg-[#EF4444] text-[#F4F4F5]" : "text-[#A1A1AA] hover:text-[#F4F4F5]"
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
                  className={`px-3 py-1 rounded-[2px] text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer border ${
                    commsBotFilter === "all"
                      ? "bg-[#EF4444] text-[#F4F4F5] border-[#EF4444]"
                      : "bg-[#18181B] text-[#A1A1AA] border-[#3F3F46] hover:text-[#F4F4F5] hover:border-[#A1A1AA]"
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
                      className={`px-3 py-1 rounded-[2px] text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer border ${
                        isSelected
                          ? "bg-[#EF4444] text-[#F4F4F5] border-[#EF4444]"
                          : "bg-[#18181B] text-[#A1A1AA] border-[#3F3F46] hover:text-[#F4F4F5] hover:border-[#A1A1AA]"
                      }`}
                    >
                      {charName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 rounded-[2px] bg-[#18181B] border border-[#3F3F46] flex flex-col gap-3 font-mono">
              {commsLoading ? (
                <div className="m-auto text-center text-[#A1A1AA] font-bold text-[14px] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#EF4444]" />
                  <span>Loading comms transcript…</span>
                </div>
              ) : commsTab === "messages" ? (
                commsMessages.length === 0 ? (
                  <p className="m-auto text-[#A1A1AA] italic text-[13px]">No chat messages found for this query.</p>
                ) : (
                  commsMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-[2px] max-w-[85%] text-[13px] flex flex-col gap-1.5 ${
                        msg.role === "user"
                          ? "ml-auto bg-[#27272A] border border-[#3F3F46] text-[#F4F4F5]"
                          : "mr-auto bg-[#27272A] border border-[#3F3F46] text-[#F4F4F5]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] text-[#A1A1AA] font-bold">
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
                  <p className="m-auto text-[#A1A1AA] italic text-[13px]">No internal reasoning traces recorded.</p>
                ) : (
                  commsTraces.map((trace) => {
                    let traceObj: any = {};
                    let guardObj: any = {};
                    try { traceObj = JSON.parse(trace.trace_json); } catch {}
                    try { guardObj = JSON.parse(trace.guard_json); } catch {}

                    return (
                      <div key={trace.id} className="p-4 rounded-[2px] border border-[#3F3F46] bg-[#27272A] flex flex-col gap-2 font-mono">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[#A1A1AA]">
                          <span>Bot: {trace.bot_id} • Phase: {trace.phase}</span>
                          <span>Latency: {traceObj.ms ? `${traceObj.ms}ms` : "N/A"} • {trace.created_at.slice(11, 19)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-[2px] uppercase ${
                            guardObj.risk === "flagged" ? "bg-[#EF4444]/10 border border-[#EF4444] text-[#EF4444]" : "bg-[#10B981]/10 border border-[#10B981] text-[#10B981]"
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
                className="w-full py-3 rounded-[2px] border border-[#3F3F46] bg-transparent hover:bg-[#3F3F46]/50 text-[#A1A1AA] hover:text-[#F4F4F5] font-mono font-bold text-[13px] uppercase tracking-wider cursor-pointer transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-[520px] rounded-[2px] border-t-[1px] border-t-[#EF4444] border-x border-b border-[#3F3F46] bg-[#27272A] p-6 sm:p-8 flex flex-col gap-5 text-[#F4F4F5] font-mono shadow-[0_25px_60px_rgba(0,0,0,0.95)]">
            <div className="flex items-center justify-between border-b border-[#3F3F46] pb-4">
              <div>
                <h3 className="text-[17px] font-bold text-[#EF4444] uppercase tracking-wider flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  <span>Force Context Rewind</span>
                </h3>
                <p className="text-[12px] text-[#A1A1AA] mt-1">
                  Squad: <span className="font-bold text-[#F4F4F5]">{rewindConfirmTeam.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRewindConfirmTeam(null)}
                className="w-8 h-8 rounded-[2px] border border-[#3F3F46] bg-[#18181B] hover:bg-[#3F3F46] flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[13px] text-[#A1A1AA] font-sans">
              This operation purges conversation memory for this team on the target bot, resetting engagement state.
            </p>

            {/* Target Bot Input: Horizontal Flex-Wrap Tactical Chips */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                Target Bot to Reset (Select Option):
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRewindBot("all")}
                  className={`px-3 py-1.5 rounded-[2px] text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border ${
                    rewindBot === "all"
                      ? "bg-[#EF4444] text-[#F4F4F5] border-[#EF4444]"
                      : "bg-[#18181B] text-[#A1A1AA] border-[#3F3F46] hover:text-[#F4F4F5] hover:border-[#A1A1AA]"
                  }`}
                >
                  All Characters (Full Squad Wipe)
                </button>
                {R1_BOTS.map((b) => {
                  const isSelected = rewindBot === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setRewindBot(b)}
                      className={`px-3 py-1.5 rounded-[2px] text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border ${
                        isSelected
                          ? "bg-[#EF4444] text-[#F4F4F5] border-[#EF4444]"
                          : "bg-[#18181B] text-[#A1A1AA] border-[#3F3F46] hover:text-[#F4F4F5] hover:border-[#A1A1AA]"
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
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] block mb-2">
                Optional ELO Penalty Deduction:
              </label>
              <input
                type="number"
                min={0}
                value={rewindPenalty}
                onChange={(e) => setRewindPenalty(Number(e.target.value))}
                className="w-full h-10 px-4 rounded-[2px] border border-[#3F3F46] bg-[#18181B] font-mono font-bold text-[15px] text-[#F4F4F5] focus:border-[#EF4444] focus:outline-none transition"
              />
            </div>

            {/* Action Buttons: Solid Crimson Confirm & Ghost Cancel */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRewindConfirmTeam(null)}
                className="flex-1 py-3 rounded-[2px] border border-[#3F3F46] bg-transparent hover:bg-[#3F3F46]/50 font-bold text-[13px] uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRewind}
                disabled={busy}
                className="flex-1 py-3 rounded-[2px] bg-[#EF4444] hover:bg-[#EF4444]/90 font-bold text-[13px] uppercase tracking-wider text-[#F4F4F5] cursor-pointer transition disabled:opacity-50"
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

