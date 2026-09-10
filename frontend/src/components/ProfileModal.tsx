import { useEffect, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { X, VenetianMask, Users, Check } from "lucide-react";
import {
  getCover,
  getTeamCovers,
  createCover,
  updateCover,
  type CoverFields,
  type CoverProfile,
} from "@/api/profiles";
import { DUR, EASE, reducedMotion } from "@/lib/motionTokens";

interface ProfileModalProps {
  lockCreate: boolean;
  onSaved: (profile: CoverProfile, isNew: boolean) => void;
  onClose: () => void;
}

const EMPTY: CoverFields = { alias: "", role: "", affiliation: "", detail: "" };

/** Minimal loading dots reusing Anime.js — avoids importing TypingBubble */
function LoadingDots(): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    const dots = ref.current?.querySelectorAll<HTMLSpanElement>(".load-dot");
    if (!dots) return;
    const anim = animate(Array.from(dots), {
      opacity: [0.2, 1, 0.2],
      duration: 700,
      delay: stagger(130),
      loop: true,
      ease: "inOutSine",
    });
    return () => { anim.pause(); };
  }, []);

  return (
    <span ref={ref} className="flex items-center justify-center gap-1.5 py-8">
      {[0, 1, 2].map((i) => (
        <span key={i} className="load-dot block h-2 w-2 rounded-full bg-[var(--color-text-faint)]" />
      ))}
    </span>
  );
}

export default function ProfileModal({ lockCreate, onSaved, onClose }: ProfileModalProps): React.JSX.Element {
  const [status, setStatus] = useState<"loading" | "create" | "manage">("loading");
  const [fields, setFields] = useState<CoverFields>(EMPTY);
  const [team, setTeam] = useState<CoverProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const squadSectionRef = useRef<HTMLElement>(null);
  const prevTeamLen = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      const covers = await getTeamCovers().catch(() => [] as CoverProfile[]);
      if (dead) return;
      setTeam(covers);
      const mine = await getCover().catch(() => null);
      if (dead) return;
      if (mine === null) {
        setStatus("create");
      } else {
        setFields({ alias: mine.alias, role: mine.role, affiliation: mine.affiliation, detail: mine.detail });
        setStatus("manage");
      }
    }
    void load();
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      dead = true;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Squad list stagger when team populates
  useEffect(() => {
    if (team.length === 0 || team.length === prevTeamLen.current || reducedMotion()) return;
    prevTeamLen.current = team.length;
    const frame = requestAnimationFrame(() => {
      const rows = squadSectionRef.current?.querySelectorAll<HTMLDivElement>(".squad-row");
      if (!rows || rows.length === 0) return;
      animate(Array.from(rows), {
        opacity: [0, 1],
        translateX: [-6, 0],
        delay: stagger(60),
        duration: DUR.panel,
        ease: EASE.out,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [team]);

  function set<K extends keyof CoverFields>(key: K, value: string): void {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (fields.alias.trim() === "") {
      setError("Give your cover a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: CoverFields = {
        alias: fields.alias.trim(),
        role: fields.role.trim(),
        affiliation: fields.affiliation.trim(),
        detail: fields.detail.trim(),
      };
      if (status === "create") {
        try {
          const created = await createCover(payload);
          setFields({ alias: created.alias, role: created.role, affiliation: created.affiliation, detail: created.detail });
          setTeam(await getTeamCovers().catch(() => []));
          setStatus("manage");
          onSaved(created, true);
        } catch (err) {
          // If profile already exists (409), recover by updating so edits are not lost
          try {
            const updated = await updateCover(payload);
            setFields({ alias: updated.alias, role: updated.role, affiliation: updated.affiliation, detail: updated.detail });
            setTeam(await getTeamCovers().catch(() => []));
            setStatus("manage");
            onSaved(updated, false);
          } catch {
            const mine = await getCover().catch(() => null);
            if (mine !== null) {
              setFields({ alias: mine.alias, role: mine.role, affiliation: mine.affiliation, detail: mine.detail });
              setTeam(await getTeamCovers().catch(() => []));
              setStatus("manage");
              setError("");
            } else {
              setError(err instanceof Error ? err.message : "Cover save failed");
            }
          }
        }
      } else {
        try {
          const updated = await updateCover(payload);
          setFields({ alias: updated.alias, role: updated.role, affiliation: updated.affiliation, detail: updated.detail });
          setTeam(await getTeamCovers().catch(() => []));
          onSaved(updated, false);
        } catch (err) {
          // If profile was somehow not found on server (404), fall back to create
          try {
            const created = await createCover(payload);
            setFields({ alias: created.alias, role: created.role, affiliation: created.affiliation, detail: created.detail });
            setTeam(await getTeamCovers().catch(() => []));
            setStatus("manage");
            onSaved(created, true);
          } catch {
            setError(err instanceof Error ? err.message : "Cover save failed");
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[640px] max-h-[90vh] flex-col overflow-hidden rounded-[8px] border border-[var(--color-border-strong)] bg-[var(--color-surface-1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[var(--color-text-1)] text-[var(--color-bg-0)]">
              <VenetianMask className="w-5 h-5" />
            </span>
            <div>
              <h2 id="cover-title" className="font-[family-name:var(--font-display)] text-[19px] font-bold text-[var(--color-text-1)]">
                {status === "create" ? "File a cover" : "Cover"}
              </h2>
              <p className="text-[13px] text-[var(--color-text-3)]">
                {status === "create"
                  ? lockCreate
                    ? "File a cover to talk to marks. You can also go back."
                    : "One per operator. Marks will test it."
                  : "Shared with the squad. Update any time."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cover"
            className="min-h-[44px] min-w-[44px] rounded-[6px] p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          {status === "loading" ? (
            <LoadingDots />
          ) : (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                <span>Name</span>
                <input
                  value={fields.alias}
                  onChange={(e) => set("alias", e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Charon Reyes"
                  className="min-h-[48px] rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                  <span>Role</span>
                  <input
                    value={fields.role}
                    onChange={(e) => set("role", e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Night auditor"
                    className="min-h-[48px] rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                  <span>Affiliation</span>
                  <input
                    value={fields.affiliation}
                    onChange={(e) => set("affiliation", e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Continental, Osaka branch"
                    className="min-h-[48px] rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                <span>Note for the mark</span>
                <textarea
                  value={fields.detail}
                  onChange={(e) => set("detail", e.target.value)}
                  maxLength={280}
                  rows={2}
                  placeholder="e.g. Auditing the Osaka ledger after the blackout."
                  className="resize-none rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 py-3 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
                />
              </label>
              {error !== "" && (
                <p role="alert" className="rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3 py-2 text-[13px] font-semibold text-[var(--color-seal)]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || fields.alias.trim() === ""}
                className="mt-1 min-h-[48px] rounded-[6px] bg-[var(--color-text-1)] px-6 py-3.5 text-[15px] font-semibold text-[var(--color-bg-0)] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {busy ? (status === "create" ? "Filing..." : "Updating...") : status === "create" ? "File cover" : "Update cover"}
              </button>
            </form>
          )}

          {team.length > 0 && (
            <section ref={squadSectionRef} aria-label="Squad covers" className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                <Users className="w-4 h-4" />
                <span>SQUAD ({team.length})</span>
              </h3>
              {team.map((t) => (
                <div key={t.display_name} className="squad-row flex items-center gap-2.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2">
                  <Check className="w-4 h-4 shrink-0 text-[var(--color-moss)]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--color-text-1)]">
                      {t.alias} <span className="font-normal text-[var(--color-text-3)]">· {t.display_name}</span>
                    </p>
                    {(t.role !== "" || t.affiliation !== "") && (
                      <p className="truncate text-[12px] text-[var(--color-text-3)]">
                        {[t.role, t.affiliation].filter((s) => s !== "").join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
