import { useLayoutEffect, useRef, useState } from "react";

/** Tracks an element's content width with a ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
