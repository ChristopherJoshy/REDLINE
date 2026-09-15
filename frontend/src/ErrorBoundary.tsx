import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Keep technical details out of the player-facing interface.
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return <main className="flex min-h-[100dvh] items-center justify-center bg-bg-0 px-6 text-text-1">
      <section className="w-full max-w-md border border-border-strong bg-surface-1 p-8 text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-seal" aria-hidden="true" />
        <h1 className="mt-5 font-display text-2xl font-bold">The arena lost its footing</h1>
        <p className="mt-3 text-text-2">Your progress is safe. Reload to reconnect to the event server.</p>
        <button type="button" onClick={() => window.location.reload()} className="redline-cta mt-6 inline-flex min-h-11 items-center gap-2 px-4 py-2">
          <RotateCcw size={16} aria-hidden="true" /> Reload arena
        </button>
      </section>
    </main>;
  }
}
