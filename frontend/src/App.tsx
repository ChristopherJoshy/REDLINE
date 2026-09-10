import { useCallback, useEffect, useState } from "react";
import EnterScreen from "@/screens/EnterScreen";
import AdminTeams from "@/screens/AdminTeams";
import AdminBoard from "@/screens/AdminBoard";
import GatedArena, { GatesPanel } from "@/screens/GatedArena";
import FullscreenLock from "@/shell/FullscreenLock";
import AntiTamper from "@/shell/AntiTamper";
import { me } from "@/api/teams";

const CREDITS =
  "Key items: Walters Art Museum (CC BY-SA 3.0), Schott Pharma (CC BY-SA 4.0), Jon Sullivan (PD), Karl432 (CC BY-SA 4.0), GW Simulations (PD), Lewis Ronald (CC BY-SA 3.0), Simon A. Eugster (CC BY-SA 3.0), Mickey Dai Phat (CC BY-SA 4.0), Brian Campbell (CC BY-SA 4.0), Jef Poskanzer (CC BY 2.0), Paolo Neo (PD), via Wikimedia Commons. Icons: Lorc / Delapouite / sbed via game-icons.net (CC BY 3.0). Full attribution in README.md.";

export default function App(): React.JSX.Element {
  const [path] = useState(() => window.location.pathname);
  const [identity, setIdentity] = useState<{ teamId: string; displayName: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const onLockChange = useCallback((v: boolean) => setLocked(v), []);

  useEffect(() => {
    if (path.startsWith("/admin")) {
      setChecked(true);
      return;
    }
    me()
      .then((m) => setIdentity(m))
      .catch(() => setIdentity(null))
      .finally(() => setChecked(true));
  }, [path]);

  if (path.startsWith("/admin/board")) {
    return <AdminBoard />;
  }
  if (path.startsWith("/admin")) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col gap-4 bg-[var(--color-bg-0)] p-[var(--space)]">
        <AdminTeams />
        <GatesPanel />
      </main>
    );
  }
  if (!checked) {
    return <main className="min-h-[100dvh] bg-[var(--color-bg-0)]" />;
  }
  if (identity === null) {
    return <EnterScreen onIdentified={() => window.location.reload()} />;
  }
  return (
    <main className="no-steal flex min-h-[100dvh] flex-col bg-[var(--color-bg-0)] text-[var(--color-text-1)]">
      <FullscreenLock onLockChange={onLockChange} />
      <AntiTamper />
      <header className="flex h-[56px] items-center gap-4 border-b border-[var(--color-border)] px-[var(--space)]">
        <span className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-wide text-[var(--color-redline)]">
          REDLINE
        </span>
        <span className="ml-auto font-[family-name:var(--font-code)] text-[14px] text-[var(--color-text-3)]">
          {identity.displayName}
        </span>
      </header>
      <GatedArena teamId={identity.teamId} locked={locked} />
      <footer className="flex flex-col items-center justify-center gap-1 border-t border-[var(--color-border)] px-[var(--space)] py-3 text-center">
        <span className="text-[14px] text-[var(--color-text-3)]">Asthra 11.0 CSE event</span>
        <span className="max-w-[110ch] text-[11px] leading-snug text-[var(--color-text-faint)]">{CREDITS}</span>
      </footer>
    </main>
  );
}
