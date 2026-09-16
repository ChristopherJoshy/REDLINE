const fs = require('fs');

let text = fs.readFileSync('frontend/src/screens/ArenaScreen.tsx', 'utf-8');

const targetBlock =                   {getBotItemStatus(selectedLore.id) === "verified" ? (
                    <button
                      type="button"
                      onClick={() => setCelebration(selectedLore.id)}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(157,184,122,0.4)] bg-[rgba(157,184,122,0.15)] px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-[#c4d8a8] hover:bg-[rgba(157,184,122,0.25)] backdrop-blur-md transition cursor-pointer"
                    >
                      <Lock className="h-4 w-4" />
                      <span>FILED AND LOCKED · CELEBRATE</span>
                    </button>
                  ) : getBotItemStatus(selectedLore.id) === "obtained" ? (
                    <div className="flex gap-2 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          const item = inventory.find((i) => i.botId === selectedLore.id && i.status === "obtained");
                          if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                        }}
                        className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.18)] px-4 py-2.5 text-[13.5px] font-bold tracking-wide text-[var(--color-gold-bright)] hover:bg-[rgba(216,155,36,0.28)] backdrop-blur-md transition"
                      >
                        <Gift className="h-4 w-4" />
                        <span>Inspect Relic</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => engage(selectedLore.id)}
                        className="min-h-[48px] rounded-[8px] border border-white/20 bg-white/10 px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-white hover:bg-white/20 backdrop-blur-md transition cursor-pointer"
                      >
                        <span>Talk</span>
                      </button>
                    </div>
                  ) : selectedHolder !== null ? (
                    <div className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-white/15 bg-white/5 px-6 py-2.5 font-bold text-[13px] tracking-wide text-white/60 backdrop-blur-sm">
                      <span>IN USE BY {selectedHolder}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => engage(selectedLore.id)}
                      className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[8px] border border-[var(--accent)]/50 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-white font-bold text-[13.5px] tracking-[0.12em] backdrop-blur-md transition-all cursor-pointer active:scale-[0.98] shadow-[0_0_20px_var(--accent-wash)] hover:shadow-[0_0_30px_var(--accent-glow)]"
                    >
                      <span>ENTER CONVERSATION</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )};

const replacementBlock =                   {(() => {
                    const item = inventory.find((i) => i.botId === selectedLore.id);
                    if (item && (item.status === "verified" || item.status === "obtained") && item.obtainedBy && item.obtainedBy !== displayName) {
                      return (
                        <div className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.18)] px-6 py-2.5 font-bold text-[13px] tracking-wide text-[var(--color-gold-bright)] backdrop-blur-sm">
                          <Lock className="h-4 w-4" />
                          <span>DEFEATED BY {item.obtainedBy.toUpperCase()}</span>
                        </div>
                      );
                    }
                    if (item?.status === "verified") {
                      return (
                        <button
                          type="button"
                          onClick={() => setCelebration(selectedLore.id)}
                          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-[rgba(157,184,122,0.4)] bg-[rgba(157,184,122,0.15)] px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-[#c4d8a8] hover:bg-[rgba(157,184,122,0.25)] backdrop-blur-md transition cursor-pointer"
                        >
                          <Lock className="h-4 w-4" />
                          <span>FILED AND LOCKED · CELEBRATE</span>
                        </button>
                      );
                    }
                    if (item?.status === "obtained") {
                      return (
                        <div className="flex gap-2 w-full">
                          <button
                            type="button"
                            onClick={() => {
                              if (item) setClaimRelic({ botId: item.botId, itemKey: item.itemKey });
                            }}
                            className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[rgba(216,155,36,0.45)] bg-[rgba(216,155,36,0.18)] px-4 py-2.5 text-[13.5px] font-bold tracking-wide text-[var(--color-gold-bright)] hover:bg-[rgba(216,155,36,0.28)] backdrop-blur-md transition"
                          >
                            <Gift className="h-4 w-4" />
                            <span>Inspect Relic</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => engage(selectedLore.id)}
                            className="min-h-[48px] rounded-[8px] border border-white/20 bg-white/10 px-6 py-2.5 font-bold text-[13.5px] tracking-wide text-white hover:bg-white/20 backdrop-blur-md transition cursor-pointer"
                          >
                            <span>Talk</span>
                          </button>
                        </div>
                      );
                    }
                    if (selectedHolder !== null) {
                      return (
                        <div className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[8px] border border-white/15 bg-white/5 px-6 py-2.5 font-bold text-[13px] tracking-wide text-white/60 backdrop-blur-sm">
                          <span>IN USE BY {selectedHolder.toUpperCase()}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => engage(selectedLore.id)}
                        className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[8px] border border-[var(--accent)]/50 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-white font-bold text-[13.5px] tracking-[0.12em] backdrop-blur-md transition-all cursor-pointer active:scale-[0.98] shadow-[0_0_20px_var(--accent-wash)] hover:shadow-[0_0_30px_var(--accent-glow)]"
                      >
                        <span>ENTER CONVERSATION</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    );
                  })()};

text = text.replace(targetBlock, replacementBlock);
fs.writeFileSync('frontend/src/screens/ArenaScreen.tsx', text, 'utf-8');
console.log('done ArenaScreen.tsx button update');
