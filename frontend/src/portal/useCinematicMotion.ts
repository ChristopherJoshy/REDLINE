import { useEffect, useState } from "react";
import { reducedMotion } from "@/lib/motionTokens";

export function useCinematicMotion(): boolean {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  let disabled = false;
  try { disabled = localStorage.getItem("redline_r2_motion") === "0"; } catch { /* optional */ }
  return reduced || disabled;
}
