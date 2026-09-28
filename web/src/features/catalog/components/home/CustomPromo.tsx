import { Link } from "react-router-dom";

import { ProductImage } from "@/components/common/ProductImage";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Collection } from "@/features/catalog/types";
import { HomeSection } from "./HomeSection";

export function CustomPromo({ collection }: { collection: Collection | undefined }) {
  return (
    <HomeSection className="py-20 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <ProductImage src={collection?.imageUrl} alt="A custom printed tee" swatch={collection?.swatch} className="aspect-5/4 rounded-xl" />
        <div className="max-w-md">
          <Eyebrow wide>Custom</Eyebrow>
          <h2 className="mt-4 font-serif text-4xl font-medium tracking-tight md:text-5xl">
            Your art, or a line of type.
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            Same cotton tees. We print after you order — a file, a name, a short mark. Write us if
            you need a run for a group.
          </p>
          <Button className="mt-8" variant="outline" asChild>
            <Link to="/collections/custom">
              See custom tees
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </HomeSection>
  );
}
