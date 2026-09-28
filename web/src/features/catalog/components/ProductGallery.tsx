import { useState, type KeyboardEvent, type Ref } from "react";

import { ProductImage } from "@/components/common/ProductImage";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import type { Product } from "@/features/catalog/types";
import { cn } from "@/lib/utils";

/** Main photo with previous/next and a thumbnail strip. `mainRef` is where add-to-bag flies from. */
export function ProductGallery({ product, mainRef }: { product: Product; mainRef?: Ref<HTMLDivElement> }) {
  const photos = product.images;
  const [index, setIndex] = useState(0);
  const current = photos[index];
  const count = photos.length;
  const go = (next: number) => setIndex((next + count) % count);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") go(index + 1);
    if (event.key === "ArrowLeft") go(index - 1);
  }

  return (
    <div className="space-y-3">
      <div
        ref={mainRef}
        className="group relative aspect-4/5 overflow-hidden rounded-xl"
        // Arrow keys switch photos when the gallery has focus.
        tabIndex={count > 1 ? 0 : undefined}
        onKeyDown={count > 1 ? onKeyDown : undefined}
        aria-roledescription={count > 1 ? "carousel" : undefined}
        aria-label={count > 1 ? `${product.name} photos, ${index + 1} of ${count}` : undefined}
      >
        <ProductImage
          key={current?.url}
          src={current?.url}
          alt={current?.alt || product.name}
          swatch={product.swatch}
          eager
          className="absolute inset-0"
        />
        {count > 1 ? (
          <>
            {([
              ["Previous photo", -1, ChevronLeft, "left-3"],
              ["Next photo", 1, ChevronRight, "right-3"],
            ] as const).map(([label, step, Icon, side]) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                onClick={() => go(index + step)}
                className={cn(
                  "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 shadow-sm backdrop-blur transition-opacity hover:bg-background sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                  side,
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            ))}
            <span className="absolute right-3 bottom-3 rounded-full bg-background/85 px-2 py-0.5 text-xs tabular-nums backdrop-blur">
              {index + 1} / {count}
            </span>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {photos.map((photo, i) => (
            <button
              key={photo.url}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "overflow-hidden rounded-md ring-offset-2 ring-offset-background transition",
                i === index ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100",
              )}
            >
              <ProductImage src={photo.url} alt="" className="aspect-4/5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
