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

export function parseEvent(raw: string): AnyEvent {
  const frame = JSON.parse(raw) as AnyEvent;
  if (typeof frame.id !== "string" || typeof frame.event !== "string") {
    throw new Error("malformed frame");
  }
  return frame;
}
