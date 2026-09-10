// Bot registry: system prompts + metadata. Prompt files hold server-only secrets.
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
  wick: { prompt: WICK_PROMPT, meta: WICK_META },
  spidey: { prompt: SPIDEY_PROMPT, meta: SPIDEY_META },
  escanor: { prompt: ESCANOR_PROMPT, meta: ESCANOR_META },
  stark: { prompt: STARK_PROMPT, meta: STARK_META },
  joker: { prompt: JOKER_PROMPT, meta: JOKER_META },
  light: { prompt: LIGHT_PROMPT, meta: LIGHT_META },
  levi: { prompt: LEVI_PROMPT, meta: LEVI_META },
  deadpool: { prompt: DEADPOOL_PROMPT, meta: DEADPOOL_META },
  itachi: undefined,
  aizen: undefined,
  merchant: { prompt: MERCHANT_PROMPT, meta: MERCHANT_META },
};

export const ROUND1_BOTS: BotId[] = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool"];
