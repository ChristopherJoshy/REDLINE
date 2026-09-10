import { useState } from "react";
import type { BotId, InventoryDelta } from "@contracts/events";
import { Button } from "@/components/ui/button";
import TypingBubble from "@/chat/TypingBubble";
import { useBotStream } from "@/chat/useBotStream";
import { unlockAudio } from "@/chat/sound";
import { submitItem } from "@/api/merchant";

const ROSTER: Array<{ id: BotId; label: string }> = [
  { id: "wick", label: "Noir Suit" },
  { id: "spidey", label: "Skyline Swinger" },
  { id: "escanor", label: "Lion Tavernkeep" },
  { id: "stark", label: "Workshop Wit" },
  { id: "joker", label: "Painted Grin" },
  { id: "light", label: "Tactician" },
  { id: "levi", label: "Captain" },
  { id: "deadpool", label: "Merc" },
];

const CHIP: Record<InventoryDelta["status"], string> = {
  locked: "border-[var(--color-border-strong)] text-[var(--color-text-3)]",
  obtained: "border-[var(--color-warn)] text-[var(--color-warn)]",
  submitted: "border-[var(--color-info)] text-[var(--color-info)]",
  verified: "border-[var(--color-verified)] text-[var(--color-verified)]",
};

interface PanelsProps {
  inventory: InventoryDelta[];
  offer: string;
  setOffer: (v: string) => void;
  submitOffer: (e: React.FormEvent) => void;
  merchantLine: string;
  wasTroll: boolean;
  trollKey: number;
  eloFlash: string;
}

function ArenaPanels(props: PanelsProps): React.JSX.Element {
  const { inventory, offer, setOffer, submitOffer, merchantLine, wasTroll, trollKey, eloFlash } = props;
  return (
    <>
      <section>
        <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">Inventory</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 min-[480px]:grid-cols-4 min-[900px]:grid-cols-8 lg:grid-cols-2">
          {ROSTER.map((b) => {
            const item = inventory.find((i) => i.botId === b.id);
            const status = item?.status ?? "locked";
            return (
              <li
                key={b.id}
                className={`rounded-md border px-2 py-1.5 text-[12px] ${CHIP[status]}`}
                title={item?.itemKey ?? "Not yet obtained"}
              >
                {status === "verified" ? "✓ " : ""}{b.label} · {status}
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-text-3)]">Merchant</h2>
        <form onSubmit={submitOffer} className="mt-2 flex flex-col gap-2">
          <input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            aria-label="Item to sell"
            placeholder="Lay it on the counter…"
            className="min-h-[44px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 text-[16px] text-[var(--color-text-1)]"
          />
          <Button type="submit" variant="info" disabled={offer.trim() === ""}>
            Take item to merchant
          </Button>
        </form>
        {merchantLine !== "" && (
          <p key={trollKey} className={`mt-2 rounded-md border border-transparent bg-[var(--color-surface-2)] px-3 py-2 text-[14px] italic text-[var(--color-text-2)]${wasTroll ? " animate-troll" : ""}`}>
            “{merchantLine}”
          </p>
        )}
        {eloFlash !== "" && (
          <p className="mt-1 font-[family-name:var(--font-code)] text-[14px] text-[var(--color-verified)]">{eloFlash}</p>
        )}
      </section>
    </>
  );
}

export default function ArenaScreen({ teamId, locked }: { teamId: string; locked: boolean }): React.JSX.Element {
  const { bots, inventory, send } = useBotStream(teamId);
  const [active, setActive] = useState<BotId>("wick");
  const [draft, setDraft] = useState("");
  const [offer, setOffer] = useState("");
  const [merchantLine, setMerchantLine] = useState("");
  const [eloFlash, setEloFlash] = useState("");
  const [trollKey, setTrollKey] = useState(0);
  const [wasTroll, setWasTroll] = useState(false);
  const [sheet, setSheet] = useState(false);
  const state = bots[active];
  const panels: PanelsProps = {
    inventory,
    offer,
    setOffer,
    submitOffer,
    merchantLine,
    wasTroll,
    trollKey,
    eloFlash,
  };

  function submitChat(e: React.FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || !locked) {
      return;
    }
    unlockAudio();
    send(active, text);
    setDraft("");
  }

  async function submitOffer(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const text = offer.trim();
    if (text === "") {
      return;
    }
    unlockAudio();
    setOffer("");
    setEloFlash("");
    try {
      const res = await submitItem(text);
      if (res.result === "verified") {
        setMerchantLine(res.already === true ? "Already logged, friend. It is yours." : "Genuine article. Logged and sealed.");
        setEloFlash(res.eloDelta === undefined ? "" : `+${res.eloDelta} ELO`);
        setWasTroll(false);
      } else {
        setMerchantLine(res.line);
        setTrollKey((k) => k + 1);
        setWasTroll(true);
      }
    } catch {
      setMerchantLine("The merchant squints and says nothing.");
      setWasTroll(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
      <section className="flex min-h-0 flex-col">
        <nav aria-label="Bots" className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] p-2">
          {ROSTER.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActive(b.id)}
              aria-pressed={active === b.id}
              className={`min-h-[44px] shrink-0 rounded-md px-3 text-[14px] ${
                active === b.id
                  ? "bg-[var(--color-redline-dim)] text-[var(--color-text-1)]"
                  : "text-[var(--color-text-3)]"
              }`}
            >
              {b.label}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[var(--space)]" aria-live="polite">
          {state.messages.map((m, i) => (
            <p
              key={i}
              className={`max-w-[65ch] rounded-lg px-4 py-2 text-[16px] leading-[1.6] ${
                m.role === "user"
                  ? "self-end bg-[var(--color-surface-3)] text-[var(--color-text-1)]"
                  : "self-start bg-[var(--color-surface-2)] text-[var(--color-text-2)]"
              }`}
            >
              {m.text}
            </p>
          ))}
          {state.typing && state.streaming === "" && (
            <div className="self-start">
              <TypingBubble />
            </div>
          )}
          {state.streaming !== "" && (
            <p className="max-w-[65ch] self-start rounded-lg bg-[var(--color-surface-2)] px-4 py-2 text-[16px] leading-[1.6] text-[var(--color-text-2)]">
              {state.streaming}
            </p>
          )}
        </div>
        <form onSubmit={submitChat} className="flex gap-2 border-t border-[var(--color-border)] p-[var(--space)]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!locked}
            placeholder={locked ? "Work the mark…" : "Resume fullscreen to chat"}
            aria-label="Chat message"
            className="min-h-[44px] flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-4 text-[16px] text-[var(--color-text-1)] disabled:opacity-50"
          />
          <Button type="submit" disabled={!locked || draft.trim() === ""}>
            Send
          </Button>
        </form>
        <div className="border-t border-[var(--color-border)] p-2 lg:hidden">
          <Button variant="ghost" className="w-full" onClick={() => setSheet(true)}>
            Inventory · Merchant
          </Button>
        </div>
      </section>
      <aside className="flex-col gap-4 border-l border-[var(--color-border)] p-[var(--space)] max-lg:hidden lg:flex" aria-label="Inventory and merchant">
        <ArenaPanels {...panels} />
      </aside>
      {sheet && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Inventory and merchant">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSheet(false)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[72dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-[var(--color-border-strong)] bg-[var(--color-bg-1)] p-[var(--space)] pb-[max(var(--space),env(safe-area-inset-bottom))]">
            <div className="mx-auto h-1 w-12 rounded-full bg-[var(--color-border-strong)]" aria-hidden="true" />
            <ArenaPanels {...panels} />
            <Button variant="ghost" onClick={() => setSheet(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
