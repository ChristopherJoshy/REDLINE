// Build-time sound vendoring. Downloads every manifest mp3 to
// frontend/public/sounds/<bot>/<slot>.mp3 and writes per-bot JSON manifests +
// assets/sounds/SOUNDS.md. Run: npx tsx scripts/vendor-sounds.ts
// Verified og:audio tables: backend/src/data/assets/_verification-*.md
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, "..");
const soundsRoot = join(backendRoot, "..", "frontend", "public", "sounds");
const assetsRoot = join(backendRoot, "src", "data", "assets");

interface Row {
  bot: string;
  slot: string;
  page: string;
  audio: string;
  trigger: string;
  uploader: string;
  views: string;
}

const ROWS: Row[] = [
  // Wick (4; follow-me-now deprioritized per verification)
  { bot: "wick", slot: "handover", page: "https://www.myinstants.com/en/instant/get-this-man-a-gun-14881/", audio: "https://www.myinstants.com/media/sounds/somebody-plllzzzzzzz.mp3", trigger: "HANDOVER", uploader: "see page", views: "see page" },
  { bot: "wick", slot: "entry", page: "https://www.myinstants.com/en/instant/give-me-a-gun-4129/", audio: "https://www.myinstants.com/media/sounds/give-me-a-gun.mp3", trigger: "ENTRY", uploader: "see page", views: "see page" },
  { bot: "wick", slot: "quiz-pass", page: "https://www.myinstants.com/en/instant/le-castle-vania-john-wick-6674/", audio: "https://www.myinstants.com/media/sounds/le-castle-vania-red-circle-led-spirals-shots-firedv1.mp3", trigger: "QUIZ-PASS", uploader: "see page", views: "see page" },
  { bot: "wick", slot: "entry-alt", page: "https://www.myinstants.com/en/instant/im-thinkin-im-back-john-wick-65844/", audio: "https://www.myinstants.com/media/sounds/im-thinkin-im-back-john-wick.mp3", trigger: "ENTRY-alt", uploader: "see page", views: "see page" },
  // Spidey (5)
  { bot: "spidey", slot: "entry", page: "https://www.myinstants.com/en/instant/spiderman-meme-song-37638/", audio: "https://www.myinstants.com/media/sounds/spiderman-meme-song.mp3", trigger: "ENTRY/TROLL", uploader: "see page", views: "1.7M" },
  { bot: "spidey", slot: "handover", page: "https://www.myinstants.com/en/instant/spiderman-2099-theme-20934/", audio: "https://www.myinstants.com/media/sounds/spiderman-2099-theme.mp3", trigger: "ENTRY/HANDOVER", uploader: "see page", views: "see page" },
  { bot: "spidey", slot: "taunt", page: "https://www.myinstants.com/en/instant/bully-maguire-theme-93566/", audio: "https://www.myinstants.com/media/sounds/bully-maguire-theme.mp3", trigger: "TAUNT", uploader: "see page", views: "see page" },
  { bot: "spidey", slot: "quiz-pass", page: "https://www.myinstants.com/en/instant/peterparker-pizza-time-58819/", audio: "https://www.myinstants.com/media/sounds/mp3_e9ca8310-8d3f-11e9-9016-8b78caf46556.mp3", trigger: "QUIZ-PASS", uploader: "see page", views: "see page" },
  { bot: "spidey", slot: "thwip", page: "https://www.myinstants.com/en/instant/web-thwip-63170/", audio: "https://www.myinstants.com/media/sounds/web-thwip.mp3", trigger: "HANDOVER under voice", uploader: "see page", views: "see page" },
  // Escanor (4)
  { bot: "escanor", slot: "taunt", page: "https://www.myinstants.com/en/instant/escanor-who-decided-that-28078/", audio: "https://www.myinstants.com/media/sounds/escanor-who-decided-that.mp3", trigger: "TAUNT", uploader: "see page", views: "see page" },
  { bot: "escanor", slot: "entry", page: "https://www.myinstants.com/en/instant/escanor-introduction-2393/", audio: "https://www.myinstants.com/media/sounds/escanor.mp3", trigger: "ENTRY", uploader: "see page", views: "see page" },
  { bot: "escanor", slot: "handover", page: "https://www.myinstants.com/en/instant/cruel-sum-escanor-406/", audio: "https://www.myinstants.com/media/sounds/cruel-sum-escanor.mp3", trigger: "HANDOVER", uploader: "see page", views: "see page" },
  { bot: "escanor", slot: "quiz-pass", page: "https://www.myinstants.com/en/instant/escanor-high-noon-37704/", audio: "https://www.myinstants.com/media/sounds/escanor-high-noon.mp3", trigger: "QUIZ-PASS", uploader: "see page", views: "see page" },
  // Stark (5; never voice-clone JARVIS)
  { bot: "stark", slot: "entry", page: "https://www.myinstants.com/en/instant/endgame-avengers-assemble-56256/", audio: "https://www.myinstants.com/media/sounds/avengers-assemble.mp3", trigger: "ENTRY/HANDOVER", uploader: "see page", views: "see page" },
  { bot: "stark", slot: "boot", page: "https://www.myinstants.com/en/instant/jarvis-welcome-home-sir-14019/", audio: "https://www.myinstants.com/media/sounds/welcome_home_sir.mp3", trigger: "ENTRY boot line", uploader: "see page", views: "see page" },
  { bot: "stark", slot: "handover", page: "https://www.myinstants.com/en/instant/suit-up-for-iron-man-46000/", audio: "https://www.myinstants.com/media/sounds/suit-up-noise.mp3", trigger: "HANDOVER", uploader: "see page", views: "see page" },
  { bot: "stark", slot: "quiz-pass", page: "https://www.myinstants.com/en/instant/i-am-iron-man-23526/", audio: "https://www.myinstants.com/media/sounds/ironman_Qaec4ow.mp3", trigger: "QUIZ-PASS", uploader: "see page", views: "see page" },
  { bot: "stark", slot: "troll", page: "https://www.myinstants.com/en/instant/i-love-you-3000-88214/", audio: "https://www.myinstants.com/media/sounds/avengers-endgame-i-love-you-3000-scene-mp3cut.mp3", trigger: "TROLL", uploader: "see page", views: "see page" },
  // Joker (5)
  { bot: "joker", slot: "jumpscare-evil-laugh", page: "https://www.myinstants.com/en/instant/evil-laugh-joker/", audio: "https://www.myinstants.com/media/sounds/joker-laughing.mp3", trigger: "JUMPSCARE", uploader: "", views: "29,687" },
  { bot: "joker", slot: "taunt-joker-laugh", page: "https://www.myinstants.com/en/instant/joker-laugh/", audio: "https://www.myinstants.com/media/sounds/joker-laugh.mp3", trigger: "TAUNT", uploader: "", views: "24,664" },
  { bot: "joker", slot: "taunt-why-so-serious", page: "https://www.myinstants.com/en/instant/why-so-serious-joker/", audio: "https://www.myinstants.com/media/sounds/joker_whysoserious.mp3", trigger: "TAUNT", uploader: "comicjunkies", views: "21,236" },
  { bot: "joker", slot: "handover-tdk-smile", page: "https://www.myinstants.com/en/instant/joker-tdk-laugh/", audio: "https://www.myinstants.com/media/sounds/joker-lets-put-a-smile-on-that-face_2.mp3", trigger: "HANDOVER", uploader: "TFBAna", views: "2,502" },
  { bot: "joker", slot: "jumpscare-2019-laugh", page: "https://www.myinstants.com/en/instant/joker-2019-laugh-53875/", audio: "https://www.myinstants.com/media/sounds/joker-2019-laugh.mp3", trigger: "JUMPSCARE-alt", uploader: "ThePolishJoker", views: "955" },
  // Light (6)
  { bot: "light", slot: "unhinged-laugh", page: "https://www.myinstants.com/en/instant/light-yagamis-laugh-7090/", audio: "https://www.myinstants.com/media/sounds/psycho_Bj24m2M.mp3", trigger: "UNHINGED", uploader: "beatsbyapplebees", views: "52,988" },
  { bot: "light", slot: "reveal-im-kira", page: "https://www.myinstants.com/en/instant/thats-right-im-kira-light-yagami-death-note-50773/", audio: "https://www.myinstants.com/media/sounds/thats-right-im-kira-light-yagami-death-note.mp3", trigger: "REVEAL", uploader: "mason1790", views: "3,363" },
  { bot: "light", slot: "chip-potato-chip", page: "https://www.myinstants.com/en/instant/death-note-potato-chip-66312/", audio: "https://www.myinstants.com/media/sounds/death-note-potato-chip_kz7cfSd.mp3", trigger: "CHIP-BAG", uploader: "jeremiah099", views: "40" },
  { bot: "light", slot: "lecture-i-am-justice", page: "https://www.myinstants.com/en/instant/death-note-i-am-justice-89107/", audio: "https://www.myinstants.com/media/sounds/death-note-i-am-justice.mp3", trigger: "LECTURE", uploader: "jeremiah099", views: "30" },
  { bot: "light", slot: "laugh-kira-laugh", page: "https://www.myinstants.com/en/instant/kira-laugh/", audio: "https://www.myinstants.com/media/sounds/kira_s-laugh-death-note-ringtone-by-death-note_light-kira.mp3", trigger: "LAUGH-alt", uploader: "lalalale", views: "74,645" },
  { bot: "light", slot: "laugh-kiras-laugh-alt2", page: "https://www.myinstants.com/en/instant/death-note-kiras-laugh-26964/", audio: "https://www.myinstants.com/media/sounds/death-note-kiras-laugh-original_2.mp3", trigger: "LAUGH-alt2", uploader: "", views: "10,188" },
  // Levi (5)
  { bot: "levi", slot: "bark-levi-ackerman", page: "https://www.myinstants.com/en/instant/levi-ackerman-26688/", audio: "https://www.myinstants.com/media/sounds/trim6c5ff351-d78b-46bb-be38-73e2.mp3", trigger: "BARK", uploader: "the763", views: "12,743" },
  { bot: "levi", slot: "rage-kenny-scream", page: "https://www.myinstants.com/en/instant/levi-scream-kenny-51396/", audio: "https://www.myinstants.com/media/sounds/kenny-and-levi-meet-again-kenny-kills-levis-squad-attack-on-titan-episode-38-mp3cut.mp3", trigger: "RAGE", uploader: "Vengador1", views: "15,132" },
  { bot: "levi", slot: "bark-oi-short", page: "https://www.myinstants.com/en/instant/levi-oi-9433/", audio: "https://www.myinstants.com/media/sounds/tmpqjqyf_4z.mp3", trigger: "BARK-short", uploader: "myinstantstelegrambot", views: "753" },
  { bot: "levi", slot: "briefing-survey-corps", page: "https://www.myinstants.com/en/instant/survey-corps-60509/", audio: "https://www.myinstants.com/media/sounds/tmpgmvk1hgp.mp3", trigger: "BRIEFING", uploader: "myinstantsbot", views: "96" },
  { bot: "levi", slot: "sting-aot-alarm", page: "https://www.myinstants.com/en/instant/levi-aot-alarm-59125/", audio: "https://www.myinstants.com/media/sounds/levi_aot_alarm.mp3", trigger: "STING", uploader: "guido_mista", views: "601" },
  // Deadpool (6; chimichanga-stand is the primary gag, thin clip excluded)
  { bot: "deadpool", slot: "entry-oh-hello", page: "https://www.myinstants.com/en/instant/deadpool-oh-hello-99586/", audio: "https://www.myinstants.com/media/sounds/y2mate_zDcMnH1.mp3", trigger: "ENTRY", uploader: "william05", views: "4,986" },
  { bot: "deadpool", slot: "taunt-laughing", page: "https://www.myinstants.com/en/instant/deadpool-laughing-65400/", audio: "https://www.myinstants.com/media/sounds/deadpool-laughing.mp3", trigger: "TAUNT", uploader: "minerobart", views: "1,215" },
  { bot: "deadpool", slot: "address-hey-you-guys", page: "https://www.myinstants.com/en/instant/deadpool-hey-you-guys-16932/", audio: "https://www.myinstants.com/media/sounds/hey-you-guys_Wz4vMCh.mp3", trigger: "ADDRESS", uploader: "Marconox", views: "1,008" },
  { bot: "deadpool", slot: "entry-welcome-party", page: "https://www.myinstants.com/en/instant/deadpool-welcome-to-the-party-/", audio: "https://www.myinstants.com/media/sounds/deadpool-host-alert-audiotrimmer.mp3", trigger: "ENTRY-sting", uploader: "GIGSHOT", views: "1,044" },
  { bot: "deadpool", slot: "gag-chimichanga-stand", page: "https://www.myinstants.com/en/instant/thats-my-chimichanga-stand-22867/", audio: "https://www.myinstants.com/media/sounds/thats-my-chimichanga-stand.mp3", trigger: "GAG primary", uploader: "emil135", views: "370" },
  { bot: "deadpool", slot: "taunt-wrong-button", page: "https://www.myinstants.com/en/instant/deadpool-you-pressed-the-wrong-button-6008/", audio: "https://www.myinstants.com/media/sounds/dp_nYcqCQq.mp3", trigger: "TAUNT", uploader: "tsukiyomaru", views: "2,300" },
  // Itachi (6; EN genjutsu primary, PT-BR excluded)
  { bot: "itachi", slot: "sfx-sharingan", page: "https://www.myinstants.com/en/instant/itachi-sharingan-naruto-43808/", audio: "https://www.myinstants.com/media/sounds/itachi-mangekyou-sharingan-sound-effect.mp3", trigger: "SFX", uploader: "angel65", views: "27,980" },
  { bot: "itachi", slot: "sfx-sharingan-alt", page: "https://www.myinstants.com/en/instant/itachi-sharingan-68074/", audio: "https://www.myinstants.com/media/sounds/mangekyo-sharingan-sound-effect-with-download-link_pWHYt57.mp3", trigger: "SFX-alt", uploader: "see page", views: "see page" },
  { bot: "itachi", slot: "speech-best-of", page: "https://www.myinstants.com/en/instant/itachi-mangekyo-sharingan-2974/", audio: "https://www.myinstants.com/media/sounds/best-of-itachi-speech.mp3", trigger: "SPEECH", uploader: "see page", views: "see page" },
  { bot: "itachi", slot: "genjutsu-voice-en", page: "https://www.myinstants.com/en/instant/itachi-genjutsu-28835/", audio: "https://www.myinstants.com/media/sounds/itachi-genjutsu.mp3", trigger: "GENJUTSU-voice EN", uploader: "peter2118", views: "445" },
  { bot: "itachi", slot: "sting-mangekyo", page: "https://www.myinstants.com/en/instant/mangekyo-sharingan/", audio: "https://www.myinstants.com/media/sounds/mangekyoshi-sharingan.mp3", trigger: "STING", uploader: "Windslasher", views: "216,770" },
  { bot: "itachi", slot: "crow-caw", page: "https://www.myinstants.com/en/instant/crow-sound-caw-13526/", audio: "https://www.myinstants.com/media/sounds/raven-caw-caw.mp3", trigger: "CROW", uploader: "jobvenom", views: "88,727" },
  // Aizen (6)
  { bot: "aizen", slot: "entry-yokoso-full", page: "https://www.myinstants.com/en/instant/aizen-yokoso-full-55496/", audio: "https://www.myinstants.com/media/sounds/aizen-yokoso-full.mp3", trigger: "ENTRY", uploader: "migamind", views: "50,298" },
  { bot: "aizen", slot: "entry-yokoso-short", page: "https://www.myinstants.com/en/instant/aizen-yokoso-27069/", audio: "https://www.myinstants.com/media/sounds/bbs-aizen-tybw-quotes-online-audio-converter.mp3", trigger: "ENTRY-short", uploader: "carl_justine", views: "11,945" },
  { bot: "aizen", slot: "attack-hado-99", page: "https://www.myinstants.com/en/instant/aizen-hado-99-4378/", audio: "https://www.myinstants.com/media/sounds/aizen-hado-99.mp3", trigger: "ATTACK", uploader: "migamind", views: "10,308" },
  { bot: "aizen", slot: "pressure-reiatsu", page: "https://www.myinstants.com/en/instant/aizen-reiatsu-de-11972/", audio: "https://www.myinstants.com/media/sounds/aizen-reiatsu-de.mp3", trigger: "PRESSURE", uploader: "migamind", views: "2,936" },
  { bot: "aizen", slot: "shatter", page: "https://www.myinstants.com/en/instant/aizen-shatter-878/", audio: "https://www.myinstants.com/media/sounds/aizen-shatter.mp3", trigger: "SHATTER", uploader: "Funjimmywantstodie", views: "341" },
  { bot: "aizen", slot: "entry-yokoso-2", page: "https://www.myinstants.com/en/instant/aizen-sosuke-yokoso-2-76877/", audio: "https://www.myinstants.com/media/sounds/aizen-sosuke-yokoso-2.mp3", trigger: "ENTRY-alt", uploader: "dzakir", views: "1,386" },
  // Merchant (3)
  { bot: "merchant", slot: "open-welcome", page: "https://www.myinstants.com/en/instant/n-merchant-welcome-12965/", audio: "https://www.myinstants.com/media/sounds/n-merchant-welcome.mp3", trigger: "OPEN", uploader: "g-r-b-herb", views: "304" },
  { bot: "merchant", slot: "success-thank-you", page: "https://www.myinstants.com/en/instant/re4-merchant-hehe-thank-you/", audio: "https://www.myinstants.com/media/sounds/resident-evil-4-merchant-thank-you.mp3", trigger: "SUCCESS", uploader: "see page", views: "19,873" },
  { bot: "merchant", slot: "troll-not-enough-cash", page: "https://www.myinstants.com/en/instant/n-merchant-not-enough-cash-66612/", audio: "https://www.myinstants.com/media/sounds/n-merchant-not-enough-cash.mp3", trigger: "TROLL", uploader: "g-r-b-herb", views: "247" },
  // Portal (2; open-loop loops client-side)
  { bot: "portal", slot: "open-loop", page: "https://www.myinstants.com/en/instant/nether-portal-17190/", audio: "https://www.myinstants.com/media/sounds/portail-du-nether.mp3", trigger: "OPEN-LOOP", uploader: "UndergrndFurret", views: "33,739" },
  { bot: "portal", slot: "enter-whoosh", page: "https://www.myinstants.com/en/instant/nether-portal-travil-sound-44535/", audio: "https://www.myinstants.com/media/sounds/nether-portal-travil-sound.mp3", trigger: "ENTER-WHOOSH", uploader: "bartek876", views: "899" },
];

async function main(): Promise<void> {
  const byBot = new Map<string, Array<Row & { bytes: number; localPath: string }>>();
  let failed = 0;
  for (const row of ROWS) {
    const localPath = `frontend/public/sounds/${row.bot}/${row.slot}.mp3`;
    const dest = join(backendRoot, "..", localPath);
    let bytes = 0;
    try {
      execFileSync(
        "curl",
        [
          "-sS", "--fail", "-L",
          "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "--referer", row.page,
          "-o", dest,
          row.audio,
        ],
        { stdio: "pipe" },
      );
      bytes = statSync(dest).size;
    } catch {
      console.error(`FAIL ${row.bot}/${row.slot}`);
      failed += 1;
      continue;
    }
    console.log(`ok ${row.bot}/${row.slot} ${bytes}B`);
    const list = byBot.get(row.bot) ?? [];
    list.push({ ...row, bytes, localPath: `/${localPath.replace("frontend/public", "")}` });
    byBot.set(row.bot, list);
  }
  for (const [bot, list] of byBot) {
    writeFileSync(join(assetsRoot, `${bot}.json`), JSON.stringify(list, null, 2) + "\n");
  }
  const md: string[] = [
    "# SOUNDS.md — vendored MyInstants credit table",
    "",
    "All files served same-origin under `/sounds/`. Never hotlink MyInstants at event time.",
    "",
    "| sound_id | local_path | myinstants_page | uploader | views | trigger | bytes |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of ROWS) {
    const found = byBot.get(row.bot)?.find((r) => r.slot === row.slot);
    md.push(
      `| ${row.bot}/${row.slot} | /sounds/${row.bot}/${row.slot}.mp3 | ${row.page} | ${row.uploader} | ${row.views} | ${row.trigger} | ${found?.bytes ?? "MISSING"} |`,
    );
  }
  const soundsDocDir = join(backendRoot, "..", "assets", "sounds");
  mkdirSync(soundsDocDir, { recursive: true });
  writeFileSync(join(soundsDocDir, "SOUNDS.md"), md.join("\n") + "\n");
  if (failed > 0) {
    throw new Error(`${failed} downloads failed`);
  }
  console.log(`vendored ${ROWS.length} sounds`);
}

await main();
