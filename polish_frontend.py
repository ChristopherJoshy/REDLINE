from pathlib import Path
import re

base = Path('frontend/src')
(base/'chat/MatrixText.tsx').write_text('''interface MatrixTextProps {
  text: string;
  isStreaming?: boolean;
  animateOnMount?: boolean;
  className?: string;
  accentColor?: string;
}

/** Replies remain readable as each token arrives. */
export default function MatrixText({ text, className = "" }: MatrixTextProps): React.JSX.Element {
  return <span className={className}>{text}</span>;
}
''', encoding='utf-8')
(base/'chat/TypingBubble.tsx').write_text('''import { MessageSquare } from "lucide-react";

export default function TypingBubble({ thinking = true }: {
  thinking?: boolean;
  accentColor?: string;
}): React.JSX.Element {
  return (
    <div role="status" className="flex items-center gap-2 rounded-[8px] border border-border bg-surface-1 px-4 py-3 text-sm text-text-2">
      <MessageSquare className="h-4 w-4 text-brass" aria-hidden="true" />
      <span>{thinking ? "Preparing a reply…" : "Writing…"}</span>
    </div>
  );
}
''', encoding='utf-8')

p=base/'screens/ArenaScreen.tsx'
s=p.read_text(encoding='utf-8')
start=s.index('        <div className="relative flex-1 flex flex-col justify-between')
end=s.index('      ) : (',start)
# The first conditional inside the old layout is nested; replace through its outer chat branch.
end=s.index('      ) : (\n        <div className="relative flex-1 flex flex-col min-h-0">',start)
s=s[:start]+'''        <div className="mx-auto grid w-full max-w-[1280px] flex-1 min-h-0 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8 lg:p-8">
          <nav aria-label="Round one characters" className="min-h-0 lg:overflow-y-auto redline-scroll">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-2">Choose a character</h2>
              <span className="font-mono text-xs text-brass">{verifiedCount}/8 filed</span>
            </div>
            <div ref={markListRef} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {[ROSTER[8]!, ...ROSTER.slice(0, 8)].map((entry) => {
                const character = CHARACTERS[entry.id];
                const status = getBotItemStatus(entry.id);
                const selected = selectedBotId === entry.id;
                return (
                  <button key={entry.id} type="button" onClick={() => setSelectedBotId(entry.id)} aria-pressed={selected}
                    className={`mark-card flex min-h-[76px] items-center gap-3 rounded-[8px] border p-3 text-left ${selected ? "border-brass bg-brass-wash" : status === "verified" ? "border-moss-border bg-moss-wash" : "border-border bg-surface-1"}`}>
                    <img src={character?.avatar} alt="" className={`h-11 w-11 shrink-0 rounded-[6px] object-cover ${AVATAR_FOCUS[entry.id]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text-1">{entry.label}</span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-text-2">
                        {entry.id === "merchant" ? <><Coins className="h-3 w-3" />{credits} credits</> : status === "verified" ? <><CheckCircle2 className="h-3 w-3" />Filed</> : status === "obtained" ? <><Package className="h-3 w-3" />Held</> : <><MessageSquare className="h-3 w-3" />Open</>}
                      </span>
                    </span>
                    {selected && <ChevronRight className="hidden h-4 w-4 shrink-0 text-brass lg:block" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </nav>
          {selectedLore && <section ref={detailPanelRef} aria-labelledby="character-title" className="min-w-0 rounded-[8px] border border-border bg-surface-1 p-5 sm:p-8 lg:self-start">
            <div className="flex items-start justify-between gap-5 border-b border-border pb-6">
              <div>
                <p className="mb-3 font-mono text-xs tracking-wider text-brass">{selectedBotId === "merchant" ? "THE COUNTER" : `ROUND 01 / ${ROSTER.find((r) => r.id === selectedBotId)?.num}`}</p>
                <h1 id="character-title" className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-text-1 sm:text-4xl">{selectedLore.name}</h1>
                <p className="mt-2 text-sm text-text-2">{selectedLore.moniker}</p>
              </div>
              <img src={selectedLore.avatar} alt="" className={`h-24 w-24 shrink-0 rounded-[8px] object-cover sm:h-32 sm:w-32 ${AVATAR_FOCUS[selectedBotId]}`} />
            </div>
            <p className="max-w-[65ch] py-6 text-base leading-relaxed text-text-2">{selectedLore.backstory}</p>
            {selectedBotId !== "merchant" && <div className="flex items-center gap-5 border-y border-border py-6">
              <img src={selectedLore.targetItem.asset} alt={selectedLore.targetItem.name} className="h-24 w-24 shrink-0 object-contain sm:h-28 sm:w-28" />
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-brass">Your objective</p>
                <h2 className="text-lg font-semibold text-text-1">{selectedLore.targetItem.name}</h2>
                <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-text-2">{selectedLore.targetItem.description}</p>
              </div>
            </div>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" disabled={selectedHolder !== null || coverChecking === selectedBotId} onClick={() => engage(selectedBotId)} className="redline-cta inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[6px] px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                {getBotItemStatus(selectedBotId) === "verified" ? <><CheckCircle2 className="h-4 w-4" />Relic filed</> : selectedHolder !== null ? <><Lock className="h-4 w-4" />In use by {selectedHolder}</> : coverChecking === selectedBotId ? "Checking your cover…" : selectedBotId === "merchant" ? <><Scale className="h-4 w-4" />Visit the counter</> : <><MessageSquare className="h-4 w-4" />Start conversation</>}
              </button>
              {getBotItemStatus(selectedBotId) === "obtained" && <button type="button" onClick={() => setInventoryOpen(true)} className="min-h-[48px] rounded-[6px] border border-border-strong px-4 text-sm font-medium text-text-1">Inspect held relic</button>}
              <p className="w-full mt-2 text-xs text-text-3">{selectedBotId === "merchant" ? "Sell genuine relics and use your credits to buy clues." : "Build a cover, make your case, then bring the relic to the merchant."}</p>
            </div>
          </section>}
        </div>
''' + s[end:]
s=s.replace('style={{ backgroundImage: `url("${pageBg}")`, backgroundSize: "cover", backgroundPosition: "center", ...botThemeStyle }}','style={botThemeStyle}')
s=re.sub(r'      <div aria-hidden="true" className="pointer-events-none absolute inset-0[^\n]+\n','',s)
a=s.index('                  {/* Ambient Telemetry Watermarks */}')
b=s.index('                  {/* Scrollable Message Feed */}',a)
s=s[:a]+s[b:]
s=s.replace('aria-live="polite"','role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"')
s=s.replace('if (text === "" || !locked || chattingBotId === null) return;', 'if (text === "" || !locked || chattingBotId === null || activeBot?.typing || activeBot?.streaming) return;')
s=s.replace('disabled={!locked || draft.trim() === ""}', 'disabled={!locked || draft.trim() === "" || activeBot?.typing || activeBot?.streaming !== ""}')
s=s.replace('<input\n                          value={draft}', '<input\n                          aria-label="Message"\n                          maxLength={4000}\n                          value={draft}')
s=s.replace('<span>TRANSMIT</span>', '<span>{activeBot?.typing ? "Replying…" : "Send"}</span>')
s=s.replace('"Transmission paused"','"Resume fullscreen to write"')
s=s.replace('void releaseLock(', 'void releaseLock(') # Add handled rejection at each fire-and-forget release.
s=re.sub(r'void releaseLock\(([^;]+)\);',r'void releaseLock(\1).catch(() => {});',s)
# Going to the merchant must release the old character lease.
s=s.replace('if (botId === "merchant") { setMerchantTab("counter");', 'if (botId === "merchant") { if (heldRef.current !== null) { void releaseLock(heldRef.current).catch(() => {}); setHeldBot(null); } setMerchantTab("counter");')
s=s.replace('if (e.key === "Escape" && chattingBotId !== null)', 'if (e.key === "Escape" && chattingBotId !== null && !inventoryOpen && !coverOpen && !claimRelic && !celebration)')
s=s.replace('  const carouselRef = useRef<HTMLDivElement>(null);\n\n', '')
a=s.index('  useEffect(() => {\n    const el = carouselRef.current;')
b=s.index('  const { bots',a)
s=s[:a]+s[b:]
s=s.replace('    if (!hasSyncedInventory) return;', '    if (!hasSyncedInventory) return;').replace('  }, [inventory, chattingBotId]);','  }, [inventory, hasSyncedInventory, chattingBotId]);')
p.write_text(s,encoding='utf-8')

# Replace hard-coded cinematic utilities in the owned files with the existing palette.
paths=[base/'screens/ArenaScreen.tsx',base/'screens/RoundTwoScreen.tsx',*list((base/'components').glob('*.tsx')),base/'chat/RewindButton.tsx']
for p in paths:
 s=p.read_text(encoding='utf-8')
 s=re.sub(r'(?:hover:|focus:)?(?:drop-shadow|shadow)-\[[^\]]+\]', '', s)
 s=re.sub(r'backdrop-blur(?:-[\w]+)?','',s)
 s=re.sub(r'\b(?:bg|border|text)-\[rgba\([^\]]+\)\](?:/\d+)?', lambda m: {'bg':'bg-surface-1','border':'border-border','text':'text-text-2'}[m.group().split('-')[0]],s)
 def color(m):
  prefix,hexval=m.group(1),m.group(2).lower()
  accent=hexval in ('ff1e2d','ff5b64','f5b301','f2b632','d89b24','e01020','ff3b30','ff0000','ef4444','dc2626','b91c1c')
  green=hexval in ('9db87a','b8d097','c4d8a8')
  return prefix+'-'+({'bg':'brass-wash','border':'brass','text':'brass'}.get(prefix,'brass') if accent else {'bg':'moss-wash','border':'moss-border','text':'moss'}[prefix] if green else {'bg':'surface-1','border':'border','text':'text-1'}[prefix])
 s=re.sub(r'\b(bg|border|text)-\[#([0-9a-fA-F]{3,8})\](?:/\d+)?',color,s)
 s=re.sub(r'\btext-white(?:/\d+)?','text-text-1',s)
 s=re.sub(r'\bborder-white(?:/\d+)?','border-border',s)
 s=re.sub(r'\bbg-black(?:/\d+)?','bg-surface-1',s)
 s=re.sub(r'\bbg-white(?:/\d+)?','bg-surface-2',s)
 s=s.replace('text-black','text-text-1').replace('min-h-[40px]','min-h-[44px]').replace('h-10 px-3','min-h-[44px] px-3')
 s=re.sub(r'\b(?:from|via|to)-(?:\[[^\]]+\]|[\w]+)(?:/\d+)?','',s)
 s=re.sub(r'\bbg-gradient-to-[a-z]+','bg-surface-1',s)
 s=s.replace('bg-surface-1    border border-red-500/50 text-text-1', 'bg-text-1 border border-text-1 text-bg-0')
 s=s.replace('rounded-[10px]','rounded-[8px]').replace('rounded-[12px]','rounded-[8px]')
 s=s.replace('"#ff1e2d"','"var(--color-brass)"').replace('"#ffffff"','"var(--color-bg-0)"')
 p.write_text(s,encoding='utf-8')

p=base/'screens/RoundTwoScreen.tsx';s=p.read_text(encoding='utf-8')
s=s.replace('useBotStream(teamId)', 'useBotStream(teamId, "r2")')
s=s.replace('if (text === "" || !locked) return;', 'if (text === "" || !locked || state.typing || state.streaming !== "") return;')
s=s.replace('disabled={!locked || draft.trim() === ""}', 'disabled={!locked || draft.trim() === "" || state.typing || state.streaming !== ""}')
s=s.replace('<input\n            value={draft}', '<input\n            aria-label="Message"\n            maxLength={4000}\n            value={draft}')
s=s.replace('<span>Send</span>', '<span>{state.typing ? "Replying…" : "Send"}</span>')
s=s.replace('style={{ opacity: 0 }}','style={{ opacity: reducedMotion() ? 1 : 0 }}')
p.write_text(s,encoding='utf-8')

p=base/'data/characterLore.ts';s=p.read_text(encoding='utf-8')
s=re.sub(r'accent: "#[^"]+"','accent: "var(--color-brass)"',s)
s=re.sub(r'accentInk: "#[^"]+"','accentInk: "var(--color-bg-0)"',s)
stories={
'wick': 'John Wick is a retired assassin drawn back into the world of the Continental. He speaks sparingly, honours debts and takes promises seriously. He is carrying a blood-oath marker.',
'spidey': 'Peter Parker balances everyday responsibilities with protecting New York as Spider-Man. Quick-witted and compassionate, he knows how dangerous his own inventions can be. His spare web cartridge is your objective.',
'escanor': 'The Lion’s Sin of Pride carries Sunshine, a power that rises with the sun. In daylight he is supremely confident; his quieter side is gentle and devoted. He holds a fragment of his sacred axe, Rhitta.',
'stark': 'Tony Stark is an inventor who masks concern with rapid-fire humour. He trusts practical engineering more than impressive titles. A prototype reactor sample is still in his workshop.',
'joker': 'Gotham’s Joker treats a conversation as a performance. His jokes can turn threatening without warning, and he enjoys undermining anyone who thinks they have control. You need the coded card he is holding.',
'light': 'Light Yagami presents himself as a composed, exceptional student. Behind that polite exterior is Kira’s conviction that he alone should decide justice. A torn notebook page is your objective.',
'levi': 'Captain Levi is blunt, disciplined and protective of his soldiers. He values clear action, clean equipment and the lives entrusted to him. He holds a sealed mission order.',
'deadpool': 'Wade Wilson is a mercenary with a healing factor, relentless jokes and a habit of addressing the audience. Beneath the performance, personal attachments still matter to him. He carries pins from his katana hilts.',
'itachi': 'Itachi Uchiha is quiet, observant and difficult to read. His loyalty and his history rarely fit the story others tell about him. He guards a crow connected to Shisui’s eye.',
'aizen': 'Sosuke Aizen speaks with deliberate courtesy and absolute confidence. His control of perception makes certainty a dangerous assumption. The Hogyoku is your objective.',
'merchant': 'Bring held relics to the counter for appraisal. Genuine sales earn credits, which buy clues for the remaining characters. Conversation is welcome; use the counter to make a sale.',
}
desc={
'wick':'A hinged marker representing a blood debt in the Continental’s world.', 'spidey':'A compact cartridge of Peter’s homemade web fluid.', 'escanor':'A heat-storing fragment of the sacred axe Rhitta.', 'stark':'A small prototype sample from Stark’s palladium reactor work.', 'joker':'A playing card used as the decoder for the Joker’s deck.', 'light':'A torn notebook page with a name already written on it.', 'levi':'A folded mission dispatch bearing Commander Erwin’s wax seal.', 'deadpool':'The paired steel pins from Wade’s katana hilts.', 'itachi':'A crow carrying Shisui’s left eye.', 'aizen':'The mysterious sphere associated with Aizen’s evolution.', 'merchant':'The merchant appraises the relics your team has collected.'}
for bot,story in stories.items():
 a=s.index(f'  {bot}: {{'); b=s.find('\n  },',a)+5
 chunk=s[a:b]
 chunk=re.sub(r'backstory: `[^`]*`',lambda _: 'backstory: `'+story+'`',chunk)
 chunk=re.sub(r'vulnerabilityHint: `[^`]*`','vulnerabilityHint: `Learn what matters to them through conversation. Clues are available at the merchant counter.`',chunk)
 chunk=re.sub(r'description: "[^"]*"',lambda _: 'description: "'+desc[bot]+'"',chunk)
 chunk=re.sub(r'authenticityTell: "[^"]*"','authenticityTell: "The merchant confirms authenticity when you submit the relic."',chunk)
 chunk=re.sub(r'decoyWarning: "[^"]*"','decoyWarning: "A claimed handover still needs appraisal at the counter."',chunk)
 chunk=chunk.replace('Raven with Shisui\'s Eye','Crow with Shisui\'s Eye')
 s=s[:a]+chunk+s[b:]
p.write_text(s,encoding='utf-8')
