import { useEffect, useState } from "react";
import { Copy, EyeOff, Maximize, MousePointerClick, ShieldAlert } from "lucide-react";
import {
  getAssessmentSettings,
  updateAssessmentSettings,
  type AssessmentSettings,
} from "@/api/assessment";

const CONTROLS: Array<{
  key: keyof AssessmentSettings;
  label: string;
  description: string;
  icon: typeof ShieldAlert;
}> = [
  { key: "requireFullscreen", label: "Require fullscreen", description: "Pause player input whenever the arena leaves fullscreen. Turning this off restores normal input immediately.", icon: Maximize },
  { key: "detectTabSwitches", label: "Record tab switches", description: "Log when a player hides the arena tab and show an immediate notice.", icon: EyeOff },
  { key: "singleTabMode", label: "Single tab per identity", description: "Close an older live socket when the same identity connects in another tab.", icon: ShieldAlert },
  { key: "disableRightClick", label: "Disable context menu", description: "Add friction against casual inspection outside form controls.", icon: MousePointerClick },
  { key: "disableCopyPaste", label: "Disable copy and paste", description: "Block common clipboard and developer shortcuts while enabled.", icon: Copy },
];

export default function AssessmentControls({ adminCode }: { adminCode: string }): React.JSX.Element {
  const [settings, setSettings] = useState<AssessmentSettings | null>(null);
  const [busyKey, setBusyKey] = useState<keyof AssessmentSettings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let dead = false;
    getAssessmentSettings(adminCode)
      .then((value) => { if (!dead) setSettings(value); })
      .catch((reason: unknown) => { if (!dead) setError(reason instanceof Error ? reason.message : "Could not load settings."); });
    return () => { dead = true; };
  }, [adminCode]);

  async function toggle(key: keyof AssessmentSettings): Promise<void> {
    if (settings === null || busyKey !== null) return;
    setBusyKey(key);
    setError("");
    setMessage("");
    try {
      const updated = await updateAssessmentSettings(adminCode, { ...settings, [key]: !settings[key] });
      setSettings(updated);
      setMessage(`${CONTROLS.find((control) => control.key === key)?.label ?? "Setting"} updated.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update settings.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6" aria-labelledby="assessment-title">
      <header>
        <p className="font-mono text-xs font-semibold tracking-[0.14em] text-brass">ASSESSMENT MODE</p>
        <h2 id="assessment-title" className="mt-2 font-display text-3xl font-bold text-text-1">Player safeguards</h2>
        <p className="mt-2 max-w-[65ch] text-text-2">These controls add event-day friction and logging. The backend remains the authority for every score, item, and gate.</p>
      </header>
      {error !== "" && <p role="alert" className="rounded-[6px] border border-seal bg-seal-wash p-3 text-sm font-medium text-seal">{error}</p>}
      {message !== "" && <p role="status" className="rounded-[6px] border border-moss-border bg-moss-wash p-3 text-sm font-medium text-moss">{message}</p>}
      {settings === null ? (
        <p role="status" className="text-text-3">Loading player safeguards…</p>
      ) : (
        <div className="divide-y divide-border rounded-[8px] border border-border bg-surface-1">
          {CONTROLS.map((control) => {
            const Icon = control.icon;
            const active = settings[control.key];
            return <div key={control.key} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex max-w-2xl items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-brass"><Icon size={18} aria-hidden="true" /></span>
                <div><h3 className="font-semibold text-text-1">{control.label}</h3><p className="mt-1 text-sm leading-relaxed text-text-3">{control.description}</p></div>
              </div>
              <button type="button" role="switch" aria-checked={active} disabled={busyKey !== null} onClick={() => void toggle(control.key)} className={`min-h-[44px] min-w-28 rounded-[6px] border px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${active ? "border-brass bg-brass-wash text-brass-ink" : "border-border-strong bg-surface-1 text-text-2"}`}>
                {busyKey === control.key ? "Saving…" : active ? "Enabled" : "Disabled"}
              </button>
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
