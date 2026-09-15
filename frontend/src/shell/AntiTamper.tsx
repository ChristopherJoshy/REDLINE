import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/client";
import type { AssessmentSettingsData } from "@contracts/events";

// Friction-only deterrence based on admin settings
export default function AntiTamper({ settings }: { settings: AssessmentSettingsData }): React.JSX.Element | null {
  const [toast, setToast] = useState("");

  const log = useCallback((kind: string) => {
    void apiFetch("/api/deterrence-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => {});
  }, []);

  const flash = useCallback((message: string, kind: string) => {
    setToast(message);
    log(kind);
    window.setTimeout(() => setToast(""), 2600);
  }, [log]);

  useEffect(() => {
    function onMenu(e: MouseEvent): void {
      if (!settings.disableRightClick) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea")) {
        return;
      }
      e.preventDefault();
      flash("Right-click is disabled in the arena.", "contextmenu");
      window.dispatchEvent(new CustomEvent("arena:security_violation", { detail: { type: "right_click" } }));
    }
    function onKey(e: KeyboardEvent): void {
      if (!settings.disableCopyPaste) return;
      const combo = e.key === "F12"
        || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase()))
        || ((e.ctrlKey || e.metaKey) && ["U", "S", "P", "C", "V"].includes(e.key.toUpperCase()));
      if (combo) {
        e.preventDefault();
        flash("That shortcut is disabled in the arena.", "keycombo");
        window.dispatchEvent(new CustomEvent("arena:security_violation", { detail: { type: "copy_paste" } }));
      }
    }
    function onSelect(e: Event): void {
      if (!settings.disableCopyPaste) return;
      const el = e.target as HTMLElement;
      if (el.closest(".no-steal") !== null && el.closest("input, textarea") === null) {
        e.preventDefault();
      }
    }
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("keydown", onKey);
    document.addEventListener("selectstart", onSelect);
    return () => {
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("selectstart", onSelect);
    };
  }, [flash, settings]);

  useEffect(() => {
    function onVisibilityChange(): void {
      if (!settings.detectTabSwitches || !document.hidden) return;
      flash("Tab switch recorded. Return to the arena.", "tab_switch");
      window.dispatchEvent(new CustomEvent("arena:security_violation", { detail: { type: "tab_switch" } }));
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [flash, settings.detectTabSwitches]);

  if (toast === "") {
    return null;
  }
  return (
    <div role="status" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[6px] border border-seal bg-seal-wash px-5 py-3 text-[14px] font-semibold text-seal">
      {toast}
    </div>
  );
}
