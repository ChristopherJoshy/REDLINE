import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { ServerEvent } from "../contracts/events.js";

interface RingEntry {
  id: string;
  at: number;
  teamId: string;
  frame: ServerEvent;
}

const RING_SIZE = 100;
const RING_MS = 60_000;
const PING_MS = 25_000;
const PONG_MS = 10_000;

export class Bus {
  private teamSockets = new Map<string, Set<WebSocket>>();
  private alive = new Map<WebSocket, boolean>();
  private teams = new Map<WebSocket, string>();
  private members = new Map<WebSocket, { teamId: string; displayName: string; status: "online" | "away" }>();
  private ring: RingEntry[] = [];
  private listeners = new Map<string, Set<(event: ServerEvent) => void>>();

  subscribe(teamId: string, fn: (event: ServerEvent) => void): () => void {
    const set = this.listeners.get(teamId) ?? new Set<(event: ServerEvent) => void>();
    set.add(fn);
    this.listeners.set(teamId, set);
    return () => {
      set.delete(fn);
    };
  }

  add(socket: WebSocket, teamId: string): void {
    this.teams.set(socket, teamId);
    this.alive.set(socket, true);
    const set = this.teamSockets.get(teamId) ?? new Set<WebSocket>();
    set.add(socket);
    this.teamSockets.set(teamId, set);
    socket.on("pong", () => {
      this.alive.set(socket, true);
    });
    socket.on("close", () => {
      this.remove(socket);
    });
  }

  setMember(
    socket: WebSocket,
    displayName: string,
    status: "online" | "away" = "online",
    enforceSingleTab = false,
  ): void {
    const teamId = this.teams.get(socket);
    if (!teamId) return;

    if (enforceSingleTab && displayName !== "") {
      for (const [otherSocket, member] of this.members.entries()) {
        if (member.teamId === teamId && member.displayName === displayName && otherSocket !== socket) {
          otherSocket.close(4009, "Duplicate tab");
          this.remove(otherSocket);
        }
      }
    }

    this.members.set(socket, { teamId, displayName, status });
    this.broadcastPresence(teamId);
  }

  memberOf(socket: WebSocket): { teamId: string; displayName: string; status: "online" | "away" } | undefined {
    return this.members.get(socket);
  }

  remove(socket: WebSocket): void {
    const teamId = this.teams.get(socket);
    const hadMember = this.members.has(socket);
    if (teamId !== undefined) {
      this.teamSockets.get(teamId)?.delete(socket);
    }
    this.teams.delete(socket);
    this.alive.delete(socket);
    this.members.delete(socket);
    if (teamId && hadMember) {
      this.broadcastPresence(teamId);
    }
  }

  private broadcastPresence(teamId: string): void {
    const membersList: { displayName: string; status: "online" | "away" | "offline" }[] = [];
    for (const member of this.members.values()) {
      if (member.teamId === teamId && member.displayName !== "") {
        membersList.push({ displayName: member.displayName, status: member.status });
      }
    }
    this.broadcast(teamId, this.frame("presence_sync", { members: membersList }));
  }

  teamOf(socket: WebSocket): string | undefined {
    return this.teams.get(socket);
  }

  send(socket: WebSocket, event: ServerEvent): void {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(event));
    }
  }

  broadcast(teamId: string, event: ServerEvent): void {
    this.pushRing(teamId, event);
    for (const socket of this.teamSockets.get(teamId) ?? []) {
      this.send(socket, event);
    }
    for (const fn of this.listeners.get(teamId) ?? []) {
      fn(event);
    }
  }

  broadcastAll(event: ServerEvent): void {
    for (const teamId of this.teamSockets.keys()) {
      this.pushRing(teamId, event);
    }
    for (const socket of this.teams.keys()) {
      this.send(socket, event);
    }
    for (const listeners of this.listeners.values()) {
      for (const fn of listeners) {
        fn(event);
      }
    }
  }

  connectionCount(): number {
    return this.teams.size;
  }

  activeTeams(): string[] {
    return Array.from(this.teamSockets.keys());
  }

  replay(socket: WebSocket, teamId: string, lastEventId: string): void {
    const idx = this.ring.findIndex((e) => e.id === lastEventId && e.teamId === teamId);
    const missed = idx < 0 ? [] : this.ring.slice(idx + 1).filter((e) => e.teamId === teamId);
    for (const entry of missed) {
      this.send(socket, entry.frame);
    }
  }

  sweep(): void {
    const now = Date.now();
    this.ring = this.ring.filter((e) => now - e.at < RING_MS).slice(-RING_SIZE);
  }

  heartbeat(ping: (socket: WebSocket) => void): void {
    for (const [socket, isAlive] of this.alive) {
      if (!isAlive) {
        socket.terminate();
        this.remove(socket);
        continue;
      }
      this.alive.set(socket, false);
      ping(socket);
      const timer = setTimeout(() => {
        if (!this.alive.get(socket)) {
          socket.terminate();
          this.remove(socket);
        }
      }, PONG_MS);
      timer.unref();
    }
  }

  frame<T extends ServerEvent["event"]>(
    event: T,
    data: Extract<ServerEvent, { event: T }>["data"],
  ): Extract<ServerEvent, { event: T }> {
    return { id: randomUUID(), at: new Date().toISOString(), event, data } as Extract<
      ServerEvent,
      { event: T }
    >;
  }

  private pushRing(teamId: string, frame: ServerEvent): void {
    this.ring.push({ id: frame.id, at: Date.now(), teamId, frame });
    if (this.ring.length > RING_SIZE) {
      this.ring.splice(0, this.ring.length - RING_SIZE);
    }
  }
}
