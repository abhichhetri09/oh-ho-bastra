import { Info, Pen, Shirt, Store, type LucideIcon } from "@/components/icons";
import { useCollections } from "@/features/catalog/api";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export type ShopLink = { to: string; label: string; icon: LucideIcon; end?: boolean };

/** Shop, one link per collection (from the catalog), then About. */
export function useShopLinks(): ShopLink[] {
  const { data: collections = [] } = useCollections();
  return [
    { to: "/", label: "Shop", end: true, icon: Store },
    ...collections.map((c) => ({
      to: `/collections/${c.slug}`,
      label: c.name,
      icon: c.slug === "custom" ? Pen : Shirt,
    })),
    { to: "/about", label: "About", icon: Info },
  ];
}

export type NavVariant = "desktop" | "mobile";

export const navLinkClass =
  (variant: NavVariant) =>
  ({ isActive }: { isActive: boolean }) =>
    variant === "desktop"
      ? cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "text-white/80 hover:bg-white/10 hover:text-white",
          isActive && "bg-white/10 text-white",
        )
      : cn(
          "flex items-center gap-3 rounded-md px-3 py-3 text-base text-white/80 hover:bg-white/10 hover:text-white",
          isActive && "bg-white/10 text-white",
        );
