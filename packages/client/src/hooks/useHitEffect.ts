import { useEffect, useRef, useState } from "react";
/** Presentation-only reaction to a server HP update. Never changes HP. */
export function useHitEffect(hp: number) {
  const previous = useRef(hp);
  const [hit, setHit] = useState<{ amount: number; key: number } | null>(null);
  useEffect(() => {
    if (hp < previous.current)
      setHit({ amount: previous.current - hp, key: Date.now() });
    previous.current = hp;
  }, [hp]);
  useEffect(() => {
    if (!hit) return;
    const timer = setTimeout(() => setHit(null), 1800);
    return () => clearTimeout(timer);
  }, [hit]);
  return hit;
}
