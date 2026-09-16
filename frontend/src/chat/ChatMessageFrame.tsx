import type { ReactNode } from "react";
import { UserCheck } from "lucide-react";
import type { BotId } from "@contracts/events";
import { AVATAR_FOCUS, CHARACTERS } from "@/data/characterLore";

export const CHAT_FEED = "redline-scroll flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 max-w-[860px] w-full mx-auto";

export default function ChatMessageFrame({ botId, isUser = false, children, actions }: {
  botId: BotId;
  isUser?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className={`chat-msg group relative flex shrink-0 gap-3 max-w-[92%] sm:max-w-[85%] ${isUser ? "self-end flex-row-reverse" : "self-start"}`}>
      <span className="block w-9 h-9 overflow-hidden shrink-0 border border-white/15 bg-black/60" aria-hidden="true">
        {isUser ? <span className="flex h-full w-full items-center justify-center bg-redline/20 text-redline border border-redline/40"><UserCheck className="w-4 h-4" /></span> :
          <img src={CHARACTERS[botId]?.avatar} alt="" className={`w-full h-full object-cover ${AVATAR_FOCUS[botId]}`} />}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5 max-w-full">
        <div className={`px-4 py-3 text-[14.5px] leading-relaxed relative [overflow-wrap:anywhere] ${isUser
          ? "bg-gradient-to-r from-red-700 via-red-600 to-red-700 border border-red-500/50 text-white shadow-[0_4px_24px_rgba(220,38,38,0.35)]"
          : "border border-white/12 bg-bg-1/85 backdrop-blur-md text-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.7)]"}`}>
          {children}
        </div>
        {actions}
      </div>
    </div>
  );
}
