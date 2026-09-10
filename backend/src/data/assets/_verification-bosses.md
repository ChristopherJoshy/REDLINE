# Scout verification — bosses / merchant / portal (filed, Step 2 vendoring input)

Status: 17/17 manifest slots MATCH, 0 dead. Support URLs live. AMVs live (Itachi AMV is a recent re-upload — re-confirm at prep time).

## Decisions locked from flags

- Itachi genjutsu voice: vendor EN alt `itachi-genjutsu.mp3` (page `itachi-genjutsu-28835`, "You Are Already Under My Genjutsu") as primary; 5-second human listen at vendoring to confirm English. PT-BR file NOT shipped.
- Merchant bell credit: CC-BY 3.0 (not 4.0) — attribution row cites 3.0.
- Aizen glass-tinkle: 1:44/28.8MB WAV source — slice loop at build; credit "Arto Koivisto".
- Sharingan SVG: KEEP CC-verify-first flag (Narutopedia fan vector of studio design); confirm pre-ship.
- Filename quirks (record in SOUNDS.md, no action): `portail-du-nether.mp3`, `travil` typo, converter-tool filenames, raven/crow naming.

## Full tables

See scout transcript `history://ScoutBossMerchant` for the 17-row sound table + support-URL table + credit fields (uploaders/views partially transcribed; lift remainder from page meta at vendoring into `backend/src/data/assets/<bot-id>.json` + `assets/sounds/SOUNDS.md`).
