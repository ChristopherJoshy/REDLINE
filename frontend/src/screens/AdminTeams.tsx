import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createTeam, type CreateTeamResult } from "@/api/teams";

export default function AdminTeams(): React.JSX.Element {
  const [adminCode, setAdminCode] = useState("");
  const [name, setName] = useState("");
  const [rawMembers, setRawMembers] = useState("");
  const [created, setCreated] = useState<CreateTeamResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const members = rawMembers.split("\n").map((m) => m.trim()).filter((m) => m !== "");
      setCreated(await createTeam(adminCode, name.trim(), members));
      setName("");
      setRawMembers("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6" aria-label="Teams">
      <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold text-[var(--color-text-1)]">
        Teams
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[14px] text-[var(--color-text-2)]">
          Admin code
          <input
            type="password"
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
            className="min-h-[44px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 text-[16px] text-[var(--color-text-1)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[14px] text-[var(--color-text-2)]">
          Team name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[44px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 text-[16px] text-[var(--color-text-1)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[14px] text-[var(--color-text-2)]">
          Members, one per line (2-4)
          <textarea
            value={rawMembers}
            onChange={(e) => setRawMembers(e.target.value)}
            rows={4}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-4 text-[16px] text-[var(--color-text-1)]"
          />
        </label>
        <Button type="submit" disabled={busy}>
          Create team
        </Button>
      </form>
      {created !== null && (
        <section aria-live="polite" className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-4">
          <p className="text-[14px] text-[var(--color-text-3)]">Share this code once. It will not be shown again.</p>
          <p className="mt-2 font-[family-name:var(--font-code)] text-[28px] font-bold text-[var(--color-info)]">{created.code}</p>
          <p className="mt-1 text-[14px] text-[var(--color-text-2)]">
            {created.name} · hint {created.hint}
          </p>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => {
              void navigator.clipboard.writeText(created.code);
            }}
          >
            Copy code
          </Button>
        </section>
      )}
      {error !== "" && (
        <p role="alert" className="text-[14px] text-[var(--color-redline-soft)]">
          {error}
        </p>
      )}
    </section>
  );
}
