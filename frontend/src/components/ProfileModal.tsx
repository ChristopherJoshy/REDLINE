import { useEffect, useMemo, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { X, VenetianMask, Users, Check, ChevronLeft, ChevronRight, FileText, ShieldAlert } from "lucide-react";
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

/** Public flavor only — mirrors the server lens openings so the preview reads true. No secrets. */
const MARK_OPENING: Record<string, string> = {
  wick: "The claimant presents themselves at the desk as",
  spidey: "The new arrival says they're",
  escanor: "This guest gives their name as",
  stark: "The badge at the lab door reads",
  joker: "The new clown stumbles in calling themselves",
  light: "The visitor claims to be",
  levi: "Papers presented:",
  deadpool: "The callsheet lists",
  itachi: "The visitor gives the name",
  aizen: "It presents itself as",
};

/** Public filing brief per mark. Flavor and procedure only — never hints, tells, or answers. */
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
  hint: string;
  alias: string;
  role: string;
  affiliation: string;
  detail: string;
}

const TEMPLATES: Template[] = [
  {
    label: "Night auditor",
    hint: "Paperwork trade, easy to verify",
    alias: "Charon Reyes",
    role: "Night auditor",
    affiliation: "Continental, Osaka branch",
    detail: "Auditing the Osaka ledger after the blackout. Carries stamped reconciliation slips.",
  },
  {
    label: "Courier",
    hint: "Reason to be anywhere",
    alias: "Mara Voss",
    role: "Bonded courier",
    affiliation: "Halcyon Express",
    detail: "Running a sealed satchel for a client who pays in cash and asks no questions.",
  },
  {
    label: "Inspector",
    hint: "Authority to ask questions",
    alias: "Ilya Soren",
    role: "Safety inspector",
    affiliation: "Municipal Works, District 9",
    detail: "Following up on a reported fault in the building systems. Expects cooperation.",
  },
];

const STEPS = ["Identity", "Posting", "Story"] as const;

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

function previewLine(botId: BotId, f: CoverFields): string {
  const open = MARK_OPENING[botId] ?? "The visitor claims to be";
  const name = f.alias.trim() === "" ? "…" : `"${f.alias.trim()}"`;
  let s = `${open} ${name}`;
  if (f.role.trim() !== "") s += `, ${f.role.trim()}`;
  if (f.affiliation.trim() !== "") s += ` — ${f.affiliation.trim()}`;
  return `${s}.`;
}

export default function ProfileModal({ botId, lockCreate, onSaved, onClose }: ProfileModalProps): React.JSX.Element {
  const [status, setStatus] = useState<"loading" | "create" | "manage">("loading");
  const [fields, setFields] = useState<CoverFields>({ ...EMPTY, bot_id: botId });
  const [team, setTeam] = useState<CoverProfile[]>([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const squadSectionRef = useRef<HTMLElement>(null);
  const prevTeamLen = useRef(0);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const lore = CHARACTERS[botId];
  const botName = lore?.name ?? botId;
  const botBrief = MARK_BRIEF[botId] ?? "Give a plain name with a trade the mark can check.";

  // Locked until a cover exists for this mark: no dismiss without filing.
  const required = lockCreate && status === "create";

  const strength = useMemo(() => {
    let s = 0;
    if (fields.alias.trim() !== "") s += 50;
    if (fields.role.trim() !== "") s += 15;
    if (fields.affiliation.trim() !== "") s += 15;
    if (fields.detail.trim() !== "") s += 20;
    return s;
  }, [fields]);

  const squadForBot = useMemo(() => team.filter((t) => t.bot_id === botId), [team, botId]);
  const otherCovers = team.length - squadForBot.length;

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
        setStep(0);
      } else {
        setFields({ bot_id: botId, alias: mine.alias, role: mine.role, affiliation: mine.affiliation, detail: mine.detail });
        setStatus("manage");
        setStep(2);
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
    // required intentionally read once per status change via closure below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  // Focus the name field when the form first appears
  useEffect(() => {
    if (status === "loading") return;
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [status]);

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
    setFieldError("");
  }

  function applyTemplate(t: Template): void {
    setFields({ bot_id: botId, alias: t.alias, role: t.role, affiliation: t.affiliation, detail: t.detail });
    setFieldError("");
    setError("");
    setStep(2);
  }

  function next(): void {
    if (step === 0 && fields.alias.trim() === "") {
      setFieldError("Give your cover a name. The mark asks for it first.");
      return;
    }
    setFieldError("");
    setStep((s) => Math.min(2, s + 1));
  }

  function back(): void {
    setFieldError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (fields.alias.trim() === "") {
      setStep(0);
      setFieldError("Give your cover a name. The mark asks for it first.");
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
          // If profile already exists (409), recover by updating so edits are not lost
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
          // If profile was somehow not found on server (404), fall back to create
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

  const inputClass =
    "min-h-[48px] w-full rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={() => { if (!required) onClose(); }}
    >
      <div
        className="redline-panel relative flex w-full max-w-[880px] max-h-[90vh] flex-col overflow-hidden rounded-[12px]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[rgba(255,30,45,0.25)] bg-[rgba(5,7,10,0.7)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[rgba(255,30,45,0.45)] bg-[rgba(255,30,45,0.12)] text-[#ff5b64]">
              <VenetianMask className="w-5 h-5" />
            </span>
            <div>
              <h2 id="cover-title" className="font-[family-name:var(--font-display)] text-[19px] font-bold text-[var(--color-text-1)]">
                {status === "create" ? `File a cover for ${botName}` : `Cover for ${botName}`}
              </h2>
              <p className="text-[13px] text-[var(--color-text-3)]">
                {status === "create"
                  ? required
                    ? `File a cover to talk to ${botName}. One per mark.`
                    : `One cover per mark. ${botName} will test it.`
                  : "Filed. The mark has it on record. Update any time."}
              </p>
            </div>
          </div>
          {!required && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close cover"
              className="min-h-[44px] min-w-[44px] rounded-[6px] p-1.5 text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] transition"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </header>

        <div className="grid flex-1 min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-[1fr_300px]">
          <div className="flex min-w-0 flex-col gap-5 p-6">
            {status === "loading" ? (
              <LoadingDots />
            ) : (
              <>
                {/* Step progress */}
                <ol aria-label="Cover steps" className="flex items-center gap-2">
                  {STEPS.map((label, i) => {
                    const done = i < step || status === "manage";
                    const current = i === step && status !== "manage";
                    return (
                      <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                          aria-current={current ? "step" : undefined}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border text-[13px] font-bold ${
                            done
                              ? "border-[var(--color-moss-border)] bg-[var(--color-moss-wash)] text-[var(--color-moss)]"
                              : current
                                ? "border-[var(--color-brass)] bg-[var(--color-brass-wash)] text-[var(--color-brass-ink)]"
                                : "border-[var(--color-border)] text-[var(--color-text-3)]"
                          }`}
                        >
                          {done ? <Check className="w-4 h-4" /> : i + 1}
                        </span>
                        <span className={`text-[12px] font-semibold ${current || done ? "text-[var(--color-text-1)]" : "text-[var(--color-text-3)]"}`}>
                          {label}
                        </span>
                        {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 h-px flex-1 bg-[var(--color-border)]" />}
                      </li>
                    );
                  })}
                </ol>

                <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
                  {step === 0 && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="text-[15px] font-bold text-[var(--color-text-1)]">Who walks in?</h3>
                        <p className="text-[13px] text-[var(--color-text-3)]">
                          The mark asks for a name first. Pick one you will answer to for the whole conversation.
                        </p>
                      </div>
                      <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                        <span className="flex items-center justify-between">
                          <span>Cover name</span>
                          <span className="font-mono text-[11px] font-medium text-[var(--color-text-3)]">
                            {fields.alias.trim().length}/{MAX_ALIAS}
                          </span>
                        </span>
                        <input
                          ref={firstInputRef}
                          value={fields.alias}
                          onChange={(e) => set("alias", e.target.value)}
                          maxLength={MAX_ALIAS}
                          placeholder="e.g. Charon Reyes"
                          aria-describedby="alias-help"
                          className={inputClass}
                        />
                      </label>
                      <p id="alias-help" className="text-[12px] text-[var(--color-text-3)]">
                        Use a full name. Single names and titles get questioned.
                      </p>
                      {fieldError !== "" && (
                        <p role="alert" className="rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3 py-2 text-[13px] font-semibold text-[var(--color-seal)]">
                          {fieldError}
                        </p>
                      )}
                      <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
                        <h4 className="text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                          START FROM A TEMPLATE
                        </h4>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {TEMPLATES.map((t) => (
                            <button
                              key={t.label}
                              type="button"
                              onClick={() => applyTemplate(t)}
                              className="flex min-h-[44px] flex-col items-start gap-0.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2 text-left hover:border-[var(--color-brass)] transition-colors"
                            >
                              <span className="text-[13px] font-bold text-[var(--color-text-1)]">{t.label}</span>
                              <span className="text-[12px] text-[var(--color-text-3)]">{t.hint}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="text-[15px] font-bold text-[var(--color-text-1)]">What is your posting?</h3>
                        <p className="text-[13px] text-[var(--color-text-3)]">
                          A trade plus an outfit gives the mark something checkable. Both are optional but both help.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                          <span className="flex items-center justify-between">
                            <span>Role</span>
                            <span className="font-mono text-[11px] font-medium text-[var(--color-text-3)]">
                              {fields.role.trim().length}/{MAX_ROLE}
                            </span>
                          </span>
                          <input
                            value={fields.role}
                            onChange={(e) => set("role", e.target.value)}
                            maxLength={MAX_ROLE}
                            placeholder="e.g. Night auditor"
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                          <span className="flex items-center justify-between">
                            <span>Affiliation</span>
                            <span className="font-mono text-[11px] font-medium text-[var(--color-text-3)]">
                              {fields.affiliation.trim().length}/{MAX_AFFIL}
                            </span>
                          </span>
                          <input
                            value={fields.affiliation}
                            onChange={(e) => set("affiliation", e.target.value)}
                            maxLength={MAX_AFFIL}
                            placeholder="e.g. Continental, Osaka branch"
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <p className="text-[12px] text-[var(--color-text-3)]">
                        Name an employer, branch, or crew. “Freelance” with no ties reads thin under questioning.
                      </p>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="text-[15px] font-bold text-[var(--color-text-1)]">Why are you here?</h3>
                        <p className="text-[13px] text-[var(--color-text-3)]">
                          One concrete errand beats a grand story. Keep it to what fits on the papers.
                        </p>
                      </div>
                      <label className="flex flex-col gap-1 text-[13px] font-semibold text-[var(--color-text-1)]">
                        <span className="flex items-center justify-between">
                          <span>Story for the mark</span>
                          <span className="font-mono text-[11px] font-medium text-[var(--color-text-3)]">
                            {fields.detail.trim().length}/{MAX_DETAIL}
                          </span>
                        </span>
                        <textarea
                          value={fields.detail}
                          onChange={(e) => set("detail", e.target.value)}
                          maxLength={MAX_DETAIL}
                          rows={3}
                          placeholder="e.g. Auditing the Osaka ledger after the blackout."
                          className="w-full resize-none rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-bg-0)] px-4 py-3 text-[15px] text-[var(--color-text-1)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-brass)] transition-colors"
                        />
                      </label>
                      <div className="flex flex-col gap-1.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-0)] px-3 py-2.5">
                        <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                          <FileText className="w-4 h-4" />
                          <span>HOW {botName.toUpperCase()} FILES YOU</span>
                        </p>
                        <p className="text-[13px] text-[var(--color-text-2)]">{previewLine(botId, fields)}</p>
                      </div>
                    </div>
                  )}

                  {error !== "" && (
                    <p role="alert" className="rounded-[6px] border border-[var(--color-seal)] bg-[var(--color-seal-wash)] px-3 py-2 text-[13px] font-semibold text-[var(--color-seal)]">
                      {error}
                    </p>
                  )}

                  <div className="mt-1 flex items-center gap-2">
                    {step > 0 && status !== "manage" && (
                      <button
                        type="button"
                        onClick={back}
                        className="flex min-h-[48px] items-center gap-1 rounded-[6px] border border-[var(--color-border-strong)] px-4 text-[15px] font-semibold text-[var(--color-text-1)] hover:bg-[var(--color-surface-2)] active:scale-[0.98] transition"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>
                    )}
                    {status !== "manage" && step < 2 ? (
                      <button
                        type="button"
                        onClick={next}
                        className="redline-cta flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-[8px] px-6 py-3.5 text-[15px] font-semibold active:scale-[0.98]"
                      >
                        <span>Continue</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={busy || fields.alias.trim() === ""}
                        className="redline-cta min-h-[48px] flex-1 rounded-[8px] px-6 py-3.5 text-[15px] font-semibold disabled:opacity-50 active:scale-[0.98]"
                      >
                        {busy ? (status === "create" ? "Filing..." : "Updating...") : status === "create" ? `File cover for ${botName}` : "Update cover"}
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-4 border-t border-[var(--color-border)] bg-[var(--color-bg-0)] p-6 md:border-l md:border-t-0">
            <section aria-label="Mark brief" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                <ShieldAlert className="w-4 h-4" />
                <span>THE MARK</span>
              </h3>
              <p className="text-[14px] font-bold text-[var(--color-text-1)]">
                {botName}
                {lore?.moniker ? <span className="font-normal text-[var(--color-text-3)]"> · {lore.moniker}</span> : null}
              </p>
              {lore?.tagline ? <p className="text-[12px] italic text-[var(--color-text-3)]">{lore.tagline}</p> : null}
              <p className="text-[13px] text-[var(--color-text-2)]">{botBrief}</p>
            </section>

            <section aria-label="Dossier strength" className="flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">DOSSIER STRENGTH</h3>
              <div className="h-2 overflow-hidden rounded-[6px] bg-[var(--color-surface-3)]" role="progressbar" aria-valuenow={strength} aria-valuemin={0} aria-valuemax={100} aria-label="Dossier strength">
                <div
                  className="acc-bg h-full rounded-[6px] transition-[width] duration-300"
                  style={{ width: `${strength}%` }}
                />
              </div>
              <p className="font-mono text-[11px] text-[var(--color-text-3)]">
                {strength}% — {strength < 50 ? "name first" : strength < 85 ? "add a posting" : "ready to file"}
              </p>
            </section>

            <section ref={squadSectionRef} aria-label="Squad covers for this mark" className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.14em] text-[var(--color-text-3)]">
                <Users className="w-4 h-4" />
                <span>SQUAD ON THIS MARK ({squadForBot.length})</span>
              </h3>
              {squadForBot.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-3)]">No squad cover filed for {botName} yet. Yours will be the first.</p>
              ) : (
                squadForBot.map((t) => (
                  <div key={`${t.display_name}-${t.bot_id}`} className="squad-row flex items-center gap-2.5 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2">
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
                ))
              )}
              {otherCovers > 0 && (
                <p className="text-[12px] text-[var(--color-text-3)]">
                  Plus {otherCovers} cover{otherCovers === 1 ? "" : "s"} filed for other marks.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
