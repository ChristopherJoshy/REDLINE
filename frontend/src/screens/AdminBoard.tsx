import { useEffect, useState } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";
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
  useDocumentTitle("Leaderboard — REDLINE Arena");
  const [adminCode, setAdminCode] = useState(() => localStorage.getItem("redline_admin_code") ?? "");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [backup, setBackup] = useState("");

  useEffect(() => {
    if (adminCode === "") return;
    let dead = false;
    async function load(): Promise<void> {
      try {
        const res = await apiFetch("/api/admin/board", { headers: { "x-admin-code": adminCode } });
        if (res.status === 401) {
          if (!dead) {
            setAuthed(false);
            setError("Unauthorized PIN code.");
          }
          return;
        }
        const data = (await res.json()) as { rows: BoardRow[]; round2?: boolean };
        setIsRound2(data.round2 ?? false);
        if (!dead) {
          setRows(data.rows);
          setAuthed(true);
          setError("");
        }
      } catch {
        // Keep prior state
      }
    }
    void load();
    const t = setInterval(load, 5000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [adminCode]);

  function submitCode(e: React.FormEvent): void {
    e.preventDefault();
    localStorage.setItem("redline_admin_code", adminCode);
    setRows([]);
    setAuthed(false);
    setError("");
    apiFetch("/api/admin/board", { headers: { "x-admin-code": adminCode } })
      .then(async (res) => {
        if (res.status === 401) {
          setError("Invalid PIN code.");
          return;
        }
        const data = (await res.json()) as { rows: BoardRow[]; round2?: boolean };
        setIsRound2(data.round2 ?? false);
        setRows(data.rows);
        setAuthed(true);
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
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/backgrounds/leaderboard.png')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/55" />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#120707]/70 via-transparent to-[#050505]/80" />
      <div className="relative z-10 flex w-full max-w-[1200px] flex-col items-center">
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
          <div className="mt-4 h-[2px] w-40 bg-gradient-to-r from-transparent via-[#E10600] to-transparent shadow-[0_0_12px_rgba(225,6,0,0.8)]" aria-hidden="true" />
        </header>

        <div className="board-panel relative w-full p-4 sm:p-6 lg:p-8">
          <CornerBracket className="left-2 top-2 border-l-2 border-t-2" />
          <CornerBracket className="right-2 top-2 border-r-2 border-t-2" />
          <CornerBracket className="bottom-2 left-2 border-b-2 border-l-2" />
          <CornerBracket className="bottom-2 right-2 border-b-2 border-r-2" />
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="mb-3 grid grid-cols-12 items-center border-b border-[#E10600]/25 px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#8A8A8A]">
                <div className="col-span-2 text-center sm:col-span-1">Rank</div>
                <div className="col-span-4 pl-2 sm:col-span-4">Squad</div>
                <div className="col-span-2 text-center sm:col-span-2">Player</div>
                <div className="col-span-2 text-right sm:col-span-2">Elo</div>
                <div className="col-span-2 text-center sm:col-span-2">Solves</div>
                <div className="hidden text-right sm:col-span-1 sm:block">Rewind</div>
              </div>

              <div className="redline-scroll flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <BoardSeal />
                    <p className="mt-4 font-mono text-[16px] font-bold text-[#F5F5F5] uppercase tracking-[0.2em]">
                      No Active Telemetry
                    </p>
                    <p className="mt-1 text-[13px] text-[#8A8A8A]">
                      Awaiting first Guardrail Bypass event.
                    </p>
                  </div>
                ) : (
                  rows.map((r, i) => {
                    const rank = i + 1;
                    const topRank = rank === 1;

                    return (
                      <div
                        key={r.name}
                        className={`board-row grid grid-cols-12 items-center border px-6 py-4 ${
                          topRank
                            ? "board-champion border-[#E10600] bg-[#0d0606]/95"
                            : "border-[#2a2a2a] bg-[#090909]/80 hover:bg-[#120707]/80"
                        }`}
                      >
                        <div className="col-span-2 flex items-center justify-center sm:col-span-1">
                          <span className={`font-mono text-[14px] font-bold ${topRank ? "text-[#FF1A14]" : "text-[#8A8A8A]"}`}>
                            #{rank.toString().padStart(2, "0")}
                          </span>
                        </div>

                        <div className="col-span-4 min-w-0 pl-2 sm:col-span-4">
                          <span className="block truncate font-sans text-[16px] font-bold text-[#F5F5F5]">
                            {r.name}
                          </span>
                        </div>

                        <div className="col-span-2 text-center sm:col-span-2">
                          <span className="inline-block border border-[#3F3F46] bg-[#050505] px-3 py-1 font-mono text-[12px] text-[#F5F5F5] truncate max-w-[120px]">
                            {r.hint || "Unknown"}
                          </span>
                        </div>

                        <div className="col-span-2 text-right sm:col-span-2">
                          <span className="font-mono text-[22px] font-bold text-[#F5F5F5]">
                            {r.elo}
                          </span>
                        </div>

                        <div className="col-span-2 text-center sm:col-span-2">
                          <span className={`font-mono text-[14px] font-bold ${r.solved > 0 ? "text-[#00D9A6]" : "text-[#8A8A8A]"}`}>
                            {r.solved}/{isRound2 ? 1 : 8}
                          </span>
                        </div>

                        <div className="hidden text-right font-mono text-[13px] text-[#8A8A8A] sm:col-span-1 sm:block">
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
