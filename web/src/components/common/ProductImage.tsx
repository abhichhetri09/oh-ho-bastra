import { useState } from "react";

import { ClothPanel } from "@/components/common/ClothPanel";
import type { Swatch } from "@/features/catalog/types";
import { cn } from "@/lib/utils";

/**
 * A product photo that fills its box. Falls back to the cloth swatch when there's
 * no photo or it fails to load, so layouts never collapse.
 */
export function ProductImage({
  src,
  alt,
  swatch,
  className,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  swatch?: Swatch | null;
  className?: string;
  /** Above-the-fold images load immediately; the rest lazily. */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <ClothPanel swatch={swatch} label={alt} className={className} />;
  }
  return (
    <div className={cn("relative overflow-hidden bg-secondary", className)}>
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  );
}
