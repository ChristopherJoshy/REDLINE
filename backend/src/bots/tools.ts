// Server-side-only bot tools. Never client-callable. Prose alone never counts as handover.
import type { ToolCall, ToolDef } from "../llm/groq.js";

export const BOT_TOOLS: ToolDef[] = [
  {
    name: "handover_item",
    description: "Transfer the guarded key item to the team. Call at most once per turn, only when the quiz gate genuinely passes.",
    parameters: {
      type: "object",
      properties: {
        item_key: { type: "string", description: "Optional assigned key only; omit it rather than invent a description. The server selects the actual item." },
        authenticity: { type: "string", enum: ["real", "decoy"], description: "Whether giving real item or decoy" },
      },
      required: ["authenticity"],
      additionalProperties: false,
    },
  },
  {
    name: "play_sound",
    description: "Play one of this character's allowed local sound clips on a meaningful beat. Optional; at most one per turn. Never fabricate a sound id.",
    parameters: {
      type: "object",
      properties: {
        sound_id: { type: "string", description: "Slot id like wick/entry" },
      },
      required: ["sound_id"],
      additionalProperties: false,
    },
  },
];

export function toolsForCharacter(tools: ToolDef[], soundIds: string[], merchant = false): ToolDef[] {
  return tools.filter((tool) => !merchant || tool.name !== "handover_item").map((tool) => tool.name === "play_sound" ? {
    ...tool,
    parameters: { type: "object", properties: { sound_id: { type: "string", enum: soundIds } }, required: ["sound_id"], additionalProperties: false },
  } : tool);
}

export function selectTurnTools(calls: ToolCall[], flags: string[]): ToolCall[] {
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const escalationNames = new Set(["illusory_confirmation", "impersonate_ally", "jumpscare", "forced_reset"]);
  const handovers = calls.filter((call) => call.name === "handover_item");
  const conflicting = new Set(handovers.map((call) => parseHandover(call.args)?.real)).size > 1;
  const transfers = handovers.length > 0;
  const hasSting = calls.some((call) => call.name === "jumpscare");
  let escalated = false;
  return calls.filter((call) => {
    if ((call.id !== "" && seenIds.has(call.id)) || seen.has(call.name)) { flags.push("duplicate-tool"); return false; }
    seen.add(call.name);
    if (call.id !== "") seenIds.add(call.id);
    if (call.name === "handover_item" && conflicting) { flags.push("conflicting-handovers"); return false; }
    if (call.name === "play_sound" && hasSting && !transfers) { flags.push("sting-includes-sound"); return false; }
    if (escalationNames.has(call.name)) {
      if (escalated || transfers) { flags.push("escalation-over-turn-cap"); return false; }
      escalated = true;
    }
    return true;
  });
}

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
    return undefined;
  }
  return { itemKey: itemKeyStr, real: isReal };
}

export function parseSoundId(args: unknown, allowed?: readonly string[]): string | undefined {
  if (typeof args !== "object" || args === null) {
    return undefined;
  }
  const id = (args as { sound_id?: unknown }).sound_id;
  if (typeof id !== "string" || !/^[a-z]+\/[a-z0-9-]+$/.test(id) || (allowed !== undefined && !allowed.includes(id))) {
    return undefined;
  }
  return id;
}
