from pathlib import Path
p=Path('frontend/src/index.css')
old=p.read_text(encoding='utf-8')
tokens={
'bg-0':'#F3EDE0','bg-1':'#E9E0C9','surface-1':'#FBF8EE','surface-2':'#F0E8D2','surface-3':'#E2D5B4','border':'#D8CBA6','border-strong':'#A8976B','text-1':'#201A12','text-2':'#4A4234','text-3':'#7A6F5C','text-faint':'#7A6F5C','brass':'#6E5514','brass-ink':'#4A3A0C','brass-wash':'#EFE6C8','seal':'#7F1D1D','seal-wash':'#F3E2DD','moss':'#4B5523','moss-wash':'#E9EAD9','moss-border':'#C6C9A3',
'redline':'#6E5514','redline-soft':'#4A3A0C','redline-dim':'#EFE6C8','gold':'#6E5514','gold-bright':'#6E5514','gold-wash':'#EFE6C8','gold-border':'#A8976B','cyan':'#6E5514','green':'#4B5523','portal-950':'#201A12','portal-700':'#7A6F5C','portal-400':'#6E5514','vault-p2':'#E9E0C9'}
css='@import "./fonts.css";\n@import "tailwindcss";\n\n/* Parchment, ink and brass: DESIGN.md is the palette source of truth. */\n@theme inline {\n'
css+=''.join(f'  --color-{k}: {v};\n' for k,v in tokens.items())
css+='''  --font-display: "Cinzel", Georgia, serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-code: "JetBrains Mono", ui-monospace, monospace;
  --font-vault: "Cinzel", Georgia, serif;
  --dur-micro: 120ms;
  --dur-ui: 180ms;
  --dur-panel: 280ms;
  --dur-page: 350ms;
  --dur-portal: 3000ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --space: clamp(0.75rem, 2vw, 1.5rem);
}

:root {
  --motion-enabled: 1;
  --accent: var(--color-brass);
  --accent-ink: var(--color-bg-0);
  --accent-deep: var(--color-brass-ink);
  --accent-soft: var(--color-brass);
  --accent-wash: var(--color-brass-wash);
  --accent-border: var(--color-border-strong);
  --accent-glow: transparent;
}

body {
  margin: 0;
  background: var(--color-bg-0);
  color: var(--color-text-1);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

button, input, textarea, select { font: inherit; }
button:not(:disabled) { cursor: pointer; }
button, a, input, textarea, select { -webkit-tap-highlight-color: transparent; }
:focus-visible { outline: 2px solid var(--color-brass); outline-offset: 3px; }
input, textarea, select { border-radius: 6px; }
textarea { resize: vertical; }
h1, h2, h3 { text-wrap: balance; }
p { overflow-wrap: anywhere; }
input:disabled, textarea:disabled { cursor: not-allowed; }
::selection { background: var(--color-brass-wash); color: var(--color-text-1); }

/* Shared aliases keep the existing components on the same flat surface system. */
.redline-bg, .bot-theme { background: var(--color-bg-0); }
.redline-veil { background: var(--color-bg-0); }
.redline-panel, .redline-chip, .redline-carousel-card, .board-panel {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.redline-selected, .redline-carousel-card-selected, .redline-carousel-merchant-selected {
  border-color: var(--color-brass);
  background: var(--color-brass-wash);
}
.redline-gold-card, .redline-carousel-merchant {
  border: 1px solid var(--color-border-strong);
  background: var(--color-brass-wash);
}
.redline-cta, .redline-primary-cta {
  background: var(--color-text-1);
  border: 1px solid var(--color-text-1);
  color: var(--color-bg-0);
  transition: transform var(--dur-ui) var(--ease-out);
}
.redline-cta:hover:not(:disabled), .redline-primary-cta:hover:not(:disabled) { background: var(--color-text-2); }
.redline-cta:active:not(:disabled), .redline-primary-cta:active:not(:disabled) { transform: scale(0.98); }
.redline-cta :is(span, svg), .redline-primary-cta :is(span, svg) { color: inherit; }
.mark-card { transition: transform var(--dur-ui) var(--ease-out); }
.mark-card:hover { border-color: var(--color-brass); }
.mark-card:active { transform: scale(0.98); }
.redline-scroll { scrollbar-width: thin; scrollbar-color: var(--color-border-strong) transparent; }
.redline-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.redline-scroll::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 6px; }
.redline-scroll::-webkit-scrollbar-track { background: transparent; }
.acc-text, .acc-text-strong { color: var(--color-brass); }
.acc-bg, .acc-bar { background: var(--color-brass); }
.acc-border { border-color: var(--color-border-strong); }
.acc-wash { background: var(--color-brass-wash); border-color: var(--color-border-strong); color: var(--color-brass-ink); }
.acc-glow { box-shadow: none; }
.portal-fallback { background: var(--color-surface-3); }
.writing-mode-vertical { writing-mode: vertical-rl; text-orientation: mixed; }
.chat-msg { min-width: 0; }
.chat-msg > div { min-width: 0; }
.chat-msg .whitespace-pre-wrap { overflow-wrap: anywhere; }
.board-title { color: var(--color-text-1); }
.board-row:hover { background: var(--color-surface-2); }
.dark-cinematic { background: var(--color-text-1); color: var(--color-bg-0); }
@keyframes rise-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.rise-in { animation: rise-in 500ms var(--ease-out) both; }
@keyframes troll-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.animate-troll { animation: troll-shake var(--dur-ui) var(--ease-out) 2; border-color: var(--color-seal); }
@media (prefers-reduced-motion: reduce) {
  :root { --motion-enabled: 0; }
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
'''
p.write_text(css,encoding='utf-8')

# Hand-drawn, small-size SVG relics. Consistent silhouette, line weight and palette.
icons={
'wick_medallion':('Blood-oath marker', '''<path d="M65 41h30v12H65z" fill="#A8976B"/><circle cx="80" cy="86" r="49" fill="#EFE6C8"/><circle cx="80" cy="86" r="41"/><circle cx="80" cy="86" r="33" stroke="#A8976B"/><path d="m63 91 3-28 14 12 14-12 3 28H63m6 8h22"/><path d="M80 80c-7 10-11 15-11 20a11 11 0 0 0 22 0c0-5-4-10-11-20Z" fill="#6E5514" stroke="none"/><path d="M72 39v-9h16v9M69 133h22"/>'''),
'spidey_cartridge':('Spare web cartridge','''<path d="m59 28 39 0 0 18H59z" fill="#A8976B"/><path d="M54 46h49v75l-12 13H66l-12-13Z" fill="#EFE6C8"/><path d="M62 58h33v48H62z" fill="#FBF8EE"/><path d="m60 74 37-9m-37 23 37-9M68 119h22M69 29v17m11-17v17m10-17v17"/><path d="M70 62v38m17-38v38" stroke="#A8976B"/><path d="m98 44 13 10v56l-8 10"/>'''),
'escanor_rhitta':('Rhitta axe fragment','''<path d="m40 120 24-66 42-26-9 31 28 3-17 29-37 41-9-19Z" fill="#EFE6C8"/><path d="m64 54 9 36 24-31M73 90l-11 23m11-23 35 1M73 90l33-62"/><path d="m44 138 18-25M33 61l-8-9m86 65 9 7M74 22v-9m58 34 9-5" stroke="#A8976B"/><path d="m69 64 3 17 15-14" stroke="#6E5514"/>'''),
'stark_reactor':('Palladium reactor sample','''<circle cx="80" cy="80" r="54" fill="#EFE6C8"/><circle cx="80" cy="80" r="43"/><circle cx="80" cy="80" r="31" fill="#FBF8EE"/><path d="m80 56 22 38H58Z" fill="#6E5514"/><path d="M80 27v16m27-9-8 14m28 5-14 8m21 19h-16m9 27-14-8m-6 28-8-14m-19 21v-16m-27 9 8-14m-28-6 14-8m-21-19h16m-9-27 14 8m6-28 8 14"/><path d="m77 72 7 12H70Z" fill="#EFE6C8" stroke="none"/>'''),
'joker_card':('Coded joker card','''<rect x="39" y="21" width="82" height="118" rx="8" fill="#FBF8EE" transform="rotate(8 80 80)"/><rect x="43" y="19" width="74" height="116" rx="7" fill="#EFE6C8" transform="rotate(-8 80 80)"/><path d="m62 66 2-20 16 12 15-15 4 22-37 1Z" fill="#6E5514"/><circle cx="63" cy="44" r="3" fill="#6E5514"/><circle cx="96" cy="41" r="3" fill="#6E5514"/><path d="M61 75c2 27 33 30 39-4M67 78l5 3m14-2 5-4M71 93l18-2M53 34l4 9-8 1m54 69-5 10 9-1"/><path d="M66 113h4m5 0h4m5 0h4m5 0h4" stroke="#A8976B"/>'''),
'light_page':('Torn notebook page','''<path d="m44 22 73 7-7 105-12-4-10 5-13-5-11 3-12-6-14 3 5-108Z" fill="#FBF8EE"/><path d="m54 39 50 4m-51 11 49 4m-50 11 49 4m-50 11 32 3m-33 11 47 4m-48 11 35 3" stroke="#A8976B"/><path d="m53 70 39 4m-38-8 35 13" stroke="#201A12"/><path d="m104 27-1 13 13-10" fill="#EFE6C8"/><path d="m32 22 1 9m-2 9 1 9m-2 9 1 9m-2 9 1 9m-2 9 1 9" stroke="#A8976B"/>'''),
'levi_order':('Sealed mission order','''<path d="M28 42h104v79H28z" fill="#EFE6C8"/><path d="m29 43 51 39 51-39M28 120l37-43m67 43L95 77"/><path d="m35 36 87-7 4 13H35z" fill="#FBF8EE"/><circle cx="80" cy="84" r="20" fill="#6E5514"/><path d="m72 98-5 31 13-8 11 9-3-32" fill="#A8976B"/><circle cx="80" cy="84" r="15" fill="#6E5514"/><path d="m80 95-1-23m0 11-10-10m10 17-12-10m14 1 10-10m-10 17 12-10" stroke="#EFE6C8"/>'''),
'deadpool_pins':('Twin katana hilt pins','''<g transform="rotate(-34 80 80)"><path d="M57 31h12v95H57z" fill="#A8976B"/><path d="M51 29h24v10H51zM51 119h24v10H51z" fill="#EFE6C8"/><path d="M91 31h12v95H91z" fill="#A8976B"/><path d="M85 29h24v10H85zM85 119h24v10H85z" fill="#EFE6C8"/><path d="m58 58 9 8-9 8 9 8-9 8m34-32 9 8-9 8 9 8-9 8"/></g><path d="M77 111c-14-11-22-18-22-26 0-10 15-12 22-3 7-9 22-7 22 3 0 8-8 15-22 26Z" fill="#6E5514"/><path d="M70 94h14" stroke="#EFE6C8"/>'''),
'itachi_crow':('Crow carrying Shisui’s eye','''<path d="M43 124c-1-22 5-50 31-62l7-21c6-10 25-10 31 0l18 10-20 7-8 23 12 43-26-13-17 22 1-19-29 10Z" fill="#201A12"/><path d="M77 72c-20 13-27 29-28 43l31-20-15 26 31-26M82 108l5 22m10-20 8 20M80 131h13m6 0h13" stroke="#A8976B"/><circle cx="101" cy="45" r="7" fill="#EFE6C8" stroke="none"/><circle cx="101" cy="45" r="3" fill="#6E5514" stroke="none"/><path d="m33 58 4 13 7-10-3 26M21 88l7 8 6-5-2 19" stroke="#A8976B"/>'''),
'aizen_hogyoku':('Hogyoku','''<circle cx="80" cy="79" r="42" fill="#EFE6C8"/><path d="M53 52c22-16 51-2 51 23 0 21-19 35-37 30M70 41c-17 25-16 59 8 79M42 81c28-9 52-8 77 7" stroke="#A8976B"/><circle cx="80" cy="79" r="17" fill="#6E5514"/><path d="m80 66 7 13-7 13-7-13Z" fill="#FBF8EE" stroke="none"/><path d="M80 16v12m0 103v12m63-64h-12M28 79H16m108-44-8 9m-80 72 8-9m80 17-8-9M36 35l8 9"/><path d="M54 135h52" stroke="#A8976B"/>''')}
for name,(title,body) in icons.items():
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none" role="img" aria-labelledby="title"><title id="title">{title}</title><g stroke="#4A3A0C" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>\n'
 Path(f'frontend/public/items/{name}.svg').write_text(svg,encoding='utf-8')
