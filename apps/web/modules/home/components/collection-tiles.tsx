import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import type { Collection } from "@/modules/catalog/api";
import { cn } from "@/lib/utils";

/** Root categories as tall photo tiles; the first one spans wider. */
type Shape = "feature" | "tile" | "wide";

/**
 * Desktop layout: the first collection is a tall feature on the left, the
 * rest fill two rows of tiles beside it; a last odd tile goes wide so the
 * grid has no hole.
 */
function shapeOf(index: number, count: number): Shape {
  if (index === 0) return "feature";
  const lastOdd = (count - 1) % 2 === 1 && index === count - 1;
  return lastOdd ? "wide" : "tile";
}

export function CollectionTiles({
  collections,
}: {
  collections: Collection[];
}) {
  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-12">
      {collections.map((collection, i) => {
        const shape = shapeOf(i, collections.length);
        return (
          <StaggerItem
            key={collection.slug}
            className={cn(
              shape === "feature" && "lg:col-span-6 lg:row-span-2",
              shape === "tile" && "lg:col-span-3",
              shape === "wide" && "lg:col-span-6",
            )}
          >
            <Link
              href={`/categories/${collection.slug}`}
              className="group relative block h-full overflow-hidden rounded-media bg-surface"
            >
              <div
                className={cn(
                  "relative aspect-[4/5] h-full w-full",
                  shape === "feature" && "lg:aspect-auto lg:min-h-full",
                  shape === "wide" && "lg:aspect-[8/5]",
                )}
              >
                {collection.image && (
                  <Image
                    src={collection.image}
                    alt=""
                    fill
                    sizes={
                      shape !== "tile"
                        ? "(min-width: 1024px) 50vw, 100vw"
                        : "(min-width: 1024px) 25vw, 50vw"
                    }
                    className="object-cover transition-transform duration-[1600ms] ease-out-expo group-hover:scale-[1.06]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.15_0.01_60/0.6)] via-transparent to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-[oklch(0.98_0.005_85)] sm:p-6">
                <div>
                  <p className="font-mono text-[0.6875rem] tracking-[0.16em] uppercase opacity-80">
                    {collection.total}{" "}
                    {collection.total === 1 ? "piece" : "pieces"}
                  </p>
                  <h3
                    className={cn(
                      "font-serif leading-none",
                      shape === "feature" ? "text-5xl sm:text-6xl" : "text-4xl",
                    )}
                  >
                    {collection.name}
                  </h3>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-current/40 transition-all duration-500 ease-out-expo group-hover:rotate-45 group-hover:bg-[oklch(0.98_0.005_85)] group-hover:text-[oklch(0.2_0.012_60)]">
                  <ArrowUpRightIcon className="size-4" />
                </span>
              </div>
            </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
