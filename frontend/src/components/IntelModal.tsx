import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { CHARACTERS } from "@/data/characterLore";
import { apiFetch } from "@/api/client";
import type { BotId } from "@contracts/events";

export default function IntelModal({ onClose }: { onClose: () => void }) {
  const [unlockedBots, setUnlockedBots] = useState<Set<BotId>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    apiFetch("/api/merchant/state")
      .then((data: any) => {
        if (!dead && data.clues) {
          const set = new Set<BotId>();
          for (const c of data.clues) {
            set.add(c.botId);
          }
          setUnlockedBots(set);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!dead) setLoading(false);
      });
    return () => { dead = true; };
  }, []);

  const targets = Object.values(CHARACTERS).filter(
    (c) => c.id !== "merchant" && c.id !== "itachi" && c.id !== "aizen"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="redline-panel max-w-2xl w-full rounded-[12px] border border-white/10 p-6 flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
          <h3 className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[0.08em] text-white">
            TACTICAL INTEL & DOSSIER
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-3)] hover:text-white font-bold text-[16px] px-2 py-1"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-white/20">
          {loading ? (
            <p className="text-white/50 text-[13px] animate-pulse">Decrypting merchant ledgers...</p>
          ) : (
            <>
              <p className="text-[13px] text-[var(--color-text-2)] leading-relaxed mb-1">
                Intel must be purchased from the Bazaar Merchant using credits earned by filing authentic relics.
              </p>

              {targets.map((char) => (
                <div key={char.id} className="flex flex-col gap-1.5 p-4 rounded-[8px] border border-white/5 bg-white/5">
                  <div className="flex items-center justify-between">
                    <span
                      className="font-bold text-white text-[14px] uppercase tracking-wide"
                      style={{ color: char.accent }}
                    >
                      {char.name}
                    </span>
                    {unlockedBots.has(char.id) ? (
                      <span className="text-[9px] font-bold tracking-widest text-[#b8d097] border border-[#b8d097]/40 bg-[#b8d097]/10 px-2 py-0.5 rounded-[4px] uppercase">
                        UNCLASSIFIED
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold tracking-widest text-white/30 border border-white/10 bg-white/5 px-2 py-0.5 rounded-[4px] flex items-center gap-1 uppercase">
                        <Lock className="w-3 h-3" /> CLASSIFIED
                      </span>
                    )}
                  </div>
                  {unlockedBots.has(char.id) ? (
                    <p className="text-[13px] text-white/80 leading-relaxed mt-1 whitespace-pre-wrap">
                      {char.vulnerabilityHint}
                    </p>
                  ) : (
                    <p className="text-[12px] text-white/40 italic mt-1">
                      Data locked. Visit the Arena Merchant to acquire tactical clues.
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="pt-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="redline-primary-cta w-full rounded-[8px] py-2.5 font-semibold text-[13px]"
          >
            ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
}
