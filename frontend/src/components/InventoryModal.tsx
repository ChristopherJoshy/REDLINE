import { useEffect, useState, useMemo } from "react";
import { X, Search, Filter, ShieldCheck, AlertCircle, ArrowRight, Box, Package } from "lucide-react";
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

  const enrichedItems = useMemo(() => {
    return inventory.filter((inv) => inv.status !== "locked").map((inv) => {
      const charMeta = CHARACTERS[inv.botId];
      const itemMeta = charMeta?.targetItem;
      return {
        ...inv,
        botName: charMeta?.name ?? inv.botId,
        name: itemMeta?.name ?? inv.itemKey,
        category: itemMeta?.category ?? "Artifact",
        rarity: itemMeta?.rarity ?? "Legendary",
        asset: itemMeta?.asset ?? "/items/wick_medallion.svg",
        description: itemMeta?.description ?? "An item brought back from a mark.",
        authenticityTell: itemMeta?.authenticityTell ?? "Check against the merchant ledger.",
        bounty: itemMeta?.merchantBounty ?? 100,
      };
    });
  }, [inventory]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return enrichedItems;
    const q = searchQuery.toLowerCase();
    return enrichedItems.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      i.botName.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q)
    );
  }, [enrichedItems, searchQuery]);

  const selectedItem = useMemo(() => {
    return enrichedItems.find((i) => i.itemKey === selectedKey) ?? null;
  }, [enrichedItems, selectedKey]);

  useEffect(() => {
    if (isOpen && !selectedItem && enrichedItems.length > 0) {
      setSelectedKey(enrichedItems[0]?.itemKey ?? null);
    }
  }, [isOpen, enrichedItems, selectedItem]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function getRarityColor(rarity: string): string {
    switch (rarity.toLowerCase()) {
      case "mythic": return "bg-brass";
      case "legendary": return "bg-brass";
      case "epic": return "bg-border-strong";
      case "rare": return "bg-text-3";
      default: return "bg-border-strong";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-1/60 p-4 sm:p-6" onClick={onClose}>
      <div
        className="flex w-full max-w-[1100px] flex-col rounded-[8px] border border-border-strong bg-bg-0 overflow-hidden"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface-1 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-brass" />
            <h2 className="font-serif text-[18px] sm:text-[22px] font-medium tracking-wide text-text-1">Satchel</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-surface-2 px-3 py-1.5 rounded-full border border-border">
              <span className="text-[12px] font-mono text-text-3">CREDITS:</span>
              <span className="text-[13px] font-mono font-bold text-brass">{credits}</span>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-text-2 hover:bg-surface-2 hover:text-text-1 transition-colors"
              aria-label="Close inventory"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
          {/* Left Pane: Items List */}
          <main className="flex w-full lg:w-[55%] flex-col border-b lg:border-b-0 lg:border-r border-border p-4 sm:p-6 overflow-y-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <h3 className="font-serif text-[20px] text-text-1">Held Items ({enrichedItems.length}/8)</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
                <input
                  type="text" 
                  placeholder="Search inventory..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-1 border border-border rounded-md py-2 pl-9 pr-4 text-[13px] text-text-1 placeholder-text-3 focus:outline-none focus:border-brass transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {filteredItems.map((item) => {
                const isSelected = selectedItem?.itemKey === item.itemKey;
                return (
                  <button
                    key={item.itemKey}
                    onClick={() => setSelectedKey(item.itemKey)}
                    className={`group relative flex flex-col rounded-lg border p-3 transition text-left overflow-hidden ${
                      isSelected
                        ? "border-brass bg-brass/10 ring-1 ring-brass/50"
                        : "border-border bg-surface-1 hover:border-text-3"
                    }`}
                  >
                    <div className="flex-1 flex items-center justify-center p-2 mb-2 min-h-[100px]">
                      <img src={item.asset} alt={item.name} className="h-full max-h-[90px] w-auto object-contain transition-transform group-hover:scale-105" />
                    </div>
                    <div className="flex flex-col gap-1 mt-auto">
                      <span className={`text-[12px] font-bold leading-tight line-clamp-2 ${isSelected ? "text-text-1" : "text-text-2 group-hover:text-text-1"}`}>
                        {item.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${getRarityColor(item.rarity)}`} />
                        <span className="text-[10px] uppercase font-bold text-text-3">{item.rarity}</span>
                      </div>
                    </div>
                    {item.status === "verified" && (
                      <div className="absolute top-2 right-2 bg-moss/20 text-moss p-1 rounded-full border border-moss/30">
                        <ShieldCheck className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Fill empty slots */}
              {Array.from({ length: Math.max(0, 8 - filteredItems.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[160px] rounded-lg border border-dashed border-border/50 bg-transparent flex items-center justify-center opacity-30">
                  <Package className="w-8 h-8 text-text-3" />
                </div>
              ))}
            </div>
          </main>

          {/* Right Pane: Item Details */}
          <aside className="flex w-full lg:w-[45%] flex-col p-4 sm:p-6 bg-surface-1/50 overflow-y-auto">
            {selectedItem ? (
              <div className="flex flex-col h-full">
                {/* Image Showcase */}
                <div className="relative flex w-full items-center justify-center rounded-[8px] border border-border bg-surface-2 mb-5 p-6 h-[200px] sm:h-[240px] shrink-0 overflow-hidden">
                  <img src={selectedItem.asset} alt={selectedItem.name} className="relative z-10 h-full w-full object-contain" />
                  {selectedItem.status === "verified" ? (
                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-[6px] border border-moss-border bg-moss-wash px-2 py-1 text-moss font-bold text-[10px] uppercase">
                      <ShieldCheck className="w-3 h-3" /> Verified
                    </div>
                  ) : (
                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-[6px] bg-seal-wash px-2 py-1 text-seal font-bold text-[10px] uppercase border border-seal">
                      <AlertCircle className="w-3 h-3" /> Unverified
                    </div>
                  )}
                </div>

                {/* Info Block */}
                <div className="flex flex-col gap-1 mb-5 shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rotate-45 ${getRarityColor(selectedItem.rarity)}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-2">
                      {selectedItem.rarity} · {selectedItem.category}
                    </span>
                  </div>
                  <h3 className="font-serif text-[22px] sm:text-[26px] font-bold tracking-wide text-text-1 uppercase leading-tight">
                    {selectedItem.name}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] text-text-3 font-mono mt-1">
                    TARGET: <span className="text-text-1 font-bold">{selectedItem.botName.toUpperCase()}</span>
                  </p>
                </div>

                {/* Lore / Description */}
                <div className="flex flex-col gap-4 mb-6">
                  <p className="text-[14px] text-text-2 leading-relaxed italic border-l-2 border-brass/50 pl-4 py-1">
                    "{selectedItem.description}"
                  </p>
                  
                  <div className="rounded-lg border border-border bg-surface-2 p-4 mt-2">
                    <h4 className="text-[10px] font-bold tracking-widest text-text-3 uppercase flex items-center gap-2 mb-2">
                      <Search className="w-3 h-3" /> Appraisal Notice
                    </h4>
                    <p className="text-[13px] text-text-1 leading-relaxed">{selectedItem.authenticityTell}</p>
                  </div>
                </div>

                {/* Call to action */}
                <div className="mt-auto pt-4 shrink-0">
                  {selectedItem.status !== "verified" ? (
                    onOpenMerchant ? (
                      <button
                        onClick={() => {
                          onOpenMerchant();
                          onClose();
                        }}
                        className="redline-cta flex w-full items-center justify-center gap-3 rounded-[6px] px-6 py-3.5 text-[14px] font-bold"
                      >
                        <Box className="w-5 h-5" />
                        <span>Submit for Appraisal</span>
                        <ArrowRight className="w-4 h-4 ml-auto" />
                      </button>
                    ) : null
                  ) : (
                    <div className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-moss-border bg-moss-wash px-6 py-3.5 text-[14px] font-bold text-moss">
                      <ShieldCheck className="w-5 h-5" />
                      <span>Item Secured</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center text-text-3">
                <Package className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm">Select an item to view its details and lore.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
