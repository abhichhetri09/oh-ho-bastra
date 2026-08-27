import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ClothPanel } from "@/components/ClothPanel";
import type { Swatch } from "@/data/products";

type Flight = {
  id: number;
  swatch: Swatch;
  from: DOMRect;
  to: DOMRect;
};

type FlyToBagValue = {
  fly: (from: DOMRect, swatch: Swatch) => void;
  bump: number;
};

const FlyToBagContext = createContext<FlyToBagValue | null>(null);

function bagRect() {
  const targets = document.querySelectorAll<HTMLElement>("[data-bag-target]");
  for (const target of Array.from(targets)) {
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return rect;
    }
  }
  return null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FlyToBagProvider({ children }: { children: ReactNode }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bump, setBump] = useState(0);
  const nextId = useRef(0);

  const fly = useCallback((from: DOMRect, swatch: Swatch) => {
    if (prefersReducedMotion()) {
      setBump((value) => value + 1);
      return;
    }
    const to = bagRect();
    if (!to) {
      return;
    }
    const id = nextId.current++;
    setFlights((current) => [...current, { id, swatch, from, to }]);
  }, []);

  const land = useCallback((id: number) => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
    setBump((value) => value + 1);
  }, []);

  return (
    <FlyToBagContext.Provider value={{ fly, bump }}>
      {children}
      {createPortal(
        flights.map((flight) => (
          <FlyingItem
            key={flight.id}
            flight={flight}
            onDone={() => land(flight.id)}
          />
        )),
        document.body,
      )}
    </FlyToBagContext.Provider>
  );
}

function FlyingItem({
  flight,
  onDone,
}: {
  flight: Flight;
  onDone: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const { from, to, swatch } = flight;
  const size = Math.min(112, from.width, from.height);
  const left = from.left + (from.width - size) / 2;
  const top = from.top + Math.min(from.height * 0.12, 48);

  useLayoutEffect(() => {
    const el = node.current;
    if (!el) {
      return;
    }
    const endX = to.left + to.width / 2 - size / 2;
    const endY = to.top + to.height / 2 - size / 2;
    const dx = endX - left;
    const dy = endY - top;
    const lift = Math.min(120, Math.abs(dy) * 0.35 + 48);
    const done = onDone;

    const animation = el.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        {
          transform: `translate(${dx * 0.42}px, ${dy * 0.28 - lift}px) scale(0.42)`,
          opacity: 1,
          offset: 0.48,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(0.12)`,
          opacity: 0.85,
        },
      ],
      {
        duration: 720,
        easing: "cubic-bezier(0.22, 0.8, 0.28, 1)",
        fill: "forwards",
      },
    );
    animation.onfinish = done;
    return () => animation.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate once on mount
  }, []);

  return (
    <div
      ref={node}
      aria-hidden
      className="pointer-events-none fixed z-[200] overflow-hidden rounded-sm shadow-lg"
      style={{ left, top, width: size, height: size }}
    >
      <ClothPanel swatch={swatch} className="h-full w-full" />
    </div>
  );
}

export function useFlyToBag() {
  const value = useContext(FlyToBagContext);
  if (!value) {
    throw new Error("useFlyToBag must be used within FlyToBagProvider");
  }
  return value;
}
