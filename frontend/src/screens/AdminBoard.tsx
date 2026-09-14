import { useEffect, useState } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";
import {
  ShieldAlert,
  Download,
  Database,
  Radio
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
    <span className="flex h-12 w-12 items-center justify-center rounded-[2px] border border-[#3F3F46] bg-[#27272A]" aria-hidden="true">
      <ShieldAlert className="h-6 w-6 text-[#EF4444]" />
    </span>
  );
}

export default function AdminBoard(): React.JSX.Element {
  const [rows, setRows] = useState<BoardRow[]>([]);
  useDocumentTitle("Clocktower Citadel Board — REDLINE Arena");
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
        const data = (await res.json()) as { rows: BoardRow[] };
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
        const data = (await res.json()) as { rows: BoardRow[] };
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
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#18181B] p-6 text-[#F4F4F5] font-sans">
        <div className="flex w-full max-w-[420px] flex-col items-center gap-6 rounded-[2px] border border-[#3F3F46] bg-[#27272A] p-8">
          <BoardSeal />
          <div className="text-center">
            <h1 className="font-mono text-[20px] font-bold tracking-wider text-[#F4F4F5] uppercase">
              Clocktower Citadel Board
            </h1>
            <p className="mt-1 text-[13px] text-[#A1A1AA]">
              Squad Command Auth
            </p>
          </div>

          <form onSubmit={submitCode} className="flex w-full flex-col gap-4">
            <input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="COMMAND PIN"
              aria-label="Admin PIN"
              className="min-h-[48px] rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-4 text-center font-mono text-[15px] text-[#F4F4F5] placeholder:text-[#A1A1AA]/50 focus:border-[#EF4444] focus:outline-none"
            />
            <button
              type="submit"
              className="min-h-[48px] rounded-[2px] bg-[#EF4444] px-4 py-3 font-semibold text-[#F4F4F5] uppercase tracking-wider hover:bg-[#EF4444]/90 transition"
            >
              Authenticate
            </button>
            {error !== "" && <p role="alert" className="text-center text-[13px] font-mono text-[#EF4444]">{error}</p>}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-start bg-[#18181B] p-6 sm:p-8 lg:p-10 select-none text-[#F4F4F5] font-sans">
      <div className="z-10 flex w-full max-w-[1200px] flex-col items-center">
        <header className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-none bg-[#EF4444]" />
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#A1A1AA]">
              REDLINE // TACTICAL CYBER-OPS
            </span>
          </div>
          <h1 className="font-mono text-[clamp(26px,4vw,38px)] font-bold tracking-[0.15em] text-[#F4F4F5] uppercase">
            CLOCKTOWER CITADEL BOARD
          </h1>
          <p className="mt-2 text-[13px] text-[#A1A1AA]">
            Real-time squad standings & Relic solve status
          </p>
        </header>

        <div className="w-full rounded-[2px] border border-[#3F3F46] bg-[#27272A] p-6 sm:p-8">
          <div className="mb-3 grid grid-cols-12 items-center border-b border-[#3F3F46] bg-[#18181B] px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA]">
            <div className="col-span-2 text-center sm:col-span-1">RANK</div>
            <div className="col-span-4 pl-2 sm:col-span-4">SQUAD</div>
            <div className="col-span-2 text-center sm:col-span-2">HINT</div>
            <div className="col-span-2 text-right sm:col-span-2">ELO</div>
            <div className="col-span-2 text-center sm:col-span-2">SOLVES</div>
            <div className="hidden text-right sm:col-span-1 sm:block">REWIND</div>
          </div>

          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BoardSeal />
                <p className="mt-4 font-mono text-[18px] font-bold text-[#F4F4F5] uppercase">
                  No Active Telemetry
                </p>
                <p className="mt-1 text-[13px] text-[#A1A1AA]">
                  Telemetry stream awaiting first Guardrail Bypass event.
                </p>
              </div>
            ) : (
              rows.map((r, i) => {
                const rank = i + 1;
                const topRank = rank === 1;

                return (
                  <div
                    key={r.name}
                    className={`grid grid-cols-12 items-center rounded-[2px] border px-6 py-4 transition-colors ${
                      topRank
                        ? "border-[#EF4444] bg-[#18181B]"
                        : "border-[#3F3F46] bg-[#18181B]/60 hover:bg-[#18181B]"
                    }`}
                  >
                    <div className="col-span-2 flex items-center justify-center sm:col-span-1">
                      <span className={`font-mono text-[14px] font-bold ${topRank ? "text-[#EF4444]" : "text-[#A1A1AA]"}`}>
                        #{rank.toString().padStart(2, "0")}
                      </span>
                    </div>

                    <div className="col-span-4 min-w-0 pl-2 sm:col-span-4">
                      <span className="block truncate font-sans text-[15px] font-semibold text-[#F4F4F5]">
                        {r.name}
                      </span>
                    </div>

                    <div className="col-span-2 text-center sm:col-span-2">
                      <span className="inline-block rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-3 py-1 font-mono text-[12px] text-[#F4F4F5]">
                        {r.hint || "SEC-00"}
                      </span>
                    </div>

                    <div className="col-span-2 text-right sm:col-span-2">
                      <span className="font-mono text-[20px] font-bold text-[#F4F4F5]">
                        {r.elo}
                      </span>
                    </div>

                    <div className="col-span-2 text-center sm:col-span-2">
                      <span className={`font-mono text-[14px] font-bold ${r.solved > 0 ? "text-[#10B981]" : "text-[#A1A1AA]"}`}>
                        {r.solved}/8
                      </span>
                    </div>

                    <div className="hidden text-right font-mono text-[13px] text-[#A1A1AA] sm:col-span-1 sm:block">
                      {r.rewinds}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className="mt-6 flex w-full items-center justify-between px-2 text-[12px] text-[#A1A1AA]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-none bg-[#10B981]" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-wider">Telemetry Stream · 5s sync</span>
          </div>

          <button
            type="button"
            onClick={() => setShowTools((v) => !v)}
            className="rounded-[2px] border border-[#3F3F46] bg-[#27272A] px-3 py-1.5 font-mono text-[11px] text-[#F4F4F5] uppercase tracking-wider hover:bg-[#3F3F46] transition"
            aria-expanded={showTools}
          >
            {showTools ? "Hide Tools" : "System Tools"}
          </button>
        </footer>

        {showTools && (
          <section
            aria-label="Organizer tools"
            className="mt-4 flex w-full flex-wrap items-center justify-between gap-4 rounded-[2px] border border-[#3F3F46] bg-[#27272A] p-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="mr-2 font-mono text-[12px] font-bold uppercase tracking-wider text-[#A1A1AA]">Data Export:</span>
              {["elo_log", "chat_logs", "team_inventory"].map((t) => (
                <Button
                  key={t}
                  variant="ghost"
                  className="h-10 rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-3 font-mono text-[12px] text-[#F4F4F5] hover:bg-[#3F3F46]"
                  onClick={() => void download(t)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5 text-[#A1A1AA]" />
                  <span>{t}.csv</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                className="h-10 rounded-[2px] border border-[#3F3F46] bg-[#18181B] px-3 font-mono text-[12px] text-[#F4F4F5] hover:bg-[#3F3F46]"
                onClick={() => void snapshot()}
              >
                <Database className="mr-1.5 h-3.5 w-3.5 text-[#A1A1AA]" />
                <span>Snapshot DB</span>
              </Button>
            </div>

            {backup !== "" && (
              <p className="font-mono text-[12px] text-[#10B981]">
                Snapshot Saved: {backup}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

