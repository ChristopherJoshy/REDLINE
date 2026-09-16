import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./src/index.css";
import GachaReveal from "./src/portal/GachaReveal";
import PortalTransition from "./src/portal/PortalTransition";
import BossCutscene from "./src/portal/BossCutscene";
import RoundTwoScreen from "./src/screens/RoundTwoScreen";
const query = new URLSearchParams(location.search);
const boss = query.get("boss") === "aizen" ? "aizen" : "itachi";
let phase = "p1";
let sockets: any[] = [];
let items: any[] = [];
function emit(event: string, data: unknown) { for (const socket of sockets) socket.onmessage?.({data: JSON.stringify({id: crypto.randomUUID(), at: new Date().toISOString(), event, data})}); }
class Socket {
  static OPEN = 1; readyState = 1; onmessage: any; onopen: any;
  constructor() { sockets.push(this); setTimeout(() => this.onopen?.(), 30); }
  close() { sockets = sockets.filter(s => s !== this); }
  send(raw: string) {
    const frame = JSON.parse(raw);
    if (frame.event === "hello") emit("inventory_sync", {items, credits: 100});
    if (frame.event === "chat_send") { emit("bot_typing", {botId: boss, typing: true}); setTimeout(() => {emit("bot_done", {botId: boss, fullText: "You have my attention. What truth are you looking for?", typing: false});}, 800); }
  }
}
window.WebSocket = Socket as any;
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const path = String(input);
  if (!path.includes("/api/")) return originalFetch(input, init);
  let data: unknown = {};
  if (path.includes("/profile?")) data = {profile: {alias: "QA", bot_id: boss}};
  if (path.includes("/round2/state")) data = {boss, phase};
  if (path.includes("/chat/history")) data = {history: {[boss]: [{id: 1, role: "bot", text: "Look closely. Not everything in this vault is what it seems."}, {id: 2, role: "user", text: "Then let’s talk about what is real."}]}};
  if (path.includes("/submit")) {items = [{botId: boss, itemKey: "qa-relic", status: "verified"}]; emit("inventory_sync", {items, credits: 200}); data = {result: "verified"};}
  return new Response(JSON.stringify(data), {headers: {"Content-Type": "application/json"}});
};
function QA() {
 const [view, setView] = useState(query.get("view") ?? "gacha");
 return <div className="flex h-dvh flex-col"><div className="flex shrink-0 gap-2 bg-bg-0 p-2"><button onClick={() => {phase="p2";}}>QA Break illusion</button><button onClick={() => {items=[{botId: boss, itemKey:"qa-relic",status:"obtained"}];emit("inventory_sync",{items,credits:100});}}>QA Relic</button></div>{view === "gacha" ? <GachaReveal boss={boss} onDone={() => setView("portal")} /> : view === "portal" ? <PortalTransition onDone={() => setView("chat")} /> : view === "phase" || view === "victory" ? <BossCutscene boss={boss} scene={view} onDone={() => setView("chat")} /> : <RoundTwoScreen teamId="qa" boss={boss} locked />}</div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><QA /></React.StrictMode>);
