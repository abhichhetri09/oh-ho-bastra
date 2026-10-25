"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import type { ProductWithPrice } from "@repo/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

/** How far (px) a press must move before it counts as a drag, not a click. */
const DRAG_THRESHOLD = 6;

/**
 * A horizontal, snap-scrolling row of products. It scrolls by touch,
 * trackpad, mouse drag, the arrow buttons and the keyboard's arrow keys.
 * Cards are sized so the next one peeks in at the edge, and the controls
 * hide when every card already fits.
 */
export function ProductRail({
  products,
  label,
}: {
  products: ProductWithPrice[];
  label: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [overflows, setOverflows] = useState(true);
  // Share of the rail scrolled past, counting the visible part (0..1).
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, scrollLeft: 0, moved: false, pointer: -1 });

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const { scrollLeft, clientWidth, scrollWidth } = element;
      setOverflows(scrollWidth > clientWidth + 4);
      setEdges({
        start: scrollLeft <= 4,
        end: scrollLeft + clientWidth >= scrollWidth - 4,
      });
      setProgress(
        scrollWidth > 0
          ? Math.min(1, (scrollLeft + clientWidth) / scrollWidth)
          : 1,
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [products.length]);

  const scroll = (direction: 1 | -1) =>
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: "smooth",
    });

  // Mouse drag; touch and pens already scroll natively.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !rail.current) return;
    drag.current = {
      x: e.clientX,
      scrollLeft: rail.current.scrollLeft,
      moved: false,
      pointer: e.pointerId,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const element = rail.current;
    const d = drag.current;
    if (!element || d.pointer !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      d.moved = true;
      setDragging(true);
      element.setPointerCapture(e.pointerId);
    }
    element.scrollLeft = d.scrollLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const element = rail.current;
    if (!element || drag.current.pointer !== e.pointerId) return;
    drag.current.pointer = -1;
    if (element.hasPointerCapture(e.pointerId)) {
      element.releasePointerCapture(e.pointerId);
    }
    if (drag.current.moved) {
      setDragging(false);
      // Let snapping pick the nearest card from where the drag let go.
      const [first, second] = element.children as unknown as HTMLElement[];
      const step =
        first && second
          ? second.offsetLeft - first.offsetLeft
          : element.clientWidth;
      const nearest = Math.round(element.scrollLeft / step) * step;
      element.scrollTo({ left: nearest, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      <div
        ref={rail}
        role="region"
        aria-label={label}
        aria-roledescription="carousel"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            scroll(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            scroll(-1);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // A drag that ends over a card must not open it.
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
            drag.current.moved = false;
          }
        }}
        onDragStart={(e) => e.preventDefault()}
        className={cn(
          "no-scrollbar -mx-4 flex scroll-px-4 gap-3 overflow-x-auto px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:-mx-6 sm:scroll-px-6 sm:gap-5 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:px-10",
          overflows && "cursor-grab",
          dragging
            ? "cursor-grabbing snap-none select-none"
            : "snap-x snap-mandatory",
        )}
      >
        {products.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            index={i}
            className="w-[72%] shrink-0 snap-start sm:w-[42%] md:w-[31%] xl:w-[27%]"
          />
        ))}
      </div>
      {overflows && (
        <div className="mt-8 flex items-center gap-6">
          <div className="relative h-px flex-1 bg-border" aria-hidden>
            <div
              className="absolute inset-y-0 left-0 bg-foreground transition-[width] duration-300"
              style={{ width: `${Math.max(progress, 0.08) * 100}%` }}
            />
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll(-1)}
              disabled={edges.start}
              aria-label={`Scroll ${label} back`}
            >
              <ArrowLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => scroll(1)}
              disabled={edges.end}
              aria-label={`Scroll ${label} forward`}
            >
              <ArrowRightIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
