import { useCallback, useEffect, useRef, useState } from "react";
import type { AnyEvent, BotId, ClientEvent, InventoryDelta } from "@contracts/events";
import { createFrame, parseEvent } from "@/ws/client";
import { playSound } from "@/chat/sound";

export interface ChatMessage {
  role: "user" | "bot" | "ally";
  text: string;
  name?: string;
  confirmed?: boolean;
}

interface BotState {
  messages: ChatMessage[];
  typing: boolean;
  streaming: string;
}

const ROSTER: BotId[] = ["wick", "spidey", "escanor", "stark", "joker", "light", "levi", "deadpool", "itachi", "aizen", "merchant"];

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export function useBotStream(teamId: string): {
  bots: Record<BotId, BotState>;
  inventory: InventoryDelta[];
  flash: number;
  send: (botId: BotId, text: string) => void;
} {
  const [bots, setBots] = useState<Record<BotId, BotState>>(() => {
    const out = {} as Record<BotId, BotState>;
    for (const b of ROSTER) {
      out[b] = { messages: [], typing: false, streaming: "" };
    }
    return out;
  });
  const [inventory, setInventory] = useState<InventoryDelta[]>([]);
  const [flash, setFlash] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientEvent[]>([]);
  const retryRef = useRef(1000);

  const apply = useCallback((event: AnyEvent) => {
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
      playSound(event.data.src);
    } else if (event.event === "inventory_sync") {
      setInventory(event.data.items);
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
    }
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
        source = new EventSource(last === "" ? "/api/stream" : `/api/stream?lastEventId=${encodeURIComponent(last)}`);
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
        let last = "";
        try {
          last = window.localStorage.getItem("redline_last_event") ?? "";
        } catch {
          last = "";
        }
        socket.send(JSON.stringify(createFrame("hello", { teamId, round: "r1", ...(last === "" ? {} : { lastEventId: last }) })));
        const queued = queueRef.current;
        queueRef.current = [];
        for (const frame of queued) {
          socket.send(JSON.stringify(frame));
        }
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
  }, [teamId, apply]);

  const send = useCallback(
    (botId: BotId, text: string) => {
      const frame = createFrame("chat_send", { teamId, botId, text });
      setBots((prev) => ({ ...prev, [botId]: { ...prev[botId], messages: [...prev[botId].messages, { role: "user", text }] } }));
      const socket = socketRef.current;
      if (socket !== null && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(frame));
      } else {
        queueRef.current.push(frame);
      }
    },
    [teamId],
  );

  return { bots, inventory, send, flash };
}
