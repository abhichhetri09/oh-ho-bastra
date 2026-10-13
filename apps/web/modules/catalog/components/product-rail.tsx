"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import type { ProductWithPrice } from "@repo/types";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";

/** A horizontal, snap-scrolling row of products with arrow controls. */
export function ProductRail({
  products,
  label,
}: {
  products: ProductWithPrice[];
  label: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  // Share of the rail scrolled past, counting the visible part (0..1).
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const { scrollLeft, clientWidth, scrollWidth } = element;
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
  }, []);

  const scroll = (direction: 1 | -1) =>
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: "smooth",
    });

  return (
    <div className="relative">
      <div
        ref={rail}
        role="region"
        aria-label={label}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 sm:-mx-6 sm:scroll-px-6 sm:gap-5 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:px-10"
      >
        {products.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            index={i}
            className="w-[68%] shrink-0 snap-start sm:w-[40%] md:w-[30%] xl:w-[23%]"
          />
        ))}
      </div>
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
    </div>
  );
}
