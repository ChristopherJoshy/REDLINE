import { useEffect, useState } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/api/client";
import {
  Clock,
  Download,
  Database
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
    <span className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-[var(--color-border-strong)]" aria-hidden="true">
      <Clock className="h-5 w-5 text-[var(--color-brass)]" />
    </span>
  );
}

export default function AdminBoard(): React.JSX.Element {
  const [rows, setRows] = useState<BoardRow[]>([]);
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
      <main className="dark-cinematic flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--color-bg-0)] p-4">
        <div className="flex w-full max-w-[380px] flex-col items-center gap-5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-8">
          <BoardSeal />
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-display)] text-[22px] font-bold text-[var(--color-text-1)]">
              Standings
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-text-3)]">
              Organizer sign in
            </p>
          </div>

          <form onSubmit={submitCode} className="flex w-full flex-col gap-3">
            <input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="PIN"
              aria-label="Admin PIN"
              className="min-h-[48px] rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-center font-[family-name:var(--font-code)] text-[16px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)]"
            />
            <button
              type="submit"
              className="min-h-[48px] rounded-[6px] bg-[var(--color-text-1)] px-4 py-3 font-semibold text-[var(--color-bg-0)] hover:opacity-90 transition"
            >
              Sign in
            </button>
            {error !== "" && <p role="alert" className="text-center text-[13px] text-[var(--color-seal)]">{error}</p>}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="dark-cinematic flex min-h-[100dvh] flex-col items-center justify-start overflow-x-hidden bg-[var(--color-bg-0)] p-4 sm:p-6 lg:p-8 select-none">
      <div className="z-10 flex w-full max-w-[1100px] flex-col items-center">
        <header className="mb-6 flex flex-col items-center text-center">
          <span aria-hidden="true" className="mb-3 block h-[3px] w-12 bg-[var(--color-brass)]" />
          <p className="font-[family-name:var(--font-code)] text-[11px] tracking-[0.25em] text-[var(--color-text-3)]">
            ASTHRA 11.0
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[clamp(28px,5vw,44px)] font-bold tracking-[0.1em] text-[var(--color-text-1)]">
            STANDINGS
          </h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-3)]">
            Live standings
          </p>
        </header>

        <div className="w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 sm:p-5">
          <div className="mb-2 grid grid-cols-12 items-center rounded-[6px] bg-[var(--color-surface-2)] px-4 py-3 text-[12px] font-semibold text-[var(--color-text-3)] sm:px-6">
            <div className="col-span-2 text-center sm:col-span-1">#</div>
            <div className="col-span-4 pl-2 sm:col-span-4">Team</div>
            <div className="col-span-2 text-center font-[family-name:var(--font-code)] sm:col-span-2">ID</div>
            <div className="col-span-2 text-right sm:col-span-2">ELO</div>
            <div className="col-span-2 text-center sm:col-span-2">Filed</div>
            <div className="hidden text-right sm:col-span-1 sm:block">Back</div>
          </div>

          <div className="flex max-h-[64vh] flex-col gap-2 overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BoardSeal />
                <p className="mt-4 font-[family-name:var(--font-display)] text-[20px] font-bold text-[var(--color-text-1)]">
                  No scores yet
                </p>
                <p className="mt-1 text-[14px] text-[var(--color-text-3)]">
                  Scores appear here as marks are filed.
                </p>
              </div>
            ) : (
              rows.map((r, i) => {
                const rank = i + 1;
                const first = rank === 1;

                return (
                  <div
                    key={r.name}
                    className={`grid grid-cols-12 items-center rounded-[6px] border px-4 py-3.5 sm:px-6 ${
                      first
                        ? "border-[var(--color-border-strong)] bg-[var(--color-brass-wash)]"
                        : "border-[var(--color-border)]"
                    }`}
                  >
                    <div className="col-span-2 flex items-center justify-center sm:col-span-1">
                      <span className={`font-[family-name:var(--font-code)] text-[15px] font-bold ${first ? "text-[var(--color-brass-ink)]" : "text-[var(--color-text-2)]"}`}>
                        {rank}
                      </span>
                    </div>

                    <div className="col-span-4 min-w-0 pl-2 sm:col-span-4">
                      <span className="block truncate font-[family-name:var(--font-display)] text-[17px] font-bold text-[var(--color-text-1)]">
                        {r.name}
                      </span>
                    </div>

                    <div className="col-span-2 text-center sm:col-span-2">
                      <span className="inline-block rounded-[6px] border border-[var(--color-border)] px-2.5 py-1 font-[family-name:var(--font-code)] text-[12px] text-[var(--color-text-2)]">
                        {r.hint || "...."}
                      </span>
                    </div>

                    <div className="col-span-2 text-right sm:col-span-2">
                      <span className="font-[family-name:var(--font-code)] text-[22px] font-bold text-[var(--color-text-1)]">
                        {r.elo}
                      </span>
                    </div>

                    <div className="col-span-2 text-center sm:col-span-2">
                      <span className="font-[family-name:var(--font-code)] text-[14px] font-bold text-[var(--color-text-1)]">
                        {r.solved}/8
                      </span>
                    </div>

                    <div className="hidden text-right font-[family-name:var(--font-code)] text-[14px] text-[var(--color-text-3)] sm:col-span-1 sm:block">
                      {r.rewinds}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className="mt-4 flex w-full items-center justify-between px-2 text-[12px] text-[var(--color-text-3)]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-moss)]" aria-hidden="true" />
            <span className="font-[family-name:var(--font-code)]">Live · 5s sync</span>
          </div>

          <button
            type="button"
            onClick={() => setShowTools((v) => !v)}
            className="min-h-[44px] rounded-[6px] px-2.5 py-1 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition"
            aria-expanded={showTools}
          >
            {showTools ? "Hide tools" : "Tools"}
          </button>
        </footer>

        {showTools && (
          <section
            aria-label="Organizer tools"
            className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-[13px] font-semibold text-[var(--color-text-2)]">Export:</span>
              {["elo_log", "chat_logs", "team_inventory"].map((t) => (
                <Button
                  key={t}
                  variant="ghost"
                  className="h-11 border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
                  onClick={() => void download(t)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  <span>{t}.csv</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                className="h-11 border border-[var(--color-border)] px-3 text-[13px] text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)]"
                onClick={() => void snapshot()}
              >
                <Database className="mr-1.5 h-3.5 w-3.5" />
                <span>Snapshot .db</span>
              </Button>
            </div>

            {backup !== "" && (
              <p className="font-[family-name:var(--font-code)] text-[11px] text-[var(--color-moss)]">
                Saved: {backup}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
