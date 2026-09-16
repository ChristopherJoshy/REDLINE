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
  return reduced;
}
