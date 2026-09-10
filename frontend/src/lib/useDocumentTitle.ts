import { useEffect } from "react";

// Tab title follows the visible view. Restores the previous title on unmount
// so nested screens (roster <-> comms, arena <-> vault) hand it back cleanly.
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
