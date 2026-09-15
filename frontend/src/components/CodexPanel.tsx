import { useCallback, useEffect, useRef, useState } from "react";
import { Plug, RefreshCw, Unplug, RotateCcw, Power } from "lucide-react";
import {
  cancelCodexConnect,
  codexLogout,
  codexRestart,
  consumeCodexReset,
  getCodexStatus,
  refreshCodex,
  startCodexConnect,
  type CodexStatus,
  type CodexUsageWindow,
} from "@/api/codex";

type PanelState = "loading" | "ready" | "error";

function formatCountdown(resetsAt?: number, now?: number): string {
  if (!resetsAt) return "—";
  const t = now ?? Date.now();
  const ms = resetsAt * 1000 - t;
  if (ms <= 0) return "resetting…";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatResetAt(resetsAt?: number): string {
  if (!resetsAt) return "—";
  try {
    return new Date(resetsAt * 1000).toLocaleString();
  } catch {
    return "—";
  }
}

function UsageBar({ label, win, now }: { label: string; win?: CodexUsageWindow | undefined; now: number }): React.JSX.Element | null {
  if (!win) return null;
  const used = Math.max(0, Math.min(100, win.usedPercent));
  return (
    <div className="flex flex-col gap-1.5 rounded-[2px] border border-[#3F3F46] bg-[#18181B] p-3">
      <div className="flex items-center justify-between text-[12px] font-mono uppercase tracking-wider">
        <span className="text-[#F4F4F5] font-bold">{label}</span>
        <span className="text-[#A1A1AA]">
          Used {used.toFixed(1)}% · Remaining {win.remainingPercent.toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-[2px] bg-[#27272A]" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} usage`}>
        <div className="h-full bg-[#EF4444] transition-all" style={{ width: `${used}%` }} />
      </div>
      <div className="flex items-center justify-between text-[12px] font-mono text-[#A1A1AA]">
        <span>Resets in {formatCountdown(win.resetsAt, now)}</span>
        <span>Reset at {formatResetAt(win.resetsAt)}</span>
      </div>
    </div>
  );
}

function statusLabel(state: string, connected: boolean, modelAvailable: boolean): { dot: string; text: string } {
  if (state === "binary_missing") return { dot: "bg-[#71717A]", text: "Codex CLI not found" };
  if (!connected) {
    if (state === "starting") return { dot: "bg-[#F59E0B]", text: "Starting App Server…" };
    if (state === "process_failed") return { dot: "bg-[#EF4444]", text: "App Server crashed" };
    return { dot: "bg-[#71717A]", text: "Not connected" };
  }
  if (!modelAvailable) return { dot: "bg-[#F59E0B]", text: "Connected, but GPT-5.6 Luna unavailable" };
  if (state === "healthy") return { dot: "bg-[#10B981]", text: "Connected and ready" };
  return { dot: "bg-[#10B981]", text: "Connected" };
}

export default function CodexPanel(): React.JSX.Element {
  const [panelState, setPanelState] = useState<PanelState>("loading");
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [error, setError] = useState<string>("");
  const [now, setNow] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState<"connect" | "reset" | "refresh" | "logout" | "restart" | null>(null);
  const [connecting, setConnecting] = useState<{ authUrl: string; userCode: string; loginId?: string | undefined } | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [resultMsg, setResultMsg] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef<boolean>(true);

  const load = useCallback(async (viaRefresh = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError("");
    try {
      const s = viaRefresh ? await refreshCodex() : await getCodexStatus(ctrl.signal);
      if (!mountedRef.current || ctrl.signal.aborted) return;
      setStatus(s);
      if (s.account.connected) setConnecting(null);
      setPanelState("ready");
    } catch (err) {
      if (!mountedRef.current || ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to reach Codex status");
      setPanelState("error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load(false);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !document.hidden) void load(false);
    }, connecting ? 3000 : 20000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(poll);
      clearInterval(tick);
      abortRef.current?.abort();
    };
  }, [load, !!connecting]);

  async function handleConnect(): Promise<void> {
    // Open a user-initiated placeholder immediately so popup blockers do not
    // prevent the device-login page after the async server request completes.
    const loginWindow = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    setBusy("connect");
    setResultMsg("");
    try {
      const out = await startCodexConnect();
      setConnecting({ authUrl: out.authUrl, userCode: out.userCode, loginId: out.loginId });
      if (loginWindow && !loginWindow.closed) {
        loginWindow.location.href = out.authUrl;
      } else {
        setResultMsg("The device-login page could not open automatically. Use the authorization link below.");
      }
    } catch (err) {
      if (loginWindow && !loginWindow.closed) loginWindow.close();
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelConnect(): Promise<void> {
    try {
      await cancelCodexConnect(connecting?.loginId);
    } catch {
      // ignore
    }
    setConnecting(null);
    void load(true);
  }

  async function handleReset(): Promise<void> {
    setBusy("reset");
    setResultMsg("");
    try {
      const first = status?.resetCredits.credits?.find((c) => c.id)?.id;
      const out = await consumeCodexReset(first);
      if (out.status) setStatus(out.status);
      else await load(true);
      if (out.outcome === "reset") setResultMsg("Reset consumed. Usage refreshed from Codex.");
      else if (out.outcome === "alreadyRedeemed") setResultMsg("Already redeemed — usage refreshed.");
      else if (out.outcome === "nothingToReset") setResultMsg("Nothing to reset right now.");
      else if (out.outcome === "noCredit") {
        setResultMsg("No banked reset available — refreshing state.");
        await load(true);
      } else setResultMsg(`Reset outcome: ${out.outcome}`);
    } catch (err) {
      setResultMsg(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setBusy("logout");
    try {
      await codexLogout();
      setConnecting(null);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestart(): Promise<void> {
    setBusy("restart");
    try {
      const result = await codexRestart();
      if (!result.ok) throw new Error(result.error ?? "Restart failed");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restart failed");
    } finally {
      setBusy(null);
    }
  }

  const connected = status?.account.connected === true;
  const modelAvailable = status?.model.available === true;
  const meta = statusLabel(status?.runtime.state ?? "starting", connected, modelAvailable);
  const resetAvailable = (status?.resetCredits.availableCount ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[2px] border border-[#3F3F46] bg-[#27272A] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-[15px] font-bold uppercase tracking-wider text-[#F4F4F5]">Codex · GPT-5.6 Luna</h2>
            <p className="font-mono text-[12px] text-[#A1A1AA]">R1 effort low · R2 effort medium · Groq/Zen fallback intact</p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-wider text-[#F4F4F5]">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            <span>{panelState === "loading" ? "Loading…" : meta.text}</span>
          </div>
        </div>

        {status && (
          <div className="flex flex-wrap gap-2 font-mono text-[12px] text-[#A1A1AA]">
            {status.account.planType && <span className="rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-2 py-1">Plan: {status.account.planType}</span>}
            <span className="rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-2 py-1">Provider: Codex</span>
            <span className="rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-2 py-1">Model: {status.model.requested}{modelAvailable ? " ✓" : " ✗"}</span>
            <span className="rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-2 py-1">R1 low · R2 medium</span>
            <span className="rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-2 py-1">App Server: {status.runtime.state}</span>
            {status.rateLimitReached && <span className="rounded-[2px] border border-[#EF4444] bg-[#18181B] px-2 py-1 text-[#FCA5A5]">Rate limited: {status.rateLimitReached}</span>}
          </div>
        )}

        {error && <p className="font-mono text-[12px] text-[#FCA5A5]">{error}</p>}
        {resultMsg && <p className="font-mono text-[12px] text-[#A1A1AA]">{resultMsg}</p>}
      </div>

      {status?.runtime.state === "binary_missing" ? (
        <div className="rounded-[2px] border border-[#3F3F46] bg-[#18181B] p-4 font-mono text-[13px] text-[#A1A1AA]">
          Codex runtime unavailable. Install/configure the Codex CLI on the backend host (CODEX_BIN). Gameplay continues on Groq/Zen fallback.
        </div>
      ) : !connected ? (
        <div className="flex flex-col gap-3 rounded-[2px] border border-[#3F3F46] bg-[#18181B] p-4">
          <p className="font-mono text-[13px] text-[#A1A1AA]">Codex not connected. Gameplay continues on Groq/Zen fallback.</p>
          {connecting ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-2">Open the authorization page and enter this one-time code. This connects the game server. Status updates automatically.</p>
              <code className="select-all py-3 font-mono text-3xl tracking-widest text-text-1">{connecting.userCode}</code>
              <p className="text-xs text-text-3">If asked, enable device-code login in ChatGPT security settings. If the code expires, cancel and start again.</p>
              <div className="flex flex-wrap gap-2">
                <a href={connecting.authUrl} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center gap-2 rounded-[2px] bg-[#EF4444] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#F4F4F5]">
                  Authorize game server
                </a>
                <button type="button" onClick={() => void handleCancelConnect()} className="flex min-h-[44px] items-center rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5]">
                  Cancel
                </button>
                <button type="button" onClick={() => void load(true)} className="flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5]">
                  <RefreshCw className="h-4 w-4" /> I&apos;m connected — Refresh
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy === "connect"} onClick={() => void handleConnect()} className="flex min-h-[44px] items-center gap-2 self-start rounded-[2px] bg-[#EF4444] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#F4F4F5] disabled:opacity-60">
              <Plug className="h-4 w-4" /> {busy === "connect" ? "Starting…" : "Connect with ChatGPT"}
            </button>
          )}
        </div>
      ) : (
        <>
          <UsageBar label="5-hour limit" win={status?.usage.fiveHour} now={now} />
          <UsageBar label="Weekly limit" win={status?.usage.weekly} now={now} />
          {status?.usage.extra?.map((w) => (
            <UsageBar key={w.label} label={w.label} win={w} now={now} />
          ))}

          <div className="flex flex-col gap-2 rounded-[2px] border border-[#3F3F46] bg-[#18181B] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] uppercase tracking-wider">
              <span className="font-bold text-[#F4F4F5]">Banked resets: {status?.resetCredits.availableCount ?? 0}</span>
              {resetAvailable && !confirmReset && (
                <button type="button" disabled={busy === "reset"} onClick={() => setConfirmReset(true)} className="flex min-h-[44px] items-center gap-2 rounded-[2px] bg-[#EF4444] px-5 py-2.5 text-[13px] font-bold text-[#F4F4F5] disabled:opacity-60">
                  <RotateCcw className="h-4 w-4" /> Use Reset
                </button>
              )}
            </div>
            {status?.resetCredits.credits?.map((c, i) => (
              <p key={c.id ?? i} className="font-mono text-[12px] text-[#A1A1AA]">
                {c.title ?? "Reset credit"}{c.description ? ` — ${c.description}` : ""}{c.expiresAt ? ` · Expires ${formatResetAt(c.expiresAt)}` : ""}
              </p>
            ))}
            {confirmReset && (
              <div className="flex flex-col gap-2 rounded-[2px] border border-[#EF4444] p-3">
                <p className="font-mono text-[12px] text-[#F4F4F5]">Use one available Codex banked reset? This may refresh eligible 5-hour/weekly usage windows. This consumes one banked reset.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmReset(false)} className="flex min-h-[44px] items-center rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-5 py-2.5 font-mono text-[13px] font-bold uppercase text-[#A1A1AA]">Cancel</button>
                  <button type="button" disabled={busy === "reset"} onClick={() => void handleReset()} className="flex min-h-[44px] items-center rounded-[2px] bg-[#EF4444] px-5 py-2.5 font-mono text-[13px] font-bold uppercase text-[#F4F4F5] disabled:opacity-60">
                    {busy === "reset" ? "Working…" : "Use Reset"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy === "refresh"} onClick={() => void load(true)} className="flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-60">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button type="button" disabled={busy === "logout"} onClick={() => void handleLogout()} className="flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-60">
              <Unplug className="h-4 w-4" /> Disconnect
            </button>
            <button type="button" disabled={busy === "restart"} onClick={() => void handleRestart()} className="flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider text-[#A1A1AA] hover:text-[#F4F4F5] disabled:opacity-60">
              <Power className="h-4 w-4" /> Restart App Server
            </button>
          </div>
        </>
      )}
    </div>
  );
}
