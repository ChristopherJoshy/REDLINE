import { useCallback, useEffect, useRef, useState } from "react";
import type { AnyEvent, BotId, InventoryDelta } from "@contracts/events";
import { createFrame, parseEvent, wsUrl } from "@/ws/client";
import { playSound } from "@/chat/sound";
import { apiUrl, apiFetch } from "@/api/client";
import { getLocks, type BotLockMap } from "@/api/locks";

export interface ChatMessage {
  id?: number | undefined;
  role: "user" | "bot" | "ally";
  text: string;
  name?: string | undefined;
  confirmed?: boolean | undefined;
  createdAt?: string | undefined;
}

interface BotState {
  messages: ChatMessage[];
  typing: boolean;
  streaming: string;
}

const ROSTER: BotId[] = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool", "itachi", "aizen", "merchant"];


export function useBotStream(teamId: string, round: "r1" | "r2" = "r1"): {
  bots: Record<BotId, BotState>;
  inventory: InventoryDelta[];
  hasSyncedInventory: boolean;
  credits: number;
  flash: number;
  locks: BotLockMap;
  connected: boolean;
  setLocks: React.Dispatch<React.SetStateAction<BotLockMap>>;
  send: (botId: BotId, text: string) => boolean;
  say: (botId: BotId, text: string) => void;
  rewind: (botId: BotId, options?: { messageId?: number; turns?: number }) => Promise<{ ok: boolean; error?: string }>;
} {
  const [bots, setBots] = useState<Record<BotId, BotState>>(() => {
    const out = {} as Record<BotId, BotState>;
    for (const b of ROSTER) {
      out[b] = { messages: [], typing: false, streaming: "" };
    }
    return out;
  });
  const [inventory, setInventory] = useState<InventoryDelta[]>([]);
  const [hasSyncedInventory, setHasSyncedInventory] = useState(false);
  const [credits, setCredits] = useState(0);
  const [flash, setFlash] = useState(0);
  const [locks, setLocks] = useState<BotLockMap>({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const transportRef = useRef<"ws" | "sse" | null>(null);
  const retryRef = useRef(1000);
  const lastSoundRef = useRef<string | null>(null);
  const seenFramesRef = useRef(new Set<string>());

  const apply = useCallback((event: AnyEvent) => {
    if (seenFramesRef.current.has(event.id)) return;
    seenFramesRef.current.add(event.id);
    if (seenFramesRef.current.size > 500) {
      const oldest = seenFramesRef.current.values().next().value;
      if (oldest !== undefined) seenFramesRef.current.delete(oldest);
    }
    if (event.event === "bot_typing") {
      const { botId, typing } = event.data;
      setBots((prev) => ({ ...prev, [botId]: { ...prev[botId], typing } }));
    } else if (event.event === "bot_token") {
      const { botId, delta } = event.data;
      setBots((prev) => ({ ...prev, [botId]: { ...prev[botId], streaming: prev[botId].streaming + delta } }));
    } else if (event.event === "bot_done") {
      const { botId, fullText, inventoryDelta } = event.data;
      setBots((prev) => ({
        ...prev,
        [botId]: { messages: [...prev[botId].messages, { role: "bot", text: fullText }], typing: false, streaming: "" },
      }));
      if (inventoryDelta !== undefined) {
        setInventory((prev) => [...prev.filter((i) => i.botId !== botId), inventoryDelta]);
      }
      try {
        window.localStorage.setItem("redline_last_event", event.id);
      } catch {
        // Storage blocked: resume replays from hello instead.
      }
    } else if (event.event === "bot_error") {
      const { botId, message } = event.data;
      setBots((prev) => ({
        ...prev,
        [botId]: { messages: [...prev[botId].messages, { role: "bot", text: message }], typing: false, streaming: "" },
      }));
    } else if (event.event === "sound_play") {
      const key = `${event.data.botId}:${event.data.soundId ?? event.data.src}`;
      if (lastSoundRef.current !== key) {
        lastSoundRef.current = key;
        playSound(event.data.src);
      }
    } else if (event.event === "inventory_sync") {
      setInventory(event.data.items);
      setHasSyncedInventory(true);
      if (typeof event.data.credits === "number") setCredits(event.data.credits);
    } else if (event.event === "ally_msg") {
      const { botId, displayName, text, confirmed } = event.data;
      setBots((prev) => ({
        ...prev,
        [botId]: { ...prev[botId], messages: [...prev[botId].messages, { role: "ally", text, name: displayName, confirmed }] },
      }));
    } else if (event.event === "effect_play") {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setFlash((f) => f + 1);
      }
    } else if (event.event === "announcement") {
      window.dispatchEvent(new CustomEvent("arena:announcement", { detail: event.data }));
      try {
        playSound("/sounds/portal_active.mp3");
      } catch {
        // sound optional
      }
    } else if (event.event === "elo_update") {
      window.dispatchEvent(new CustomEvent("arena:elo_update", { detail: event.data }));
      try {
        playSound("/sounds/merchant_success.mp3");
      } catch {
        // sound optional
      }
    } else if (event.event === "bot_locks") {
      setLocks(event.data.locks);
    } else if (event.event === "chat_sync") {
      setConnected(transportRef.current !== null);
      const history = event.data.history;
      setBots((prev) => {
        const next = { ...prev };
        for (const [botId, msgs] of Object.entries(history)) {
          const bId = botId as BotId;
          if (next[bId] && msgs) {
            next[bId] = {
              ...next[bId],
              messages: msgs.map((m) => ({
                id: m.id,
                role: m.role,
                text: m.text,
                createdAt: m.createdAt,
              })),
            };
          }
        }
        return next;
      });
    } else if (event.event === "round2_end") {
      window.dispatchEvent(new CustomEvent("arena:round2_end", { detail: event.data }));
    } else if (event.event === "round2_countdown") {
      window.dispatchEvent(new CustomEvent("arena:round2_countdown", { detail: event.data }));
    } else if (event.event === "round2_start") {
      window.dispatchEvent(new CustomEvent("arena:round2_start", { detail: event.data }));
    } else if (event.event === "round2_extend") {
      window.dispatchEvent(new CustomEvent("arena:round2_extend", { detail: event.data }));
    } else if (event.event === "assessment_settings_sync") {
      window.dispatchEvent(new CustomEvent("arena:assessment_settings", { detail: event.data }));
    }
  }, []);

  // Fetch initial locks so a fresh mount sees who holds which mark
  useEffect(() => {
    let dead = false;
    getLocks()
      .then((l) => { if (!dead) setLocks(l); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    let dead = false;
    let retryTimer: number | undefined;
    let source: EventSource | undefined;
    let failures = 0;

    function connect(): void {
      if (dead) {
        return;
      }
      if (failures >= 3 && source === undefined) {
        // Venue firewall blocked the upgrade: EventSource carries server frames one-way.
        let last = "";
        try {
          last = window.localStorage.getItem("redline_last_event") ?? "";
        } catch {
          last = "";
        }
        const streamUrl = new URL(apiUrl("/api/stream"), window.location.href);
        if (last !== "") streamUrl.searchParams.set("lastEventId", last);
        try {
          const token = window.localStorage.getItem("redline_session_token");
          if (token) streamUrl.searchParams.set("token", token);
        } catch { /* Cookie authentication remains available. */ }
        source = new EventSource(streamUrl.toString(), { withCredentials: true });
        source.onopen = () => { transportRef.current = "sse"; };
        source.onerror = () => {
          if (transportRef.current === "sse") {
            transportRef.current = null;
            setConnected(false);
          }
        };
        source.onmessage = (e: MessageEvent<string>) => {
          try {
            apply(parseEvent(e.data));
          } catch {
            // Malformed frame: skip, keep the stream alive.
          }
        };
      }
      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;
      socket.onopen = () => {
        failures = 0;
        retryRef.current = 1000;
        source?.close();
        source = undefined;
        transportRef.current = "ws";
        let last = "";
        try {
          last = window.localStorage.getItem("redline_last_event") ?? "";
        } catch {
          last = "";
        }
        socket.send(JSON.stringify(createFrame("hello", { teamId, round, ...(last === "" ? {} : { lastEventId: last }) })));
      };
      socket.onmessage = (e: MessageEvent<string>) => {
        try {
          apply(parseEvent(typeof e.data === "string" ? e.data : ""));
        } catch {
          // Malformed frame: skip, keep the socket alive.
        }
      };
      socket.onerror = () => {
        socket.close();
      };
      socket.onclose = () => {
        if (dead) {
          return;
        }
        if (transportRef.current !== "sse") {
          transportRef.current = null;
          setConnected(false);
          setBots((prev) => Object.fromEntries(Object.entries(prev).map(([id, state]) => [id, { ...state, typing: false, streaming: "" }])) as Record<BotId, BotState>);
        }
        failures += 1;
        const wait = Math.min(retryRef.current * (1 + Math.random() * 0.25), 30_000);
        retryRef.current = Math.min(retryRef.current * 2, 30_000);
        retryTimer = window.setTimeout(connect, wait);
      };
    }

    connect();
    return () => {
      dead = true;
      window.clearTimeout(retryTimer);
      source?.close();
      socketRef.current?.close();
    };
  }, [teamId, round, apply]);

  useEffect(() => {
    function sendPresence(): void {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(createFrame("visibility_change", {
        status: document.hidden ? "away" : "online",
      })));
    }
    function reportViolation(event: Event): void {
      const detail = (event as CustomEvent<{ type?: unknown }>).detail;
      const type = detail?.type;
      if (type !== "fullscreen_exit" && type !== "tab_switch" && type !== "copy_paste" && type !== "right_click") return;
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(createFrame("security_violation", { type })));
    }
    document.addEventListener("visibilitychange", sendPresence);
    window.addEventListener("arena:security_violation", reportViolation);
    return () => {
      document.removeEventListener("visibilitychange", sendPresence);
      window.removeEventListener("arena:security_violation", reportViolation);
    };
  }, []);

  const send = useCallback(
    (botId: BotId, text: string) => {
      const socket = socketRef.current;
      if (!connected || transportRef.current === null) return false;
      const frame = createFrame("chat_send", { teamId, botId, text });
      if (transportRef.current === "ws") {
        if (socket === null || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(frame));
      } else {
        void apiFetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botId, text }),
        }).then(async (response) => {
          if (response.ok) return;
          const data = await response.json() as { error?: string };
          throw new Error(data.error ?? "Message could not be sent. Try again.");
        }).catch((error: unknown) => {
          setBots((prev) => ({ ...prev, [botId]: {
            ...prev[botId], typing: false, streaming: "",
            messages: [...prev[botId].messages, { role: "bot", text: error instanceof Error ? error.message : "Connection lost. Try sending your message again." }],
          } }));
        });
      }
      setBots((prev) => ({ ...prev, [botId]: { ...prev[botId], typing: true, messages: [...prev[botId].messages, { role: "user", text }] } }));
      return true;
    },
    [teamId, connected],
  );

  // Local merchant-desk notes: deterministic counter receipts land in the
  // thread instantly; the server persists the same lines in chat_logs.
  const say = useCallback((botId: BotId, text: string) => {
    setBots((prev) => ({ ...prev, [botId]: { ...prev[botId], messages: [...prev[botId].messages, { role: "bot", text }] } }));
  }, []);
  // Player rewind: server truncates chat_logs (at messageId/turns or whole chat) + charges 1 ELO.
  // Updates local transcript to the server's remaining messages, then syncs HUD.
  const rewind = useCallback(
    async (botId: BotId, options?: { messageId?: number; turns?: number }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await apiFetch("/api/rewind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botId, ...options }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          elo?: number;
          messages?: Array<{ id?: number; role: "user" | "bot"; text: string; createdAt?: string }>;
          error?: string;
        };
        if (!res.ok || data.ok !== true) {
          return { ok: false, error: data.error ?? "Rewind failed" };
        }
        const remaining: ChatMessage[] = (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          createdAt: m.createdAt,
        }));
        setBots((prev) => ({
          ...prev,
          [botId]: { messages: remaining, typing: false, streaming: "" },
        }));
        window.dispatchEvent(
          new CustomEvent("arena:elo_update", {
            detail: { teamId, elo: data.elo ?? 0, delta: -1, reason: `rewind:${botId}` },
          }),
        );
        return { ok: true };
      } catch {
        return { ok: false, error: "Rewind failed" };
      }
    },
    [teamId],
  );

  return { bots, inventory, hasSyncedInventory, credits, flash, locks, connected, setLocks, send, say, rewind };
}
