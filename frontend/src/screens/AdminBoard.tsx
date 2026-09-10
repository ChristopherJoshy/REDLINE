import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface BoardRow {
  name: string;
  elo: number;
  solved: number;
  rewinds: number;
  lastSolve: string | null;
}

// Projector route. Admin-auth only, never linked from player UI.
// Refresh note: 5s poll, not WS — the admin has no team identity for WS rooms.
export default function AdminBoard(): React.JSX.Element {
  const [code, setCode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [error, setError] = useState("");
  const [backup, setBackup] = useState("");

  useEffect(() => {
    if (!authed) {
      return;
    }
    let dead = false;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/admin/board", { headers: { "x-admin-code": code } });
        if (res.status === 401) {
          setAuthed(false);
          setError("unauthorized");
          return;
        }
        const data = (await res.json()) as { rows: BoardRow[] };
        if (!dead) {
          setRows(data.rows);
        }
      } catch {
        // Projector keeps the last frame on transient failure.
      }
    }
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, [authed, code]);

  async function download(table: string): Promise<void> {
    const res = await fetch(`/api/admin/export.csv?table=${table}`, { headers: { "x-admin-code": code } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function snapshot(): Promise<void> {
    const res = await fetch("/api/admin/backup", { method: "POST", headers: { "x-admin-code": code } });
    const data = (await res.json()) as { file: string };
    setBackup(data.file);
  }

  if (!authed) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--color-bg-0)] p-[var(--space)]">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold text-[var(--color-text-1)]">Projector</h1>
        <form
          className="flex w-full max-w-[320px] flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setAuthed(code !== "");
          }}
        >
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Admin code"
            className="min-h-[44px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 text-[16px] text-[var(--color-text-1)]"
          />
          <Button type="submit">Unlock</Button>
        </form>
        {error !== "" && <p role="alert" className="text-[14px] text-[var(--color-redline-soft)]">{error}</p>}
      </main>
    );
  }

  return (
    <main data-density="leanback" className="min-h-[100dvh] bg-[var(--color-bg-0)] p-[var(--space)] text-[var(--color-text-1)]">
      <h1 className="font-[family-name:var(--font-display)] text-[30px] font-bold tracking-wide text-[var(--color-redline)]">
        REDLINE STANDINGS
      </h1>
      <table className="mt-4 w-full border-collapse">
        <thead className="sticky top-0 bg-[var(--color-bg-0)]">
          <tr className="text-left text-[12px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">
            <th className="border-b border-[var(--color-border-strong)] p-2">#</th>
            <th className="border-b border-[var(--color-border-strong)] p-2">Team</th>
            <th className="border-b border-[var(--color-border-strong)] p-2">ELO</th>
            <th className="border-b border-[var(--color-border-strong)] p-2">Solved</th>
            <th className="border-b border-[var(--color-border-strong)] p-2">Rewinds</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className="text-[20px]">
              <td className="border-b border-[var(--color-border)] p-2 font-[family-name:var(--font-code)] text-[var(--color-text-3)]">{i + 1}</td>
              <td className="border-b border-[var(--color-border)] p-2">{r.name}</td>
              <td className="border-b border-[var(--color-border)] p-2 font-[family-name:var(--font-code)] font-bold text-[var(--color-info)]">{r.elo}</td>
              <td className="border-b border-[var(--color-border)] p-2 font-[family-name:var(--font-code)]">{r.solved} ✓</td>
              <td className="border-b border-[var(--color-border)] p-2 font-[family-name:var(--font-code)]">{r.rewinds} ↺</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6 flex flex-wrap gap-2">
        {["elo_log", "chat_logs", "team_inventory"].map((t) => (
          <Button key={t} variant="ghost" onClick={() => void download(t)}>
            {t}.csv
          </Button>
        ))}
        <Button variant="ghost" onClick={() => void snapshot()}>
          Snapshot .db
        </Button>
      </div>
      {backup !== "" && <p className="mt-2 font-[family-name:var(--font-code)] text-[14px] text-[var(--color-text-3)]">{backup}</p>}
    </main>
  );
}
