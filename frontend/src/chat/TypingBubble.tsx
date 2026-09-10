export default function TypingBubble(): React.JSX.Element {
  return (
    <div aria-label="Bot is typing" className="flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-3)]"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
