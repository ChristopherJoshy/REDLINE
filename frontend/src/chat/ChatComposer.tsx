import type { FormEvent } from "react";
import { Send } from "lucide-react";

export default function ChatComposer({ draft, onDraft, onSubmit, disabled, name }: {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
  name: string;
}): React.JSX.Element {
  return (
    <form onSubmit={onSubmit} className="relative shrink-0 border-t border-white/10 bg-bg-0/90 p-3 sm:p-4 backdrop-blur-md z-20">
      <div aria-hidden="true" className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-redline/60 to-transparent" />
      <div className="mx-auto flex items-center gap-3 max-w-[860px] w-full">
        <textarea
          aria-label={`Message to ${name}`}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={disabled}
          placeholder={disabled ? "Transmission paused" : `Write to ${name}…`}
          rows={1}
          className="min-w-0 flex-1 min-h-[50px] max-h-32 resize-y border border-white/15 bg-black/80 px-4 py-3 text-[14.5px] leading-6 text-white placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-redline focus-visible:outline-offset-2 font-mono disabled:opacity-50"
        />
        <button type="submit" disabled={disabled || draft.trim() === ""} className="relative flex min-h-[50px] px-4 sm:px-6 items-center justify-center gap-2 bg-redline text-white font-mono text-[13px] font-bold tracking-[0.15em] uppercase hover:bg-redline-soft disabled:opacity-40 motion-safe:transition-transform motion-safe:active:scale-[0.98] shrink-0 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2">
          <span className="hidden sm:inline">Transmit</span><Send className="w-4 h-4" aria-hidden="true" /><span className="sr-only sm:hidden">Transmit</span>
        </button>
      </div>
    </form>
  );
}
