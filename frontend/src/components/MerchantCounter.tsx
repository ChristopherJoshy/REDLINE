import { useEffect, useMemo, useState } from "react";
import type { BotId, InventoryDelta } from "@contracts/events";
import { CHARACTERS } from "@/data/characterLore";
import { buyClue, merchantState, submitItem } from "@/api/merchant";
import { ArrowLeft, CheckCircle2, Coins, LockKeyhole, Package, Scale, ShieldAlert } from "lucide-react";

const R1_MARKS: BotId[] = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool"];
const TIERS = [
  { tier: 1, label: "Angle", cost: 30 },
  { tier: 2, label: "Decisive detail", cost: 60 },
] as const;

type Action = "start" | "relics" | "clues";

interface Receipt {
  ok: boolean;
  title: string;
  line: string;
}

export default function MerchantCounter({
  inventory,
  credits,
  say,
  displayName,
}: {
  inventory: InventoryDelta[];
  credits: number;
  say: (botId: BotId, text: string) => void;
  displayName: string;
}): React.JSX.Element {
  const [action, setAction] = useState<Action>("start");
  const [selectedBot, setSelectedBot] = useState<BotId | null>(null);
  const [owned, setOwned] = useState<Record<string, Record<number, string>>>({});
  const [balance, setBalance] = useState(credits);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => setBalance(credits), [credits]);

  useEffect(() => {
    let cancelled = false;
    void merchantState()
      .then((state) => {
        if (cancelled) return;
        const next: Record<string, Record<number, string>> = {};
        for (const clue of state.clues) {
          next[clue.botId] = { ...(next[clue.botId] ?? {}), [clue.tier]: "" };
        }
        setOwned(next);
        setBalance(state.credits);
      })
      .catch(() => {
        // The live inventory sync remains the source of truth for the balance.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const held = useMemo(
    () => inventory.filter((item) => item.status === "obtained" && item.obtainedBy === displayName),
    [displayName, inventory],
  );
  const selectedClues = selectedBot === null ? undefined : owned[selectedBot];

  function itemName(item: InventoryDelta): string {
    return CHARACTERS[item.botId]?.targetItem.name ?? item.itemKey;
  }

  async function sell(item: InventoryDelta): Promise<void> {
    if (busyKey !== null) return;
    setBusyKey(item.itemKey);
    setError("");
    setReceipt(null);
    try {
      const result = await submitItem(item.itemKey);
      if (result.result === "verified") {
        if (typeof result.credits === "number") setBalance(result.credits);
        setReceipt({ ok: true, title: "Article accepted", line: `${itemName(item)} is filed. The mark is closed.` });
        say("merchant", `${itemName(item)} is genuine. Filed, paid, and entered in the ledger.`);
      } else {
        setReceipt({ ok: false, title: "Article rejected", line: result.line });
        say("merchant", result.line);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The counter is unavailable.");
    } finally {
      setBusyKey(null);
    }
  }

  async function unlock(botId: BotId, tier: 1 | 2, label: string): Promise<void> {
    if (busyKey !== null) return;
    setBusyKey(`${botId}:${tier}`);
    setError("");
    try {
      const result = await buyClue(botId, tier);
      setOwned((current) => ({ ...current, [botId]: { ...(current[botId] ?? {}), [tier]: result.clue } }));
      setBalance(result.credits);
      const mark = CHARACTERS[botId]?.name ?? botId;
      say("merchant", result.owned ? `${label} for ${mark} is already unlocked. Ask me about it.` : `${label} unlocked for ${mark}. Ask me about it in the chat.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusyKey(null);
    }
  }

  function resetActions(): void {
    setAction("start");
    setSelectedBot(null);
    setError("");
  }

  return (
    <section className="border-y border-white/10 bg-[#070a0e]/90 px-4 py-4 sm:px-6" aria-label="Merchant actions">
      <div className="mx-auto w-full max-w-[860px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-[#ff1e2d]/40 bg-[#ff1e2d]/10 text-[#ff5b64]" aria-hidden="true">
              <Scale className="h-4 w-4" />
            </span>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff5b64]">Merchant desk</p>
              <p className="text-[13px] text-white/70">Choose an action. The ledger handles the rest.</p>
            </div>
          </div>
          <span className="inline-flex min-h-[36px] items-center gap-2 border border-[#ff1e2d]/30 bg-[#ff1e2d]/10 px-3 font-mono text-[12px] font-bold text-[#ff8087]">
            <Coins className="h-4 w-4" aria-hidden="true" />
            {balance} credits
          </span>
        </div>

        {error !== "" && <p className="mb-3 border border-[#ff1e2d]/40 bg-[#ff1e2d]/10 px-3 py-2 text-[12px] text-[#ffb0b5]" role="alert">{error}</p>}
        {receipt !== null && (
          <div className={`mb-3 flex items-start gap-2 border px-3 py-2.5 text-[12px] ${receipt.ok ? "border-[#9db87a]/40 bg-[#9db87a]/10 text-[#d5e8bb]" : "border-[#ff1e2d]/40 bg-[#ff1e2d]/10 text-[#ffb0b5]"}`} role="status">
            {receipt.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span><strong className="mr-1 font-mono uppercase tracking-wider">{receipt.title}.</strong>{receipt.line}</span>
          </div>
        )}

        {action === "start" && (
          <div>
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">What are you here for?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setAction("relics")} className="flex min-h-[52px] items-center gap-3 border border-white/15 bg-white/[0.04] px-4 text-left text-[13px] font-semibold text-white transition hover:border-[#ff1e2d]/70 hover:bg-[#ff1e2d]/10 active:scale-[0.98]">
                <Package className="h-4 w-4 text-[#ff5b64]" aria-hidden="true" />
                <span><span className="block">Appraise a relic</span><span className="block text-[11px] font-normal text-white/45">Lay a held item on the counter</span></span>
              </button>
              <button type="button" onClick={() => setAction("clues")} className="flex min-h-[52px] items-center gap-3 border border-white/15 bg-white/[0.04] px-4 text-left text-[13px] font-semibold text-white transition hover:border-[#ff1e2d]/70 hover:bg-[#ff1e2d]/10 active:scale-[0.98]">
                <LockKeyhole className="h-4 w-4 text-[#ff5b64]" aria-hidden="true" />
                <span><span className="block">Unlock mark intel</span><span className="block text-[11px] font-normal text-white/45">Buy an angle or decisive detail</span></span>
              </button>
            </div>
          </div>
        )}

        {action === "relics" && (
          <div>
            <button type="button" onClick={resetActions} className="mb-3 inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/55 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Back to actions</button>
            {held.length === 0 ? (
              <p className="border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/55">No held relics. Return to a mark and earn one before you visit the desk.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {held.map((item) => {
                  const lore = CHARACTERS[item.botId];
                  return (
                    <div key={item.itemKey} className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#ff1e2d]/30 bg-black/40 p-1.5"><img src={lore?.targetItem.asset ?? "/items/wick_medallion.svg"} alt="" className="h-full w-full object-contain" /></span>
                        <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-white">{itemName(item)}</span><span className="block text-[11px] text-white/45">{lore?.name ?? item.botId}</span></span>
                      </div>
                      <button type="button" onClick={() => void sell(item)} disabled={busyKey !== null} className="min-h-[44px] shrink-0 border border-[#ff1e2d]/60 bg-[#ff1e2d]/15 px-3 text-[11px] font-bold uppercase tracking-wide text-[#ff9ba0] transition hover:bg-[#ff1e2d]/25 disabled:opacity-50">{busyKey === item.itemKey ? "Checking" : "Lay item"}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {action === "clues" && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <button type="button" onClick={selectedBot === null ? resetActions : () => setSelectedBot(null)} className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/55 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />{selectedBot === null ? "Back to actions" : "All marks"}</button>
              <span className="font-mono text-[11px] text-white/40">Unlocked intel stays in this thread</span>
            </div>
            {selectedBot === null ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {R1_MARKS.map((id) => <button key={id} type="button" onClick={() => setSelectedBot(id)} className="min-h-[48px] border border-white/10 bg-white/[0.03] px-2 text-left text-[12px] font-semibold text-white/80 transition hover:border-[#ff1e2d]/60 hover:bg-[#ff1e2d]/10">{CHARACTERS[id]?.name ?? id}</button>)}
              </div>
            ) : (
              <div className="border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-3 flex items-center gap-3"><img src={CHARACTERS[selectedBot]?.avatar} alt="" className="h-9 w-9 object-cover" /><div><p className="text-[13px] font-semibold text-white">{CHARACTERS[selectedBot]?.name ?? selectedBot}</p><p className="text-[11px] text-white/45">Choose exactly what to unlock</p></div></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TIERS.map((tier) => {
                    const clue = selectedClues?.[tier.tier];
                    const isOwned = clue !== undefined;
                    return isOwned ? (
                      <div key={tier.tier} className="border border-[#9db87a]/35 bg-[#9db87a]/10 p-3 text-left"><p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#c9dfa9]">{tier.label} · unlocked</p><p className="mt-1 text-[12px] leading-relaxed text-white/70">Ask me about this intel in the chat.</p></div>
                    ) : (
                      <button key={tier.tier} type="button" onClick={() => void unlock(selectedBot, tier.tier, tier.label)} disabled={busyKey !== null || balance < tier.cost} className="flex min-h-[74px] items-center justify-between gap-3 border border-white/12 bg-black/20 p-3 text-left transition hover:border-[#ff1e2d]/70 hover:bg-[#ff1e2d]/10 disabled:cursor-not-allowed disabled:opacity-45"><span><span className="block text-[12px] font-semibold text-white">{tier.label}</span><span className="mt-1 block text-[11px] text-white/45">Only this mark's {tier.label.toLowerCase()} is revealed</span></span><span className="shrink-0 font-mono text-[11px] font-bold text-[#ff8087]">{busyKey === `${selectedBot}:${tier.tier}` ? "..." : `${tier.cost} cr`}</span></button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
