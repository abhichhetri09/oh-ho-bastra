"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "motion/react";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PhotoViewer } from "./photo-viewer";

/**
 * Desktop: a thumbnail rail beside a large image that crossfades between
 * photos and zooms under the cursor. Mobile: a swipeable scroll-snap strip
 * with position dots. Clicking or tapping a photo opens it full screen. A
 * new image set (another variant) starts at photo 1.
 */
const SIZES = "(min-width: 1024px) 50vw, 100vw";

export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];
  // The full-screen viewer, and the photo it opens on.
  const [viewer, setViewer] = useState<number | null>(null);
  const key = images.join("|");

  // Reset to the first photo when the image set changes. Adjusting state
  // during render (instead of an effect) avoids a flash of the old index.
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setIndex(0);
  }

  return (
    // The thumbnail rail only renders for two or more photos; without it, a
    // two-column grid would put the main image in the 4.5rem rail column.
    <div
      className={cn(
        "lg:grid lg:gap-4",
        images.length > 1 && "lg:grid-cols-[4.5rem_1fr]",
      )}
    >
      {/* Thumbnails (desktop) */}
      {images.length > 1 && (
        <ul
          className="hidden flex-col gap-3 lg:flex"
          aria-label="Product photos"
        >
          {images.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                onMouseEnter={() => setIndex(i)}
                aria-label={`Show photo ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className="relative block aspect-[4/5] w-full overflow-hidden rounded-media bg-surface opacity-55 transition-opacity duration-300 hover:opacity-100 aria-[current=true]:opacity-100"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="72px"
                  // Lazy, though the first shares its src with the main image:
                  // Next's dev LCP check matches by src and may then warn
                  // (a false positive). Eager would preload a hidden file.
                  className="object-cover"
                />
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-foreground transition-transform duration-500 ease-out-expo",
                    i === index ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Main image (desktop) */}
      {current && (
        <ZoomImage
          src={current}
          alt={alt}
          onOpen={() => setViewer(Math.min(index, images.length - 1))}
        />
      )}

      {/* Swipe strip (mobile) */}
      <MobileStrip key={key} images={images} alt={alt} onOpen={setViewer} />

      <PhotoViewer
        images={images}
        alt={alt}
        open={viewer !== null}
        start={viewer ?? 0}
        onOpenChange={(open) => !open && setViewer(null)}
      />
    </div>
  );
}

function ZoomImage({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: () => void;
}) {
  const [zoom, setZoom] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${alt} photos full screen`}
      className="relative hidden aspect-[4/5] w-full cursor-zoom-in overflow-hidden rounded-media bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring lg:block"
      onMouseEnter={() => setZoom(true)}
      onMouseLeave={() => setZoom(false)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        // A CSS variable, not state: no re-render per mouse move.
        e.currentTarget.style.setProperty(
          "--zoom-origin",
          `${x.toFixed(1)}% ${y.toFixed(1)}%`,
        );
      }}
    >
      <AnimatePresence initial={false}>
        <m.div
          key={src}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes={SIZES}
            // The page's largest image on desktop: no lazy loading (the
            // mobile strip's preload already fetched this same file).
            loading="eager"
            fetchPriority="high"
            className="object-cover transition-transform duration-500 ease-out-expo"
            style={{
              transformOrigin: "var(--zoom-origin, 50% 50%)",
              transform: zoom ? "scale(1.75)" : "scale(1)",
            }}
          />
        </m.div>
      </AnimatePresence>
    </button>
  );
}

function MobileStrip({
  images,
  alt,
  onOpen,
}: {
  images: string[];
  alt: string;
  onOpen: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const onScroll = () =>
      setActive(
        Math.round(element.scrollLeft / Math.max(element.clientWidth, 1)),
      );
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:hidden">
      <div
        ref={strip}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        aria-label="Product photos"
      >
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`View photo ${i + 1} of ${images.length} full screen`}
            className="relative aspect-[4/5] w-full shrink-0 snap-center overflow-hidden rounded-media bg-surface"
          >
            <Image
              src={src}
              alt={i === 0 ? alt : ""}
              fill
              // Same sizes as the desktop image, so both resolve to one
              // download; preloaded once here.
              preload={i === 0}
              loading={i === 0 ? "eager" : "lazy"}
              sizes={SIZES}
              className="object-cover"
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center">
          {images.map((src, i) => (
            // A 24px tap target around each small dot.
            <button
              key={src}
              type="button"
              onClick={() =>
                strip.current?.scrollTo({
                  left: i * strip.current.clientWidth,
                  behavior: "smooth",
                })
              }
              aria-label={`Show photo ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className="flex h-6 items-center px-[3px]"
            >
              <span
                className={cn(
                  "h-1 rounded-full bg-foreground/80 transition-all duration-500 ease-out-expo",
                  i === active ? "w-5" : "w-1 bg-foreground/35",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
