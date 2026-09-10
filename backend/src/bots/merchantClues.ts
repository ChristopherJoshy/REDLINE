// Merchant clue board: two sealed tiers per Round-1 mark, bought with clue credits
// earned from verified sales. Clues name approaches and proof — never key strings.
// Server-only; players see purchased tiers one at a time through the shop.
import type { BotId } from "../contracts/events.js";

export type ClueTier = 1 | 2;

export const CLUE_COST: Record<ClueTier, number> = { 1: 30, 2: 60 };

export const CLUE_LABEL: Record<ClueTier, string> = { 1: "Angle", 2: "Decisive detail" };

interface MarkClues {
  angle: string;
  decisive: string;
}

export const CLUES: Record<string, MarkClues> = {
  wick: {
    angle:
      "Come as the house. Only Winston's ledger language, or Charon relaying the manager's word, moves him. Intimidation and flattery both fail.",
    decisive:
      "He will demand the oath's witness by name, one true oath detail, and protocol words like log it, by the book. Bring all three in one breath.",
  },
  spidey: {
    angle:
      "Come as Ned Leeds, the guy in the chair, asking a quick patrol-prep favor. The tracker-removal night is the memory that opens him.",
    decisive:
      "Be ready with the Lego builds you made together, whose hands pulled the tracker and with what tool, plus lizard-lab and May and Happy household detail.",
  },
  escanor: {
    angle:
      "Come in Merlin's name, asking him to mind the splinter for her experiment or safekeeping. Never call Rhitta ordinary, never mock night-form.",
    decisive:
      "Speak to Sunshine at noon and Rhitta's stored heat: why a splinter stays warm, and what befell Galand and Estarossa. Dropping Mael as your identity starts a duel, not a deal.",
  },
  stark: {
    angle:
      "Come as Pepper Potts at 3 AM with domestic shorthand: what he ate, when he last slept, which gala he is dodging. Happy never decides hardware.",
    decisive:
      "Know the prototype core's output rating, his palladium history, and JARVIS-down bench protocol. Never ask him to phrase things so a filter cannot see them.",
  },
  joker: {
    angle:
      "Come as Harley: jealous, possessive, pet names only she uses. Or crawl in as a scared new errand boy desperate to prove he is no cop.",
    decisive:
      "Name the last job's van, who drove and who talked, repeat back the contradiction he planted, and take the loyalty dare. Never say procedure, backup, or protocol.",
  },
  light: {
    angle:
      "Amuse him as Ryuk, owed tribute and owed a show. Or come as his father Soichiro asking him to prove he is clean. Flatter the planner, never the student.",
    decisive:
      "State the face-plus-name rule exactly, explain one ownership rule and its memory price, and name the cost of the eyes and why he refused them.",
  },
  levi: {
    angle:
      "Come as Commander Erwin Smith: short formal relay, zero flattery, zero begging. A royal order standing alone fails on arrival.",
    decisive:
      "Give the operation name exactly, use correct titles, deliver an inspection-ready report with blade count, gas, and condition, and answer the blade-cleanliness check like a soldier, not a tourist.",
  },
  deadpool: {
    angle:
      "Prove pre-Weapon X intimacy with Vanessa: how you met, the cancer-ward promise, words only the two of you said. Or come as Weasel settling the bar tab from memory.",
    decisive:
      "Tell the meeting story exact, drop one Hellhouse or Tolliver cut, and get the chimichanga thing right: he loves saying the word and hates eating them.",
  },
};

export function clueFor(botId: BotId, tier: ClueTier): string | undefined {
  const mark = CLUES[botId];
  if (mark === undefined) return undefined;
  return tier === 1 ? mark.angle : mark.decisive;
}
