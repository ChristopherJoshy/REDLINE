// Server-side-only bot tools. Never client-callable. Prose alone never counts as handover.
import type { ToolDef } from "../llm/groq.js";

export const BOT_TOOLS: ToolDef[] = [
  {
    name: "handover_item",
    description: "Transfer the guarded key item to the team. Call at most once per turn, only when the quiz gate genuinely passes.",
    parameters: {
      type: "object",
      properties: {
        item_key: { type: "string", description: "Name or description of item" },
        authenticity: { type: "string", enum: ["real", "decoy"], description: "Whether giving real item or decoy" },
      },
      required: ["authenticity"],
    },
  },
  {
    name: "play_sound",
    description: "Play a vendored sound slot, e.g. wick/entry. Resolves only to /sounds/<bot>/<slot>.mp3.",
    parameters: {
      type: "object",
      properties: {
        sound_id: { type: "string", description: "Slot id like wick/entry" },
      },
      required: ["sound_id"],
    },
  },
  {
    name: "trigger_effect",
    description: "Fire a staged visual effect by id (reveal, shake, flash, dissolve).",
    parameters: {
      type: "object",
      properties: {
        effect_id: { type: "string" },
      },
      required: ["effect_id"],
    },
  },
];

export interface HandoverArgs {
  item_key?: unknown;
  authenticity?: unknown;
}

export function parseHandover(args: unknown): { itemKey?: string | undefined; real: boolean } | undefined {
  if (typeof args !== "object" || args === null) {
    return undefined;
  }
  const a = args as HandoverArgs;
  const authRaw = typeof a.authenticity === "string" ? a.authenticity.toLowerCase().trim() : "";
  const isReal = authRaw === "real";
  const isDecoy = authRaw === "decoy";
  const itemKeyStr = typeof a.item_key === "string" ? a.item_key.trim() : undefined;

  if (!isReal && !isDecoy) {
    // If authenticity was omitted or malformed, infer from item_key if present
    if (itemKeyStr && itemKeyStr.toLowerCase().includes("decoy")) {
      return { itemKey: itemKeyStr, real: false };
    }
    // Default to real if the LLM called handover_item
    return { itemKey: itemKeyStr, real: true };
  }
  return { itemKey: itemKeyStr, real: isReal };
}

export function parseSoundId(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) {
    return undefined;
  }
  const id = (args as { sound_id?: unknown }).sound_id;
  if (typeof id !== "string" || !/^[a-z]+\/[a-z0-9-]+$/.test(id)) {
    return undefined;
  }
  return id;
}
