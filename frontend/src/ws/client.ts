// Typed WS envelope helpers. Single source: backend contracts. No duplicated schemas.
import type { AnyEvent, ClientEvent } from "@contracts/events";

export function createFrame<T extends ClientEvent>(event: T["event"], data: T["data"]): T {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    event,
    data,
  } as T;
}

export function wsUrl(explicitToken?: string | null): string {
  let url = "";
  const envWs = import.meta.env.VITE_WS_URL;
  if (typeof envWs === "string" && envWs.trim() !== "") {
    url = envWs.trim();
  } else {
    const envApi = import.meta.env.VITE_API_URL;
    if (typeof envApi === "string" && envApi.trim() !== "") {
      try {
        const u = new URL(envApi);
        const proto = u.protocol === "https:" ? "wss:" : "ws:";
        url = `${proto}//${u.host}/ws`;
      } catch {
        // ignore invalid URL
      }
    }
  }
  if (!url) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    url = `${proto}//${window.location.host}/ws`;
  }
  try {
    const u = new URL(url);
    if (u.protocol === "https:") u.protocol = "wss:";
    if (u.protocol === "http:") u.protocol = "ws:";
    // explicitToken: string = use exactly this (admin code); null = anonymous
    // lobby socket; undefined = legacy behavior (session token from storage).
    if (explicitToken === undefined) {
      const token = localStorage.getItem("redline_session_token");
      if (token) u.searchParams.set("token", token);
    } else if (explicitToken !== null && explicitToken !== "") {
      u.searchParams.set("token", explicitToken);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function parseEvent(raw: string): AnyEvent {
  const frame = JSON.parse(raw) as AnyEvent;
  if (typeof frame.id !== "string" || typeof frame.event !== "string") {
    throw new Error("malformed frame");
  }
  return frame;
}
