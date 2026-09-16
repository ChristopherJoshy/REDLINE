const fs = require('fs');
let text = fs.readFileSync('frontend/src/screens/ArenaScreen.tsx', 'utf-8');

text = text.replace(
    'if (item.status === "obtained" && (prevItem === undefined || prevItem.status === "locked")) {',
    'if (item.status === "obtained" && (prevItem === undefined || prevItem.status === "locked") && item.obtainedBy === displayName) {'
);

text = text.replace(
    'if (item.status === "verified" && prevItem?.status !== "verified") {',
    'if (item.status === "verified" && prevItem?.status !== "verified" && item.obtainedBy === displayName) {'
);

const oldVerifiedBanner = `                {/* In-page Verified Banner if relic is already filed */}
                {chattingBotId && inventory.some((i) => i.botId === chattingBotId && i.status === "verified") && (
                  <div className="border-t border-[#9db87a]/40 bg-[#090d12]/95 px-4 py-2.5 text-center text-[12px] text-white/80 flex items-center justify-center gap-2 z-20">
                    <CheckCircle2 className="w-4 h-4 text-[#9db87a]" />
                    <span className="font-mono">RELIC FILED & LOCKED AT THE MERCHANT COUNTER.</span>
                    <button
                      type="button"
                      onClick={() => setCelebration(chattingBotId)}
                      className="underline text-[var(--color-gold-bright)] font-semibold hover:opacity-80 ml-1 cursor-pointer font-mono"
                    >
                      Celebrate again
                    </button>
                  </div>
                )}`;

const newVerifiedBanner = `                {/* In-page Verified Banner if relic is already filed */}
                {(() => {
                  if (!chattingBotId) return null;
                  const item = inventory.find(i => i.botId === chattingBotId && i.status === "verified");
                  if (!item) return null;
                  if (item.obtainedBy && item.obtainedBy !== displayName) {
                     return (
                       <div className="border-t border-[#9db87a]/40 bg-[#090d12]/95 px-4 py-2.5 text-center text-[12px] text-white/80 flex items-center justify-center gap-2 z-20">
                         <Lock className="w-4 h-4 text-[var(--color-gold-bright)]" />
                         <span className="font-mono">RELIC SECURED BY {item.obtainedBy.toUpperCase()}</span>
                       </div>
                     );
                  }
                  return (
                    <div className="border-t border-[#9db87a]/40 bg-[#090d12]/95 px-4 py-2.5 text-center text-[12px] text-white/80 flex items-center justify-center gap-2 z-20">
                      <CheckCircle2 className="w-4 h-4 text-[#9db87a]" />
                      <span className="font-mono">RELIC FILED & LOCKED AT THE MERCHANT COUNTER.</span>
                      <button
                        type="button"
                        onClick={() => setCelebration(chattingBotId)}
                        className="underline text-[var(--color-gold-bright)] font-semibold hover:opacity-80 ml-1 cursor-pointer font-mono"
                      >
                        Celebrate again
                      </button>
                    </div>
                  );
                })()}`;

text = text.replace(oldVerifiedBanner, newVerifiedBanner);

const oldObtainedBanner = `                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                            }}
                            className="flex min-h-[40px] items-center gap-1.5 border border-[rgba(216,155,36,0.65)] bg-[rgba(216,155,36,0.2)] px-4 py-2 text-[13px] font-bold text-[var(--color-gold-bright)] transition hover:bg-[rgba(216,155,36,0.3)] active:scale-95 cursor-pointer font-mono"
                          >
                            <Gift className="w-4 h-4" />
                            <span>INSPECT / CLAIM</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => engage("merchant")}
                            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 border border-white/20 bg-black/60 px-3 py-2 text-[13px] font-semibold text-white transition hover:border-[#ff1e2d] hover:bg-[#ff1e2d]/10 font-mono"
                          >
                            <span>MERCHANT</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#ff1e2d]" />
                          </button>
                        </div>`;

const newObtainedBanner = `                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          {item && item.obtainedBy && item.obtainedBy !== displayName ? (
                            <div className="flex min-h-[40px] items-center gap-1.5 border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.18)] px-4 py-2 text-[13px] font-bold text-[var(--color-gold-bright)] font-mono">
                              <Lock className="w-4 h-4" />
                              <span>DEFEATED BY {item.obtainedBy.toUpperCase()}</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                              }}
                              className="flex min-h-[40px] items-center gap-1.5 border border-[rgba(216,155,36,0.65)] bg-[rgba(216,155,36,0.2)] px-4 py-2 text-[13px] font-bold text-[var(--color-gold-bright)] transition hover:bg-[rgba(216,155,36,0.3)] active:scale-95 cursor-pointer font-mono"
                            >
                              <Gift className="w-4 h-4" />
                              <span>INSPECT / CLAIM</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => engage("merchant")}
                            className="flex min-h-[40px] cursor-pointer items-center gap-1.5 border border-white/20 bg-black/60 px-3 py-2 text-[13px] font-semibold text-white transition hover:border-[#ff1e2d] hover:bg-[#ff1e2d]/10 font-mono"
                          >
                            <span>MERCHANT</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#ff1e2d]" />
                          </button>
                        </div>`;

text = text.replace(oldObtainedBanner, newObtainedBanner);

fs.writeFileSync('frontend/src/screens/ArenaScreen.tsx', text, 'utf-8');
console.log('done updating ArenaScreen.tsx chat view + auto triggers');
