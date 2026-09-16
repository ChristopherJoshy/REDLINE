import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Coins, Package, Search, ShieldCheck, X } from "lucide-react";
import { useAnimeIn } from "../lib/useAnimeIn";
import { CHARACTERS } from "../data/characterLore";
import type { InventoryDelta } from "@contracts/events";

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryDelta[];
  credits?: number;
}

export default function InventoryModal({ isOpen, onClose, inventory, credits = 0 }: InventoryModalProps): React.JSX.Element | null {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useAnimeIn(containerRef, { y: 20, duration: 300 });

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const items = useMemo(() => inventory.filter((item) => item.status !== "locked").map((item) => {
    const character = CHARACTERS[item.botId];
    const meta = character?.targetItem;
    return {
      ...item,
      botName: character?.name ?? item.botId,
      name: meta?.name ?? item.itemKey,
      category: meta?.category ?? "Relic",
      rarity: meta?.rarity ?? "Rare",
      asset: meta?.asset ?? "/items/wick_medallion.svg",
      description: meta?.description ?? "An item recovered from a mark.",
    };
  }), [inventory]);
  const filteredItems = items.filter((item) => `${item.name} ${item.botName}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const selectedItem = items.find((item) => item.itemKey === selectedKey) ?? items[0];
  const verifiedCount = items.filter((item) => item.status === "verified").length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="inventory-title">
      <div ref={containerRef} className="flex h-[min(90dvh,760px)] w-full max-w-[1060px] flex-col overflow-hidden border border-[#ff1e2d]/35 bg-[#090d12] shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center border border-[#ff1e2d]/40 bg-[#ff1e2d]/10 text-[#ff5b64]"><Package className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="inventory-title" className="font-[family-name:var(--font-display)] text-[20px] font-bold uppercase tracking-wide text-white">Team satchel</h2><p className="text-[12px] text-white/50">{verifiedCount} filed · {items.length} held or filed</p></div></div>
          <div className="flex items-center gap-3"><span className="inline-flex min-h-[36px] items-center gap-2 border border-[#ff1e2d]/30 bg-[#ff1e2d]/10 px-3 font-mono text-[12px] font-bold text-[#ff8087]"><Coins className="h-4 w-4" aria-hidden="true" />{credits} credits</span><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center border border-white/10 text-white/55 transition hover:border-[#ff1e2d]/50 hover:text-white" aria-label="Close satchel"><X className="h-5 w-5" /></button></div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <main className="min-h-0 w-full shrink-0 border-b border-white/10 p-5 sm:p-6 lg:w-[58%] lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="relative flex min-h-[44px] flex-1 items-center border border-white/12 bg-white/[0.03]"><Search className="ml-3 h-4 w-4 text-white/40" aria-hidden="true" /><span className="sr-only">Search satchel</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search relics" className="h-full w-full bg-transparent px-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-[#ff1e2d]" /></label></div>
            {filteredItems.length === 0 ? <div className="border border-dashed border-white/15 px-4 py-10 text-center text-[13px] text-white/45">No relics match this search.</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{filteredItems.map((item) => { const selected = selectedItem?.itemKey === item.itemKey; const filed = item.status === "verified"; return <button key={item.itemKey} type="button" onClick={() => setSelectedKey(item.itemKey)} className={`group flex min-h-[150px] flex-col justify-between border p-3 text-left transition active:scale-[0.98] ${selected ? "border-[#ff1e2d] bg-[#ff1e2d]/10" : "border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.05]"}`}><span className="flex h-20 items-center justify-center border border-white/10 bg-black/30 p-2"><img src={item.asset} alt={item.name} className="h-full w-full object-contain transition-transform group-hover:scale-105" /></span><span className="mt-3 flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[12px] font-semibold text-white/85">{item.name}</span>{filed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#9db87a]" aria-label="Filed" /> : <Package className="h-4 w-4 shrink-0 text-[#ff5b64]" aria-label="Held" />}</span></button>; })}</div>}
          </main>

          <aside className="min-h-0 w-full bg-[#070a0e]/70 p-5 sm:p-6 lg:w-[42%] lg:overflow-y-auto">{selectedItem ? <div className="flex h-full flex-col"><div className="flex min-h-[170px] items-center justify-center border border-white/10 bg-black/25 p-8"><img src={selectedItem.asset} alt={selectedItem.name} className="max-h-40 max-w-full object-contain" /></div><div className="mt-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff5b64]">{selectedItem.rarity} · {selectedItem.category}</p><h3 className="mt-2 font-[family-name:var(--font-display)] text-[24px] font-bold uppercase leading-tight text-white">{selectedItem.name}</h3><p className="mt-2 text-[12px] text-white/50">Recovered from {selectedItem.botName}</p></div><div className={`mt-5 flex items-center gap-2 border px-3 py-2.5 text-[12px] font-semibold ${selectedItem.status === "verified" ? "border-[#9db87a]/40 bg-[#9db87a]/10 text-[#c9dfa9]" : "border-[#ff1e2d]/35 bg-[#ff1e2d]/10 text-[#ff9ba0]"}`}>{selectedItem.status === "verified" ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <AlertCircle className="h-4 w-4" aria-hidden="true" />}<span>{selectedItem.status === "verified" ? "Filed and locked" : Boolean(selectedItem.claimed) ? "Claimed · awaiting appraisal" : "Held · claim acknowledgement pending"}</span></div><p className="mt-5 text-[13px] leading-relaxed text-white/70">{selectedItem.description}</p><div className="mt-auto border-t border-white/10 pt-5 text-[12px] text-white/45"><p className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#ff5b64]" aria-hidden="true" />Claim and appraisal are separate steps.</p><p className="mt-2">The merchant desk is available from the arena roster.</p></div></div> : <div className="flex h-full items-center justify-center text-center text-[13px] text-white/40">Select a relic to inspect it.</div>}</aside>
        </div>
      </div>
    </div>
  );
}
