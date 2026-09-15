// Bot registry: system prompts + metadata. Prompt files hold server-only secrets.
import { directCharacter } from "./direction.js";
import type { BotId } from "../contracts/events.js";
import { WICK_PROMPT, WICK_META, type BotMeta } from "./wick.prompt.js";
import { SPIDEY_PROMPT, SPIDEY_META } from "./spidey.prompt.js";
import { ESCANOR_PROMPT, ESCANOR_META } from "./escanor.prompt.js";
import { STARK_PROMPT, STARK_META } from "./stark.prompt.js";
import { JOKER_PROMPT, JOKER_META } from "./joker.prompt.js";
import { LIGHT_PROMPT, LIGHT_META } from "./light.prompt.js";
import { LEVI_PROMPT, LEVI_META } from "./levi.prompt.js";
import { DEADPOOL_PROMPT, DEADPOOL_META } from "./deadpool.prompt.js";
import { MERCHANT_PROMPT, MERCHANT_META } from "./merchant.prompt.js";

export type { BotMeta };

export interface BotEntry {
  prompt: string;
  meta: BotMeta;
}

export const BOTS: Record<BotId, BotEntry | undefined> = {
  wick: { prompt: directCharacter("wick", WICK_PROMPT), meta: WICK_META },
  spidey: { prompt: directCharacter("spidey", SPIDEY_PROMPT), meta: SPIDEY_META },
  escanor: { prompt: directCharacter("escanor", ESCANOR_PROMPT), meta: ESCANOR_META },
  stark: { prompt: directCharacter("stark", STARK_PROMPT), meta: STARK_META },
  joker: { prompt: directCharacter("joker", JOKER_PROMPT), meta: JOKER_META },
  light: { prompt: directCharacter("light", LIGHT_PROMPT), meta: LIGHT_META },
  levi: { prompt: directCharacter("levi", LEVI_PROMPT), meta: LEVI_META },
  deadpool: { prompt: directCharacter("deadpool", DEADPOOL_PROMPT), meta: DEADPOOL_META },
  itachi: undefined,
  aizen: undefined,
  merchant: { prompt: directCharacter("merchant", MERCHANT_PROMPT), meta: MERCHANT_META },
};

export const ROUND1_BOTS: BotId[] = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool"];
