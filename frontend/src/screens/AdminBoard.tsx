import { useCallback, useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";
import { useArenaSocket } from "@/ws/useArenaSocket";
import type { LeaderboardShowcaseData } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import {
  ShieldAlert,
  Download,
  Database,
} from "lucide-react";

interface BoardRow {
  name: string;
  hint: string;
  elo: number;
  solved: number;
  rewinds: number;
  lastSolve: string | null;
}
interface BoardResponse {
  rows: BoardRow[];
  round2: boolean;
}

function parseBoardResponse(value: unknown): BoardResponse | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as { rows?: unknown; round2?: unknown };
  if (!Array.isArray(candidate.rows)) return null;
  return { rows: candidate.rows as BoardRow[], round2: candidate.round2 === true };
}

function BoardSeal(): React.JSX.Element {
  return (
    <span className="flex h-12 w-12 items-center justify-center border border-[#E10600]/50 bg-[#090909]" aria-hidden="true">
      <ShieldAlert className="h-6 w-6 text-[#FF1A14]" />
    </span>
  );
}

function CornerBracket({ className }: { className: string }): React.JSX.Element {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute h-6 w-6 border-[#E10600]/70 ${className}`} />
  );
}

export default function AdminBoard(): React.JSX.Element {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [isRound2, setIsRound2] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  useDocumentTitle("Leaderboard — REDLINE Arena");
  const [adminCode, setAdminCode] = useState(() => localStorage.getItem("redline_admin_code") ?? "");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [backup, setBackup] = useState("");
  const [showcaseQueue, setShowcaseQueue] = useState<LeaderboardShowcaseData[]>([]);
  const showcase = showcaseQueue[0] ?? null;
  const seenShowcases = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (adminCode === "") return;
    try {
      const res = await apiFetch("/api/admin/board", { headers: { "x-admin-code": adminCode } });
      if (!res.ok) {
        setError(res.status === 401 ? "Unauthorized PIN code." : `Leaderboard unavailable (${res.status}).`);
        if (res.status === 401) setAuthed(false);
        return;
      }
      const data = parseBoardResponse(await res.json());
      if (data === null) {
        setError("Leaderboard response malformed.");
        return;
      }
      setIsRound2(data.round2);
      setRows(data.rows);
      setLastUpdated(new Date().toLocaleTimeString());
      setAuthed(true);
      setError("");
    } catch {
      setError("Leaderboard network error.");
    }
  }, [adminCode]);

  // Instant updates over WS (game_tick on every score/inventory/round change);
  // the 30s timer is only a safety net for dropped frames.
  useArenaSocket({
    token: adminCode === "" ? null : adminCode,
    enabled: authed && adminCode !== "",
    onEvent: (event) => {
      if (event.event === "leaderboard_showcase") {
        if (!seenShowcases.current.has(event.id)) {
          seenShowcases.current.add(event.id);
          setShowcaseQueue((current) => [...current, event.data]);
        }
        return;
      }
      if (
        event.event === "game_tick" ||
        event.event === "assessment_settings_sync" ||
        event.event === "announcement" ||
        event.event === "round2_start" ||
        event.event === "round2_end" ||
        event.event === "round2_countdown" ||
        event.event === "round2_extend" ||
        event.event === "game_reset"
      ) {
        void load();
      }
    },
  });

  useEffect(() => {
    if (showcase === null) return;
    const timeout = window.setTimeout(() => {
      setShowcaseQueue((current) => current.slice(1));
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [showcase]);

  useEffect(() => {
    if (adminCode === "") return;
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [adminCode, load]);

  function submitCode(e: React.FormEvent): void {
    e.preventDefault();
    localStorage.setItem("redline_admin_code", adminCode);
    setRows([]);
    setAuthed(false);
    setError("");
    apiFetch("/api/admin/board", { headers: { "x-admin-code": adminCode } })
      .then(async (res) => {
        if (!res.ok) {
          setError(res.status === 401 ? "Invalid PIN code." : `Leaderboard unavailable (${res.status}).`);
          return;
        }
        const data = parseBoardResponse(await res.json());
        if (data === null) {
          setError("Leaderboard response malformed.");
          return;
        }
        setIsRound2(data.round2);
        setRows(data.rows);
        setLastUpdated(new Date().toLocaleTimeString());
        setAuthed(true);
        setError("");
      })
      .catch(() => setError("Network unreachable."));
  }

  async function download(table: string): Promise<void> {
    const res = await apiFetch(`/api/admin/export.csv?table=${table}`, {
      headers: { "x-admin-code": adminCode },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function snapshot(): Promise<void> {
    const res = await apiFetch("/api/admin/backup", {
      method: "POST",
      headers: { "x-admin-code": adminCode },
    });
    if (res.ok) {
      const data = (await res.json()) as { file: string };
      setBackup(data.file);
    }
  }

  if (!authed) {
    return (
      <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#050505] p-6 text-[#F5F5F5] font-sans">
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/backgrounds/leaderboard.png')" }}
        />
        <div className="fixed inset-0 z-0 bg-black/55" />
        <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#120707]/70 via-transparent to-[#050505]/80" />
        <div className="board-panel relative z-10 flex w-full max-w-[420px] flex-col items-center gap-6 p-8">
          <CornerBracket className="left-2 top-2 border-l-2 border-t-2" />
          <CornerBracket className="right-2 top-2 border-r-2 border-t-2" />
          <CornerBracket className="bottom-2 left-2 border-b-2 border-l-2" />
          <CornerBracket className="bottom-2 right-2 border-b-2 border-r-2" />
          <BoardSeal />
          <div className="text-center">
            <h1 className="board-title font-[family-name:var(--font-display)] text-[26px] font-bold tracking-[0.3em] text-[#F5F5F5] uppercase">
              Leaderboard
            </h1>
            <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-[#E10600] to-transparent" aria-hidden="true" />
          </div>

          <form onSubmit={submitCode} className="flex w-full flex-col gap-4">
            <input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="COMMAND PIN"
              aria-label="Admin PIN"
              className="min-h-[48px] border border-[#3F3F46] bg-[#090909]/90 px-4 text-center font-mono text-[15px] text-[#F5F5F5] placeholder:text-[#8A8A8A]/60 focus:border-[#E10600] focus:outline-none"
            />
            <button
              type="submit"
              className="redline-primary-cta min-h-[48px] px-4 py-3 font-semibold text-[#F5F5F5] uppercase tracking-wider"
            >
              Authenticate
            </button>
            {error !== "" && <p role="alert" className="text-center text-[13px] font-mono text-[#FF3B30]">{error}</p>}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-start overflow-hidden bg-[#050505] p-6 sm:p-8 lg:p-10 select-none text-[#F5F5F5] font-sans">
      {showcase !== null && (
        <div
          key={`${showcase.botId}-${showcase.playerName}-${showcase.teamName}`}
          className="showcase-takeover fixed inset-0 z-[100] overflow-hidden bg-[#050505]"
          role="status"
          aria-live="assertive"
          aria-label={`${CHARACTERS[showcase.botId].name} was defeated first by ${showcase.playerName}`}
        >
          <div
            className="absolute inset-0 bg-cover bg-center opacity-35"
            style={{ backgroundImage: `url('${CHARACTERS[showcase.botId].heroImage}')` }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_45%,rgba(225,6,0,0.24),transparent_42%),linear-gradient(90deg,rgba(5,5,5,0.98)_12%,rgba(5,5,5,0.72)_58%,rgba(5,5,5,0.9)_100%)]" />
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#E10600]/35 shadow-[0_0_30px_rgba(225,6,0,0.8)]" aria-hidden="true" />
          <div className="relative flex min-h-[100dvh] flex-col justify-between p-8 sm:p-12 lg:p-16">
            <div className="showcase-reveal mx-auto grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
              <div className="relative mx-auto w-full max-w-[380px]">
                <div className="absolute -inset-5 border border-[#E10600]/35" aria-hidden="true" />
                <div className="absolute -inset-2 border border-[#F5F5F5]/10" aria-hidden="true" />
                <img
                  src={CHARACTERS[showcase.botId].avatar}
                  alt=""
                  className="relative aspect-[4/5] w-full object-cover object-top grayscale-[0.15]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-transparent to-transparent" />
                <p className="absolute bottom-5 left-5 font-mono text-[11px] uppercase tracking-[0.28em] text-[#F5F5F5]/70">
                  Target neutralized
                </p>
              </div>
              <div className="min-w-0">
                <p className="mb-5 font-mono text-[clamp(14px,1.5vw,19px)] font-bold uppercase tracking-[0.34em] text-[#FF3B30]">
                  {CHARACTERS[showcase.botId].moniker}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-[clamp(48px,8vw,118px)] font-black uppercase leading-[0.88] tracking-[-0.04em] text-[#F5F5F5]">
                  {CHARACTERS[showcase.botId].name}
                </h2>
                <div className="my-8 h-px w-full max-w-[660px] bg-gradient-to-r from-[#E10600] via-[#E10600]/50 to-transparent" />
                <p className="font-mono text-[clamp(17px,2.2vw,30px)] font-bold uppercase tracking-[0.16em] text-[#F5F5F5]/75">
                  Was defeated first by
                </p>
                <p className="mt-3 truncate font-[family-name:var(--font-display)] text-[clamp(34px,5.5vw,82px)] font-black leading-none text-[#FF3B30]">
                  {showcase.playerName}
                </p>
                <p className="mt-5 font-mono text-[clamp(14px,1.5vw,20px)] uppercase tracking-[0.2em] text-[#F5F5F5]/70">
                  {showcase.teamName} · rank one completion
                </p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-6 font-mono text-[11px] uppercase tracking-[0.25em] text-[#8A8A8A]">
              <span>Returning to live standings in 10 seconds</span>
              <span>Speed bonus secured</span>
            </div>
          </div>
        </div>
      )}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/backgrounds/leaderboard.png')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/55" />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#120707]/70 via-transparent to-[#050505]/80" />
      <div className="relative z-10 flex w-full max-w-[1440px] flex-col items-center">
        <header className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-3" aria-hidden="true">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E10600] shadow-[0_0_8px_rgba(225,6,0,0.9)]" />
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#E10600]/70" />
            <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-[#8A8A8A]">
              ᚱ ᚷ ᛒ
            </span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#E10600]/70" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E10600] shadow-[0_0_8px_rgba(225,6,0,0.9)]" />
          </div>
          <h1 className="board-title font-[family-name:var(--font-display)] text-[clamp(30px,5vw,52px)] font-bold tracking-[0.28em] text-[#F5F5F5] uppercase">
            Leaderboard
          </h1>
          {lastUpdated !== null && (
            <p className="mt-2 font-mono text-[11px] tracking-[0.2em] text-[#8A8A8A] uppercase">
              Last sync {lastUpdated}
            </p>
          )}
          {error !== "" && (
            <p role="alert" className="mt-2 border border-[#FF3B30]/40 bg-[#120707]/80 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#FF3B30]">
              {error}
            </p>
          )}
          <div className="mt-4 h-[2px] w-40 bg-gradient-to-r from-transparent via-[#E10600] to-transparent shadow-[0_0_12px_rgba(225,6,0,0.8)]" aria-hidden="true" />
        </header>

        <div className="board-panel relative w-full p-6 sm:p-8 lg:p-10">
          <CornerBracket className="left-2 top-2 border-l-2 border-t-2" />
          <CornerBracket className="right-2 top-2 border-r-2 border-t-2" />
          <CornerBracket className="bottom-2 left-2 border-b-2 border-l-2" />
          <CornerBracket className="bottom-2 right-2 border-b-2 border-r-2" />
          <div className="overflow-x-auto">
            <div className="min-w-[960px]">
              <div className="mb-4 grid grid-cols-12 items-center border-b border-[#E10600]/25 px-10 py-6 font-mono text-[16px] font-bold uppercase tracking-[0.2em] text-[#8A8A8A]">
                <div className="col-span-2 text-center sm:col-span-1">Rank</div>
                <div className="col-span-4 pl-2 sm:col-span-4">Squad</div>
                <div className="col-span-2 text-center sm:col-span-2">Player</div>
                <div className="col-span-2 text-right sm:col-span-2">Elo</div>
                <div className="col-span-2 text-center sm:col-span-2">Solves</div>
                <div className="hidden text-right sm:col-span-1 sm:block">Rewind</div>
              </div>

              <div className="redline-scroll flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BoardSeal />
                    <p className="mt-4 font-mono text-[16px] font-bold text-[#F5F5F5] uppercase tracking-[0.2em]">
                      No Active Telemetry
                    </p>
                    <p className="mt-1 text-[13px] text-[#8A8A8A]">
                      {isRound2
                        ? "No selected squads yet, or awaiting first boss completion."
                        : "Awaiting first Guardrail Bypass event."}
                    </p>
                  </div>
                ) : (
                  rows.map((r, i) => {
                    const rank = i + 1;
                    const topRank = rank === 1;

                    return (
                      <div
                        key={r.name}
                        className={`board-row grid grid-cols-12 items-center border px-10 py-6 ${
                          topRank
                            ? "board-champion border-[#E10600] bg-[#0d0606]/95"
                            : "border-[#2a2a2a] bg-[#090909]/80 hover:bg-[#120707]/80"
                        }`}
                      >
                        <div className="col-span-2 flex items-center justify-center sm:col-span-1">
                          <span className={`font-mono text-[24px] font-bold ${topRank ? "text-[#FF1A14]" : "text-[#8A8A8A]"}`}>
                            #{rank.toString().padStart(2, "0")}
                          </span>
                        </div>

                        <div className="col-span-4 min-w-0 pl-2 sm:col-span-4">
                          <span className="block truncate font-sans text-[30px] font-bold text-[#F5F5F5]">
                            {r.name}
                          </span>
                        </div>

                        <div className="col-span-2 text-center sm:col-span-2">
                          <span className="inline-block max-w-[220px] truncate border border-[#3F3F46] bg-[#050505] px-4 py-2 font-mono text-[18px] text-[#F5F5F5]">
                            {r.hint || "Unknown"}
                          </span>
                        </div>

                        <div className="col-span-2 text-right sm:col-span-2">
                          <span className="font-mono text-[40px] font-bold text-[#F5F5F5]">
                            {r.elo}
                          </span>
                        </div>

                        <div className="col-span-2 text-center sm:col-span-2">
                          <span className={`font-mono text-[28px] font-bold ${r.solved > 0 ? "text-[#00D9A6]" : "text-[#8A8A8A]"}`}>
                            {r.solved}/{isRound2 ? 1 : 8}
                          </span>
                        </div>

                        <div className="hidden text-right font-mono text-[22px] text-[#8A8A8A] sm:col-span-1 sm:block">
                          {r.rewinds}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
