import { useEffect, useRef, useState } from "react";
import type { BotId } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import { claimItem } from "@/api/merchant";
import { Check, Gift, ShieldAlert, X } from "lucide-react";

interface ClaimItemModalProps {
  botId: BotId;
  itemKey: string;
  claimed: boolean;
  onClaim: () => void;
  onClaimed?: () => void;
}

export default function ClaimItemModal({ botId, itemKey, claimed, onClaim, onClaimed }: ClaimItemModalProps): React.JSX.Element {
  const lore = CHARACTERS[botId];
  const itemMeta = lore?.targetItem;
  const [isClaimed, setIsClaimed] = useState(claimed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const claimButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    claimButtonRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClaim();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClaim]);

  async function handleClaim(): Promise<void> {
    if (isClaimed || busy) return;
    setBusy(true);
    setError("");
    try {
      await claimItem(itemKey);
      setIsClaimed(true);
      onClaimed?.();
      onClaim();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="claim-title">
      <div className="w-full max-w-[440px] overflow-hidden border border-[#ff1e2d]/35 bg-[#090d12] shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff5b64]">Satchel update</p>
            <h2 id="claim-title" className="mt-1 font-[family-name:var(--font-display)] text-[22px] font-bold uppercase tracking-wide text-white">Relic received</h2>
          </div>
          <button type="button" onClick={onClaim} className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/10 text-white/55 transition hover:border-[#ff1e2d]/50 hover:text-white" aria-label="Close claim dialog"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <div className="flex items-center gap-3 border border-white/10 bg-white/[0.03] p-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#ff1e2d]/35 bg-black/40 p-2"><img src={itemMeta?.asset ?? "/items/wick_medallion.svg"} alt={itemMeta?.name ?? itemKey} className="h-full w-full object-contain" /></span>
            <div className="min-w-0"><p className="truncate text-[14px] font-semibold text-white">{itemMeta?.name ?? itemKey}</p><p className="mt-1 text-[12px] text-white/50">From {lore?.name ?? botId} · {itemMeta?.rarity ?? "Rare"} {itemMeta?.category ?? "Relic"}</p></div>
          </div>
          <p className="text-[13px] leading-relaxed text-white/70">{itemMeta?.description ?? "A relic recovered from the conversation."}</p>
          <div className="flex items-start gap-2 border-l-2 border-[#ff1e2d] bg-[#ff1e2d]/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-white/60"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#ff5b64]" aria-hidden="true" /><span>Claim it once to place it in the team satchel. Appraisal happens later at the merchant desk.</span></div>
          {error !== "" && <p role="alert" className="border border-[#ff1e2d]/40 bg-[#ff1e2d]/10 px-3 py-2 text-[12px] text-[#ffb0b5]">{error}</p>}
          <button ref={claimButtonRef} type="button" onClick={() => void handleClaim()} disabled={isClaimed || busy} className={`flex min-h-[50px] w-full items-center justify-center gap-2 border px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] transition active:scale-[0.98] disabled:cursor-default ${isClaimed ? "border-[#9db87a]/45 bg-[#9db87a]/10 text-[#c9dfa9]" : "border-[#ff1e2d] bg-[#ff1e2d] text-white hover:bg-[#ff3b48]"}`}>
            {isClaimed ? <><Check className="h-4 w-4" aria-hidden="true" />Already claimed</> : <><Gift className="h-4 w-4" aria-hidden="true" />{busy ? "Claiming" : "Claim item"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
