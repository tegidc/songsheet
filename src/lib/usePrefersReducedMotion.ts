import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * True when the reader has asked the OS for less movement. Anything that
 * animates on its own — without the reader having touched it — has to respect
 * this, because they cannot stop it themselves.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return reduced;
}
