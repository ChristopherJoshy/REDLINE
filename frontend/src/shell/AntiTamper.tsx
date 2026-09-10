import { useCallback, useEffect, useState } from "react";

// Friction-only deterrence: toasts + server log. Never the gate —
// DevTools, view-source, curl, and JS-off always bypass scripts, so no
// secrets, flags, scores, or role checks live in client code. Server is truth.
export default function AntiTamper(): React.JSX.Element | null {
  const [toast, setToast] = useState("");

  const log = useCallback((kind: string) => {
    void fetch("/api/deterrence-log", {
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
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea")) {
        return;
      }
      e.preventDefault();
      flash("Right-click is disabled in the arena.", "contextmenu");
    }
    function onKey(e: KeyboardEvent): void {
      const combo = e.key === "F12"
        || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase()))
        || ((e.ctrlKey || e.metaKey) && ["U", "S", "P"].includes(e.key.toUpperCase()));
      if (combo) {
        e.preventDefault();
        flash("That shortcut is disabled in the arena.", "keycombo");
      }
    }
    function onSelect(e: Event): void {
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
  }, [flash]);

  if (toast === "") {
    return null;
  }
  return (
    <div role="status" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--color-warn)] bg-[var(--color-surface-2)] px-4 py-2 text-[14px] text-[var(--color-text-1)]">
      {toast}
    </div>
  );
}
