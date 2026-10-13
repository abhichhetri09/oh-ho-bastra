"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Product photos full screen: swipe or use the arrows (buttons or keys)
 * between them, click or tap one to zoom in where you tapped (pinch works
 * too), Esc to close. Opens on `start`.
 */
export function PhotoViewer({
  images,
  alt,
  open,
  start,
  onOpenChange,
}: {
  images: string[];
  alt: string;
  open: boolean;
  start: number;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col outline-none transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0">
          {open && <Viewer images={images} alt={alt} start={start} />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Viewer({
  images,
  alt,
  start,
}: {
  images: string[];
  alt: string;
  start: number;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  // Zoomed photo and where it was tapped, as a transform origin.
  const [zoom, setZoom] = useState<{ index: number; origin: string } | null>(
    null,
  );

  const go = useCallback(
    (next: number, smooth = true) => {
      const element = strip.current;
      const clamped = Math.max(0, Math.min(images.length - 1, next));
      element?.scrollTo({
        left: clamped * element.clientWidth,
        behavior: smooth ? "smooth" : "instant",
      });
    },
    [images.length],
  );

  // Open on the photo that was clicked.
  useEffect(() => {
    go(start, false);
  }, [go, start]);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const onScroll = () => {
      const next = Math.round(
        element.scrollLeft / Math.max(element.clientWidth, 1),
      );
      setIndex(next);
      setZoom((z) => (z && z.index !== next ? null : z));
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
        else return;
        e.preventDefault();
      }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <DialogPrimitive.Title className="eyebrow">
          {alt}
          <span className="sr-only">, photos</span>
        </DialogPrimitive.Title>
        <div className="flex items-center gap-3">
          <p
            className="font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            <span className="sr-only">Photo </span>
            {index + 1}
            <span aria-hidden> / </span>
            <span className="sr-only"> of </span>
            {images.length}
          </p>
          <DialogPrimitive.Close
            render={<Button variant="ghost" size="icon" />}
            aria-label="Close photos"
          >
            <XIcon />
          </DialogPrimitive.Close>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={strip}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [touch-action:pan-x_pinch-zoom]"
        >
          {images.map((src, i) => {
            const zoomed = zoom?.index === i;
            return (
              <div
                key={src}
                className="relative h-full w-full shrink-0 snap-center overflow-hidden"
              >
                <button
                  type="button"
                  className={cn(
                    "relative block h-full w-full",
                    zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
                  )}
                  aria-label={zoomed ? "Zoom out" : "Zoom in"}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setZoom(
                      zoomed
                        ? null
                        : {
                            index: i,
                            origin: `${x.toFixed(1)}% ${y.toFixed(1)}%`,
                          },
                    );
                  }}
                >
                  <Image
                    src={src}
                    alt={i === index ? alt : ""}
                    fill
                    sizes="100vw"
                    loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"}
                    className="object-contain transition-transform duration-500 ease-out-expo"
                    style={{
                      transformOrigin: zoomed ? zoom.origin : "50% 50%",
                      transform: zoomed ? "scale(2.25)" : "scale(1)",
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {images.length > 1 && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-1/2 left-4 hidden -translate-y-1/2 bg-background/80 sm:flex"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
            >
              <CaretLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute top-1/2 right-4 hidden -translate-y-1/2 bg-background/80 sm:flex"
              onClick={() => go(index + 1)}
              disabled={index === images.length - 1}
              aria-label="Next photo"
            >
              <CaretRightIcon />
            </Button>
          </>
        )}
      </div>
      <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
    </div>
  );
}
