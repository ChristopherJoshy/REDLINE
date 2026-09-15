from pathlib import Path
import re
base=Path('frontend/src')
paths=[base/'screens/ArenaScreen.tsx',base/'screens/RoundTwoScreen.tsx',*list((base/'components').glob('*.tsx')),base/'chat/RewindButton.tsx']
for p in paths:
 s=p.read_text(encoding='utf-8')
 s=s.replace('bg-gradient- -700 -600 -700 border border-red-500/50 text-text-1','bg-text-1 border border-text-1 text-bg-0')
 s=s.replace('bg-gradient-','bg-surface-1').replace(' /[0.03]','')
 s=re.sub(r'\b(?:drop-shadow|shadow)-(?:2xl|xl|lg|md|sm)\b','',s)
 s=re.sub(r'\b(bg|border|text)-(?:purple|yellow|pink|blue|red|gray|emerald|green|amber)-\d+(?:/\d+)?',lambda m:m.group(1)+'-'+{'bg':'brass-wash','border':'border-strong','text':'brass'}[m.group(1)],s)
 s=re.sub(r'\s+style=\{\{ boxShadow: "[^"]*" \}\}','',s)
 s=s.replace(', boxShadow: strength > 50 ? "0 0 8px rgba(255,30,45,0.5)" : "none"','')
 s=s.replace('transition-[width] duration-500','')
 s=s.replace('h-[90vh]','h-[90dvh]')
 p.write_text(s,encoding='utf-8')

p=base/'screens/ArenaScreen.tsx';s=p.read_text(encoding='utf-8')
s=s.replace('credits, locks, setLocks, send','credits, locks, connected, setLocks, send')
s=s.replace('    send(chattingBotId, text);\n    setDraft("");','    if (send(chattingBotId, text)) setDraft("");')
s=s.replace('disabled={!locked || draft.trim()', 'disabled={!connected || !locked || draft.trim()')
s=s.replace('                  {/* Top glowing red line */}\n                  <div className="absolute top-0 left-0 right-0 h-px bg-surface-1   " />','')
s=re.sub(r'\s*<div className="absolute inset-0 bg-surface-1    -translate-x-full[^\n]+\n','\n',s)
s=s.replace('                    {/* Input Console */}', '''                    <p role="status" className="text-xs text-text-3">{!connected ? "Reconnecting… Your draft is safe." : !locked ? "Resume fullscreen to continue." : activeBot?.typing ? "Waiting for a reply. You can prepare your next message." : "Messages are shared with your team."}</p>
                    {/* Input Console */}''')
s=s.replace('className="relative flex min-h-[50px] px-6 items-center justify-center gap-2 bg-brass-wash text-text-1', 'className="redline-cta relative flex min-h-[50px] rounded-[6px] px-6 items-center justify-center gap-2')
s=s.replace('className="px-4 py-3 text-[14.5px]', 'className="rounded-[8px] px-4 py-3 text-[14.5px]')
s=s.replace('className={`px-4 py-3 text-[14.5px]', 'className={`rounded-[8px] px-4 py-3 text-[14.5px]')
s=s.replace('    setChattingBotId(botId);\n  }','    setDraft("");\n    setChattingBotId(botId);\n  }')
# Rewind errors must be visible and must not replace the draft on failure.
s=s.replace('''                                    if (isUser) {
                                      setDraft(m.text);
                                    }
                                    await rewind(chattingBotId, { messageId: m.id });''','''                                    const result = await rewind(chattingBotId, { messageId: m.id });
                                    if (!result.ok) flashLockNotice(result.error ?? "Rewind failed");
                                    else if (isUser) setDraft(m.text);''')
s=s.replace('className="flex items-center gap-1 font-mono text-[10px]', 'className="min-h-[44px] flex items-center gap-1 font-mono text-[10px]')
p.write_text(s,encoding='utf-8')

p=base/'screens/RoundTwoScreen.tsx';s=p.read_text(encoding='utf-8')
s=s.replace('bots, send, flash, inventory','bots, send, connected, inventory')
s=s.replace('    send(boss, text);\n    setDraft("");','    if (send(boss, text)) setDraft("");')
s=s.replace('disabled={!locked || draft.trim()', 'disabled={!connected || !locked || draft.trim()')
a=s.index('      style={\n        (chatBg')
b=s.index('\n    >',a)
s=s[:a]+s[b:]
s=re.sub(r'      \{flash > 0[^\n]+\n','',s)
s=s.replace('aria-live="polite"','role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"')
s=s.replace('<div className="mx-auto flex w-full max-w-[900px] items-center gap-3">','<p role="status" className="mx-auto mb-2 max-w-[900px] text-xs text-text-3">{!connected ? "Reconnecting… Your draft is safe." : !locked ? "Resume fullscreen to continue." : state.typing ? "Waiting for a reply. You can prepare your next message." : "Messages are shared with your team."}</p>\n        <div className="mx-auto flex w-full max-w-[900px] items-center gap-3">')
s=s.replace('className="dark-cinematic flex','className="flex')
s=s.replace('"Izanami shattered"','"Illusion broken"')
p.write_text(s,encoding='utf-8')

# Initial REST history used to race chat_sync and overwrite new replies. The live
# transport provides a complete snapshot on connection, including SSE fallback.
p=base/'chat/useBotStream.ts';s=p.read_text(encoding='utf-8')
a=s.index('  // Fetch initial chat logs from server')
b=s.index('  useEffect(() => {\n    let dead = false;\n    let retryTimer',a)
s=s[:a]+s[b:]
p.write_text(s,encoding='utf-8')
