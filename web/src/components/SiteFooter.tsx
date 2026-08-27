import { Link } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { Bag, Mail } from "@/components/icons";
import { collections } from "@/data/collections";

export function SiteFooter() {
  return (
    <footer className="bg-black px-6 py-14 text-sm text-white/60 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 sm:flex-row sm:justify-between">
        <div className="max-w-xs space-y-4">
          <Logo mark className="h-9" />
          <p className="font-serif text-xl font-medium text-white">
            Tees and custom prints.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-12">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white">
              Shop
            </p>
            {collections.map((collection) => (
              <Link
                key={collection.slug}
                to={`/collections/${collection.slug}`}
                className="block hover:text-white"
              >
                {collection.name}
              </Link>
            ))}
          </div>
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white">
              The shop
            </p>
            <Link to="/about" className="block hover:text-white">
              About
            </Link>
            <Link to="/contact" className="flex items-center gap-2 hover:text-white">
              <Mail className="size-3.5" strokeWidth={1.5} aria-hidden />
              Contact
            </Link>
            <Link to="/cart" className="flex items-center gap-2 hover:text-white">
              <Bag className="size-3.5" strokeWidth={1.5} aria-hidden />
              Bag
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
