import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Touch-first or hybrid devices: show Move control and mobile-first copy. */
export function usePreferTouchMoveControls(): boolean {
  const coarse = useMediaQuery("(pointer: coarse)");
  const noHover = useMediaQuery("(hover: none)");
  const touch =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  return coarse || noHover || touch;
}
