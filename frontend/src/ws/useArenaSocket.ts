import { useEffect, useRef } from "react";
import type { AnyEvent } from "@contracts/events";
import { parseEvent, wsUrl } from "@/ws/client";

// Shared no-hello socket for lobby + admin screens: receives broadcast frames
// (assessment_settings_sync, announcements, round events, game_tick, telemetry)
// instantly instead of polling. Auto-reconnects with capped backoff.
// Broadcast frames also fan out as window events so screens that only poll
// (seats, gates, phase) can refetch instantly without owning a socket.
// Names match the useBotStream bridge; the two sockets never coexist on one
// page (lobby XOR authed XOR admin), so nothing double-fires.
const WINDOW_BRIDGE: Record<string, string> = {
  game_tick: "arena:game_tick",
  assessment_settings_sync: "arena:assessment_settings",
  announcement: "arena:announcement",
  round2_start: "arena:round2_start",
  round2_end: "arena:round2_end",
  round2_countdown: "arena:round2_countdown",
  round2_extend: "arena:round2_extend",
};
export function useArenaSocket(opts: {
  token?: string | null;
  enabled?: boolean;
  onEvent: (event: AnyEvent) => void;
}): void {
  const cb = useRef(opts.onEvent);
  cb.current = opts.onEvent;
  const token = opts.token ?? null;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    let socket: WebSocket | null = null;
    let wait = 1000;
    let pingTimer = 0;
    let retryTimer = 0;

    function connect(): void {
      if (dead) return;
      try {
        socket = new WebSocket(wsUrl(token));
      } catch {
        retryTimer = window.setTimeout(() => {
          wait = Math.min(wait * 2, 30_000);
          connect();
        }, wait);
        return;
      }
      socket.onopen = () => {
        wait = 1000;
        window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          try {
            socket?.send(JSON.stringify({ id: crypto.randomUUID(), at: new Date().toISOString(), event: "ping", data: {} }));
          } catch {
            // socket gone; reconnect handles it
          }
        }, 20_000);
      };
      socket.onmessage = (e: MessageEvent<string>) => {
        try {
          const event = parseEvent(typeof e.data === "string" ? e.data : "");
          cb.current(event);
          const bridged = WINDOW_BRIDGE[event.event];
          if (bridged) {
            window.dispatchEvent(new CustomEvent(bridged, { detail: (event as { data: unknown }).data }));
          }
        } catch {
          // malformed frame: skip
        }
      };
      const down = (): void => {
        window.clearInterval(pingTimer);
        if (dead) return;
        retryTimer = window.setTimeout(() => {
          wait = Math.min(wait * 2, 30_000);
          connect();
        }, wait);
      };
      socket.onerror = down;
      socket.onclose = down;
    }

    connect();
    return () => {
      dead = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      try {
        socket?.close();
      } catch {
        // ignore
      }
    };
  }, [enabled, token]);
}
