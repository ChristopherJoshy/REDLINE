import { useEffect, useMemo, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { X, VenetianMask, Check, FileText, ShieldAlert, Shield } from "lucide-react";
import type { BotId } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
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
  botId: BotId;
  lockCreate: boolean;
  onSaved: (profile: CoverProfile, isNew: boolean) => void;
  onClose: () => void;
}

const MAX_ALIAS = 40;
const MAX_ROLE = 80;
const MAX_AFFIL = 80;
const MAX_DETAIL = 280;

const EMPTY: CoverFields = { bot_id: "", alias: "", role: "", affiliation: "", detail: "" };

const MARK_OPENING: Record<string, string> = {
  wick: "The claimant presents themselves at the desk as",
  spidey: "The new arrival says they are",
  escanor: "This guest gives their name as",
  stark: "The badge at the lab door reads",
  joker: "The new clown stumbles in calling themselves",
  light: "The visitor claims to be",
  levi: "Papers presented:",
  deadpool: "The callsheet lists",
  itachi: "The visitor gives the name",
  aizen: "It presents itself as",
};

const MARK_BRIEF: Record<string, string> = {
  wick: "The desk runs on paperwork and protocol. A plain name with a verifiable trade reads best.",
  spidey: "A friendly newcomer with school or lab ties blends in. Keep it earnest and specific.",
  escanor: "The tavern welcomes bold guests. A proud trade and a clear allegiance carry weight.",
  stark: "The lab door checks badges and employers. A technical role with a real-sounding outfit works.",
  joker: "The troupe loves a new act. A stage name with a vaudeville trade lands well.",
  light: "Visitors are logged by name and business. State plain business, nothing grand.",
  levi: "Papers get inspected. Short lines, exact titles, no flourish.",
  deadpool: "The callsheet lists working names and gigs. Showbiz trades fit right in.",
  itachi: "Names are given quietly and remembered exactly. Keep it short and consistent.",
  aizen: "Presentation is everything. A composed name with a formal affiliation suits the room.",
};

interface Template {
  label: string;
  alias: string;
  role: string;
  affiliation: string;
  detail: string;
}

const TEMPLATES: Template[] = [
  { label: "Night auditor", alias: "Charon Reyes", role: "Night auditor", affiliation: "Continental, Osaka branch", detail: "Auditing the Osaka ledger after the blackout. Carries stamped reconciliation slips." },
  { label: "Courier", alias: "Mara Voss", role: "Bonded courier", affiliation: "Halcyon Express", detail: "Running a sealed satchel for a client who pays in cash and asks no questions." },
  { label: "Inspector", alias: "Ilya Soren", role: "Safety inspector", affiliation: "Municipal Works, District 9", detail: "Following up on a reported fault in the building systems. Expects cooperation." },
];

function previewLine(botId: BotId, f: CoverFields): string {
  const open = MARK_OPENING[botId] ?? "The visitor claims to be";
  const name = f.alias.trim() === "" ? "..." : `"${f.alias.trim()}"`;
  let s = `${open} ${name}`;
  if (f.role.trim() !== "") s += `, ${f.role.trim()}`;
  if (f.affiliation.trim() !== "") s += ` — ${f.affiliation.trim()}`;
  return `${s}.`;
}

function NameAvatar({ name, hasFiled }: { name: string; hasFiled: boolean }): React.JSX.Element {
  const initials = name.trim().split(/\s+/).map((p: string) => p[0] ?? "").join("").toUpperCase().slice(0, 2);
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center text-[12px] font-bold tracking-wide transition-colors border ${
        hasFiled
          ? "bg-surface-1 text-brass border-border"
          : "bg-surface-2 text-text-1 border-border"
      }`}
    >
      {initials || "?"}
    </span>
  );
}

export default function ProfileModal({ botId, lockCreate, onSaved, onClose }: ProfileModalProps): React.JSX.Element {
  const [status, setStatus] = useState<"loading" | "create" | "manage">("loading");
  const [fields, setFields] = useState<CoverFields>({ ...EMPTY, bot_id: botId });
  const [team, setTeam] = useState<CoverProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const squadRef = useRef<HTMLDivElement>(null);
  const prevTeamLen = useRef(0);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const lore = CHARACTERS[botId];
  const botName = lore?.name ?? botId;
  const botBrief = MARK_BRIEF[botId] ?? "Give a plain name with a trade the mark can check.";

  const required = lockCreate && status === "create";

  const strength = useMemo(() => {
    let s = 0;
    if (fields.alias.trim() !== "") s += 50;
    if (fields.role.trim() !== "") s += 15;
    if (fields.affiliation.trim() !== "") s += 15;
    if (fields.detail.trim() !== "") s += 20;
    return s;
  }, [fields]);

  const filedForBot = useMemo(
    () => new Map(team.filter((t) => t.bot_id === botId).map((t) => [t.display_name, t])),
    [team, botId],
  );

  const allMembers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of team) {
      if (!seen.has(t.display_name)) {
        seen.add(t.display_name);
        out.push(t.display_name);
      }
    }
    return out;
  }, [team]);

  useEffect(() => {
    let dead = false;
    async function load(): Promise<void> {
      const covers = await getTeamCovers().catch(() => [] as CoverProfile[]);
      if (dead) return;
      setTeam(covers);
      const mine = await getCover(botId).catch(() => null);
      if (dead) return;
      if (mine === null) {
        setFields({ bot_id: botId, alias: "", role: "", affiliation: "", detail: "" });
        setStatus("create");
      } else {
        setFields({ bot_id: botId, alias: mine.alias, role: mine.role, affiliation: mine.affiliation, detail: mine.detail });
        setStatus("manage");
      }
    }
    void load();
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" && !required) onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      dead = true;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  useEffect(() => {
    if (status === "loading") return;
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (team.length === 0 || team.length === prevTeamLen.current || reducedMotion()) return;
    prevTeamLen.current = team.length;
    const frame = requestAnimationFrame(() => {
      const rows = squadRef.current?.querySelectorAll<HTMLDivElement>(".squad-row");
      if (!rows || rows.length === 0) return;
      animate(Array.from(rows), {
        opacity: [0, 1],
        translateX: [8, 0],
        delay: stagger(50),
        duration: DUR.panel,
        ease: EASE.out,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [team]);

  function setField<K extends keyof CoverFields>(key: K, value: string): void {
    setFields((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  function applyTemplate(t: Template): void {
    setFields({ bot_id: botId, alias: t.alias, role: t.role, affiliation: t.affiliation, detail: t.detail });
    setError("");
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (fields.alias.trim() === "") {
      setError("Cover name is required — the mark will ask for it first.");
      firstInputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: CoverFields = {
        bot_id: botId,
        alias: fields.alias.trim(),
        role: fields.role.trim(),
        affiliation: fields.affiliation.trim(),
        detail: fields.detail.trim(),
      };
      if (status === "create") {
        try {
          const created = await createCover(payload);
          setFields({ bot_id: botId, alias: created.alias, role: created.role, affiliation: created.affiliation, detail: created.detail });
          setTeam(await getTeamCovers().catch(() => []));
          setStatus("manage");
          onSaved(created, true);
        } catch (err) {
          try {
            const updated = await updateCover(payload);
            setFields({ bot_id: botId, alias: updated.alias, role: updated.role, affiliation: updated.affiliation, detail: updated.detail });
            setTeam(await getTeamCovers().catch(() => []));
            setStatus("manage");
            onSaved(updated, false);
          } catch {
            const mine = await getCover(botId).catch(() => null);
            if (mine !== null) {
              setFields({ bot_id: botId, alias: mine.alias, role: mine.role, affiliation: mine.affiliation, detail: mine.detail });
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
          setFields({ bot_id: botId, alias: updated.alias, role: updated.role, affiliation: updated.affiliation, detail: updated.detail });
          setTeam(await getTeamCovers().catch(() => []));
          onSaved(updated, false);
        } catch (err) {
          try {
            const created = await createCover(payload);
            setFields({ bot_id: botId, alias: created.alias, role: created.role, affiliation: created.affiliation, detail: created.detail });
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

  const inputClass = "h-[44px] w-full border-0 border-b border-border bg-transparent px-0 text-[14px] text-text-1 placeholder:text-text-1 focus:outline-none focus:border-border transition-colors font-mono";
  const strengthLabel = strength < 50 ? "WEAK — add a name" : strength < 85 ? "MODERATE — add detail" : "STRONG — ready to transmit";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-1 p-3  sm:p-6"
      onMouseDown={() => { if (!required) onClose(); }}
    >
      <div
        className="relative flex w-full max-w-[920px] max-h-[90dvh] flex-col overflow-hidden bg-surface-1 border border-border"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="relative flex items-center justify-between border-b border-border px-6 py-4 bg-surface-1">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-brass-wash" />
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-border bg-surface-1 text-brass">
              <VenetianMask className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="cover-title" className="font-[family-name:var(--font-code)] text-[10px] font-bold tracking-[0.22em] text-text-1 uppercase">
                  {status === "create" ? "NEW DOSSIER" : "DOSSIER ON FILE"}
                </h2>
                <span className="font-[family-name:var(--font-code)] text-[9px] text-brass tracking-widest">// {botId.toUpperCase()}</span>
              </div>
              <p className="text-[17px] font-bold text-text-1 mt-0.5">
                {botName}
                {lore?.moniker && <span className="text-text-1 font-normal text-[14px] ml-2">· {lore.moniker}</span>}
              </p>
            </div>
          </div>
          {!required && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center text-text-1 hover:text-text-1 hover:bg-surface-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </header>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
          {/* LEFT: Form */}
          <div className="flex flex-1 min-w-0 flex-col overflow-y-auto redline-scroll">
            {status === "loading" ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-surface-2 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => void submit(e)} className="flex flex-col">
                {/* Hero image strip */}
                {lore?.heroImage && (
                  <div className="relative h-[130px] overflow-hidden border-b border-border">
                    <img src={lore.heroImage} alt={botName} className="w-full h-full object-cover object-top" style={{ filter: "brightness(0.35) contrast(1.1)" }} />
                    <div className="absolute inset-0 bg-surface-1   " />
                    <div className="absolute inset-0 bg-surface-1   " />
                    <div className="absolute bottom-3 left-6">
                      <p className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.22em] text-brass uppercase">Target Mark</p>
                      <p className="text-[19px] font-bold text-text-1 leading-tight">{botName}</p>
                      {lore.tagline && <p className="text-[11px] text-text-1 italic mt-0.5">{lore.tagline}</p>}
                    </div>
                    <div className="absolute top-3 right-4 flex items-center gap-1.5 px-2 py-1 border border-border bg-surface-1 ">
                      <Shield className="w-3 h-3 text-text-1" />
                      <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.15em] text-text-1 uppercase">{lore.difficulty}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-6 p-6">
                  {/* Cover Identity */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.25em] text-brass uppercase">01 / Cover Identity</span>
                      <div className="flex-1 h-px bg-surface-2" />
                    </div>
                    <label className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.15em] text-text-1 uppercase">Cover Name *</span>
                        <span className="font-[family-name:var(--font-code)] text-[9px] text-text-1">{fields.alias.trim().length}/{MAX_ALIAS}</span>
                      </div>
                      <input ref={firstInputRef} value={fields.alias} onChange={(e) => setField("alias", e.target.value)} maxLength={MAX_ALIAS} placeholder="e.g. Charon Reyes" className={inputClass} />
                    </label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.15em] text-text-1 uppercase">Role</span>
                          <span className="font-[family-name:var(--font-code)] text-[9px] text-text-1">{fields.role.trim().length}/{MAX_ROLE}</span>
                        </div>
                        <input value={fields.role} onChange={(e) => setField("role", e.target.value)} maxLength={MAX_ROLE} placeholder="e.g. Night auditor" className={inputClass} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.15em] text-text-1 uppercase">Affiliation</span>
                          <span className="font-[family-name:var(--font-code)] text-[9px] text-text-1">{fields.affiliation.trim().length}/{MAX_AFFIL}</span>
                        </div>
                        <input value={fields.affiliation} onChange={(e) => setField("affiliation", e.target.value)} maxLength={MAX_AFFIL} placeholder="e.g. Continental, Osaka branch" className={inputClass} />
                      </label>
                    </div>
                  </div>

                  {/* Cover Story */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.25em] text-brass uppercase">02 / Cover Story</span>
                      <div className="flex-1 h-px bg-surface-2" />
                    </div>
                    <label className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.15em] text-text-1 uppercase">Story for the mark</span>
                        <span className="font-[family-name:var(--font-code)] text-[9px] text-text-1">{fields.detail.trim().length}/{MAX_DETAIL}</span>
                      </div>
                      <textarea value={fields.detail} onChange={(e) => setField("detail", e.target.value)} maxLength={MAX_DETAIL} rows={3} placeholder="e.g. Auditing the Osaka ledger after the blackout." className="w-full resize-none border-0 border-b border-border bg-transparent px-0 py-2 text-[14px] text-text-1 placeholder:text-text-1 focus:outline-none focus:border-border transition-colors font-mono" />
                    </label>
                  </div>

                  {/* Preview */}
                  <div className="flex flex-col gap-2 border border-border bg-surface-2/[0.015] p-3">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-text-1" />
                      <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.2em] text-text-1 uppercase">How {botName} Files You</span>
                    </div>
                    <p className="text-[13px] text-text-1 italic leading-relaxed font-mono">{previewLine(botId, fields)}</p>
                  </div>

                  {/* Templates */}
                  <div className="flex flex-col gap-2">
                    <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.2em] text-text-1 uppercase">Quick Templates</span>
                    <div className="flex gap-2 flex-wrap">
                      {TEMPLATES.map((t) => (
                        <button key={t.label} type="button" onClick={() => applyTemplate(t)} className="px-3 py-1.5 border border-border bg-surface-2/[0.025] text-[11px] text-text-1 font-mono tracking-wide hover:border-border hover:text-text-1 hover:bg-surface-1 transition-all">
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Error */}
                  {error !== "" && (
                    <p role="alert" className="border border-border bg-surface-1 px-3 py-2 text-[12px] font-mono text-brass">
                      {error}
                    </p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={busy || fields.alias.trim() === ""}
                    className="relative mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 overflow-hidden bg-brass-wash text-[13px] font-bold tracking-[0.15em] text-text-1 uppercase disabled:opacity-40 transition-all hover:bg-brass-wash active:scale-[0.99]"
                  >
                    {busy
                      ? (status === "create" ? "TRANSMITTING..." : "UPDATING...")
                      : status === "create"
                        ? `TRANSMIT DOSSIER — ${botName.toUpperCase()}`
                        : "UPDATE DOSSIER"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* RIGHT: Intel Panel */}
          <aside className="flex w-full md:w-[280px] md:max-w-[280px] shrink-0 flex-col border-t md:border-t-0 md:border-l border-border bg-surface-1 overflow-y-auto redline-scroll">
            {/* Filing Brief */}
            <section className="flex flex-col gap-2 border-b border-border p-5">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-text-1" />
                <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.2em] text-text-1 uppercase">Filing Brief</span>
              </div>
              <p className="text-[13px] text-text-1 leading-relaxed">{botBrief}</p>
            </section>

            {/* Dossier Strength */}
            <section className="flex flex-col gap-3 border-b border-border p-5">
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.2em] text-text-1 uppercase">Dossier Strength</span>
                <span className="font-[family-name:var(--font-code)] text-[10px] text-brass">{strength}%</span>
              </div>
              <div className="h-1 w-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={strength} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brass-wash " style={{ width: `${strength}%` }} />
              </div>
              <p className="font-[family-name:var(--font-code)] text-[10px] text-text-1">{strengthLabel}</p>
            </section>

            {/* Squad Intel */}
            <section ref={squadRef} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-1.5">
                <span className="font-[family-name:var(--font-code)] text-[9px] tracking-[0.2em] text-text-1 uppercase">Squad Intel</span>
                <span className="font-[family-name:var(--font-code)] text-[9px] text-brass">// {botName.toUpperCase()}</span>
              </div>
              {allMembers.length === 0 ? (
                <p className="text-[12px] text-text-1 font-mono">No team data yet.</p>
              ) : (
                <div className="flex flex-col gap-0">
                  {allMembers.map((memberName) => {
                    const filed = filedForBot.get(memberName);
                    const hasFiled = filed !== undefined;
                    return (
                      <div key={memberName} className="squad-row flex items-center gap-2.5 py-2.5 border-b border-border">
                        <NameAvatar name={memberName} hasFiled={hasFiled} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-text-1">{memberName}</p>
                          {hasFiled ? (
                            <p className="truncate text-[11px] text-text-1 font-mono">
                              {filed.alias}{filed.role ? ` · ${filed.role}` : ""}
                            </p>
                          ) : (
                            <p className="text-[11px] text-text-1 font-mono">— not filed</p>
                          )}
                        </div>
                        {hasFiled ? (
                          <span className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 border border-border bg-surface-1 text-[8px] font-bold tracking-[0.12em] text-brass font-mono">
                            <Check className="w-2.5 h-2.5" />FILED
                          </span>
                        ) : (
                          <span className="shrink-0 px-1.5 py-0.5 border border-border text-[8px] font-bold tracking-[0.12em] text-text-1 font-mono">
                            PENDING
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
