import { useState, useRef, useEffect } from "react";
import { Package, X, ShieldCheck, AlertCircle, Search, Filter, ArrowRight, Box, Link } from "lucide-react";
import { useAnimeIn } from "../lib/useAnimeIn";
import { CHARACTERS } from "../data/characterLore";
import type { InventoryDelta } from "@contracts/events";

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryDelta[];
  credits?: number;
  onOpenMerchant?: () => void;
}

export default function InventoryModal({ isOpen, onClose, inventory, credits = 0, onOpenMerchant }: InventoryModalProps): React.JSX.Element | null {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  
  useAnimeIn(containerRef, {
    y: 20,
    duration: 300,
  });

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const enrichedItems = inventory.filter((inv) => inv.status !== "locked").map((inv) => {
    const char = CHARACTERS[inv.botId];
    const itemMeta = char?.targetItem;
    return {
      botId: inv.botId,
      botName: char?.name ?? inv.botId,
      itemKey: inv.itemKey,
      status: inv.status,
      name: itemMeta?.name ?? inv.itemKey,
      category: itemMeta?.category ?? "Relic",
      rarity: itemMeta?.rarity ?? "Rare",
      asset: itemMeta?.asset ?? "/items/wick_medallion.svg",
      description: itemMeta?.description ?? "An item brought back from a mark.",
      authenticityTell: itemMeta?.authenticityTell ?? "Check against the merchant ledger.",
      decoyWarning: itemMeta?.decoyWarning ?? "The merchant rejects decoys.",
      bounty: itemMeta?.merchantBounty ?? 100,
    };
  });

  const filteredItems = enrichedItems.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    i.botName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedItem = enrichedItems.find((i) => i.itemKey === selectedKey) ?? enrichedItems[0] ?? null;
  const verifiedCount = enrichedItems.filter((i) => i.status === "verified").length;

  const getRarityColor = (rarity: string) => {
    switch(rarity.toLowerCase()) {
      case 'mythic': return 'bg-purple-500';
      case 'legendary': return 'bg-yellow-400';
      case 'epic': return 'bg-pink-500';
      case 'rare': return 'bg-blue-400';
      case 'uncommon': return 'bg-red-500';
      case 'common': return 'bg-gray-300';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="inv-title">
      <div ref={containerRef} className="relative flex w-full max-w-[1200px] h-[90vh] max-h-[850px] flex-col rounded-[12px] bg-[#090b0e] border border-white/5 overflow-hidden shadow-2xl">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/5 bg-black/20 px-6 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#ff2a2a]/40 bg-[#ff2a2a]/10 text-[#ff2a2a]">
              <Box className="w-6 h-6" />
            </span>
            <div className="flex flex-col">
              <h2 id="inv-title" className="font-serif text-[22px] tracking-wide text-white/90 uppercase">
                Inventory
              </h2>
              <span className="text-[13px] text-white/50 tracking-wide">
                Filed {verifiedCount} of 8 · Holding {enrichedItems.length} of 8
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 rounded-[6px] border border-[#d4af37]/30 bg-[#d4af37]/5 px-4 py-2 text-[14px] font-medium text-[#d4af37] transition hover:bg-[#d4af37]/10">
              <Link className="w-4 h-4" />
              <span>240 credits</span>
            </button>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition p-2">
              <X className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left Pane: Items List */}
          <main className="flex w-full lg:w-[60%] flex-col border-r border-white/5 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-serif text-[20px] text-white/90">Items</h3>
              <span className="text-[14px] text-white/50">{enrichedItems.length} held</span>
            </div>

            <div className="flex gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input 
                  type="text" 
                  placeholder="Search items..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-[6px] py-2 pl-9 pr-4 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition"
                />
              </div>
              <button className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-[6px] px-4 py-2 text-[13px] text-white/70 hover:bg-white/10 transition min-w-[140px]">
                <span>Sort: Default</span>
                <span className="text-[10px]">▼</span>
              </button>
              <button className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-[6px] px-4 py-2 text-[13px] text-white/70 hover:bg-white/10 transition">
                <Filter className="w-4 h-4" />
                <span>All Items</span>
                <span className="text-[10px] ml-1">▼</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => {
                const isSelected = selectedItem?.itemKey === item.itemKey;
                return (
                  <button
                    key={item.itemKey}
                    onClick={() => setSelectedKey(item.itemKey)}
                    className={`group relative flex aspect-[4/5] flex-col rounded-[8px] border p-4 transition text-left overflow-hidden ${
                      isSelected 
                        ? "border-[#ff2a2a] bg-gradient-to-b from-[#ff2a2a]/5 to-[#ff2a2a]/10" 
                        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex-1 flex items-center justify-center p-2 mb-2">
                      <img src={item.asset} alt={item.name} className="max-h-[100px] w-auto object-contain drop-shadow-lg transition-transform group-hover:scale-105" />
                    </div>
                    <div className="flex flex-col gap-1.5 mt-auto">
                      <span className={`text-[13px] font-semibold leading-tight line-clamp-2 ${isSelected ? "text-white" : "text-white/80"}`}>
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rotate-45 ${getRarityColor(item.rarity)} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                      </div>
                    </div>
                  </button>
                );
              })}
              
              {/* Fill empty slots to make it look full if needed */}
              {Array.from({ length: Math.max(0, 8 - filteredItems.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-[4/5] rounded-[8px] border border-white/5 bg-white/[0.01]" />
              ))}
            </div>
          </main>

          {/* Right Pane: Item Details */}
          <aside className="flex w-full lg:w-[40%] flex-col p-6 bg-white/[0.01] overflow-hidden relative">
            {selectedItem ? (
              <div className="flex flex-col h-full">
                <div className="relative flex flex-1 min-h-[120px] w-full items-center justify-center rounded-[8px] border border-white/5 bg-gradient-to-b from-white/[0.05] to-transparent mb-4 sm:mb-6 p-4 sm:p-8">
                  <img src={selectedItem.asset} alt={selectedItem.name} className="max-h-full max-w-full object-contain drop-shadow-2xl" />
                </div>

                <div className="flex flex-col gap-1 mb-4 sm:mb-6 shrink-0">
                  <h3 className="font-serif text-[20px] sm:text-[24px] tracking-wide text-white/90 uppercase leading-tight">
                    {selectedItem.name}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] text-white/50">
                    From <span className="font-medium text-white/80">{selectedItem.botName}</span>
                  </p>
                </div>

                {selectedItem.status === "verified" ? (
                  <div className="flex shrink-0 items-center gap-3 rounded-[6px] border border-[#10b981]/30 bg-[#10b981]/10 px-4 py-2.5 sm:py-3 mb-4 sm:mb-6">
                    <ShieldCheck className="w-5 h-5 text-[#10b981]" />
                    <span className="text-[11px] font-bold tracking-widest text-[#10b981] uppercase">Verified & Filed</span>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-3 rounded-[6px] border border-[#ff2a2a]/30 bg-[#ff2a2a]/10 px-4 py-2.5 sm:py-3 mb-4 sm:mb-6">
                    <AlertCircle className="w-5 h-5 text-[#ff2a2a]" />
                    <span className="text-[11px] font-bold tracking-widest text-[#ff2a2a] uppercase">Held · Needs Appraisal</span>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:gap-4 shrink-0 text-[12px] sm:text-[13px] text-white/60 leading-relaxed pb-4 sm:pb-6">
                  <div className="flex flex-col gap-1.5 border-b border-white/5 pb-3">
                    <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">About</span>
                    <p className="line-clamp-3 sm:line-clamp-none">{selectedItem.description}</p>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 border-b border-white/5 pb-3">
                    <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Tell</span>
                    <p className="line-clamp-2 sm:line-clamp-none">{selectedItem.authenticityTell}</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Decoy</span>
                    <p className="line-clamp-2 sm:line-clamp-none">{selectedItem.decoyWarning}</p>
                  </div>
                </div>

                {selectedItem.status !== "verified" && onOpenMerchant && (
                  <button
                    onClick={() => {
                      onOpenMerchant();
                      onClose();
                    }}
                    className="mt-auto shrink-0 flex w-full items-center justify-center gap-3 rounded-[6px] bg-gradient-to-r from-[#cc0000] to-[#aa0000] px-6 py-4 text-[14px] font-medium text-white shadow-[0_0_20px_rgba(255,42,42,0.2)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Box className="w-5 h-5" />
                    <span>Take to merchant</span>
                    <ArrowRight className="w-4 h-4 ml-auto" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-white/30">
                <Package className="w-16 h-16 mb-4 opacity-50" />
                <p>Select an item to view details</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
