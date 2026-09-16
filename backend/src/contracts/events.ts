// Single-sourced WS + room contracts. Frontend imports this file. No duplicated schemas.
// Every frame on the wire: { id, at, event, data }.

export type BotId =
  | "wick"
  | "spidey"
  | "escanor"
  | "stark"
  | "joker"
  | "light"
  | "levi"
  | "deadpool"
  | "itachi"
  | "aizen"
  | "merchant";

export type Round = "r1" | "r2";

export interface Frame<TEvent extends string, TData> {
  id: string;
  at: string;
  event: TEvent;
  data: TData;
}

export interface HelloData {
  teamId: string;
  round: Round;
  lastEventId?: string;
}

export interface ChatSendData {
  teamId: string;
  botId: BotId;
  text: string;
}

export interface BotTypingData {
  teamId: string;
  botId: BotId;
  typing: boolean;
}

export interface BotTokenData {
  botId: BotId;
  delta: string;
}

export interface InventoryDelta {
  botId: BotId;
  itemKey: string;
  status: "locked" | "obtained" | "submitted" | "verified";
  obtainedBy?: string;
  claimed?: boolean;
}

export interface BotDoneData {
  botId: BotId;
  fullText: string;
  typing: false;
  inventoryDelta?: InventoryDelta;
}

export interface SoundPlayData {
  botId: BotId;
  soundId: string;
  src: string;
}

export interface BotErrorData {
  botId: BotId;
  message: string;
  retryable: boolean;
  kind?: string | undefined;
}

export interface InventorySyncData {
  items: InventoryDelta[];
  credits?: number;
}

export interface GateStateData {
  round1Open: boolean;
  vaultOpen: boolean;
  qualified: boolean;
}

export interface AllyMsgData {
  botId: BotId;
  displayName: string;
  text: string;
  confirmed: boolean;
}

export interface EffectPlayData {
  botId: BotId;
  effectId: string;
}

export interface AnnouncementData {
  id: string;
  message: string;
  level: "info" | "warning" | "alert";
  sender?: string;
  timestamp: string;
}

export interface EloUpdateData {
  teamId: string;
  elo: number;
  delta: number;
  reason: string;
  baseDelta?: number;
  speedBonus?: number;
  completionRank?: number;
  elapsedSecs?: number;
}

export interface ChatSyncData {
  history: Partial<Record<BotId, Array<{
    id?: number;
    role: "user" | "bot";
    text: string;
    createdAt?: string;
  }>>>;
}

export interface BotLockInfo {
  displayName: string;
  since: string;
}

export interface BotLocksData {
  locks: Partial<Record<BotId, BotLockInfo>>;
}

export interface LeaderboardShowcaseData {
  botId: Exclude<BotId, "itachi" | "aizen" | "merchant">;
  playerName: string;
  teamName: string;
  completionRank: 1;
}

export interface Round2CountdownData {
  endsAt: string;
}

export interface Round2StartData {
  durationSecs: number;
}

export interface Round2EndData {
  reason: "expired" | "admin_stop";
}

export interface Round2ExtendData {
  addedSecs: number;
  newEndsAt: string;
}

export interface PresenceMember {
  displayName: string;
  status: "online" | "away" | "offline";
}

export interface PresenceSyncData {
  members: PresenceMember[];
}

export interface AssessmentSettingsData {
  requireFullscreen: boolean;
  detectTabSwitches: boolean;
  singleTabMode: boolean;
  disableRightClick: boolean;
  disableCopyPaste: boolean;
}

export interface VisibilityChangeData {
  status: "online" | "away";
}

export interface SecurityViolationData {
  type: "fullscreen_exit" | "tab_switch" | "copy_paste" | "right_click";
}

export interface AdminTelemetryData {
  tps: number;
  peakTps: number;
  tokensIn: number;
  tokensOut: number;
}

export interface GameTickData {
  scope: "board" | "gates" | "all";
}

export type ClientEvent =
  | Frame<"hello", HelloData>
  | Frame<"ping", Record<string, never>>
  | Frame<"chat_send", ChatSendData>
  | Frame<"visibility_change", VisibilityChangeData>
  | Frame<"security_violation", SecurityViolationData>;

export type ServerEvent =
  | Frame<"hello_ack", { resumeFrom?: string }>
  | Frame<"pong", Record<string, never>>
  | Frame<"bot_typing", BotTypingData>
  | Frame<"bot_token", BotTokenData>
  | Frame<"bot_done", BotDoneData>
  | Frame<"sound_play", SoundPlayData>
  | Frame<"bot_error", BotErrorData>
  | Frame<"inventory_sync", InventorySyncData>
  | Frame<"gate_state", GateStateData>
  | Frame<"ally_msg", AllyMsgData>
  | Frame<"effect_play", EffectPlayData>
  | Frame<"announcement", AnnouncementData>
  | Frame<"elo_update", EloUpdateData>
  | Frame<"chat_sync", ChatSyncData>
  | Frame<"bot_locks", BotLocksData>
  | Frame<"leaderboard_showcase", LeaderboardShowcaseData>
  | Frame<"round2_countdown", Round2CountdownData>
  | Frame<"round2_start", Round2StartData>
  | Frame<"round2_end", Round2EndData>
  | Frame<"round2_extend", Round2ExtendData>
  | Frame<"presence_sync", PresenceSyncData>
  | Frame<"assessment_settings_sync", AssessmentSettingsData>
  | Frame<"game_tick", GameTickData>
  | Frame<"admin_telemetry", AdminTelemetryData> | Frame<"game_reset", Record<string, never>>;
export type AnyEvent = ClientEvent | ServerEvent;
