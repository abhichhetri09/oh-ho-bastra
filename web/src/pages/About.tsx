import { Link } from "react-router-dom";

import { ClothPanel } from "@/components/ClothPanel";
import { Shirt } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { products } from "@/data/products";

export function About() {
  return (
    <PageShell>
      <section className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className="space-y-8">
          <PageHeader
            kicker="About"
            title="Oh Ho Bastra"
            description="We make t-shirts. A few colors on the rack, and custom prints when you want your own."
          />
          <div className="max-w-xl space-y-4 leading-relaxed text-muted-foreground">
            <p>
              Heavyweight cotton, regular and boxy cuts. No extra SKUs — tees,
              and the ones we print for you.
            </p>
            <p>
              Custom is the same tee with your art or a line of type. Send the
              file or the words after you order.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/#shop">
              <Shirt />
              Shop tees
            </Link>
          </Button>
        </div>
        <ClothPanel
          swatch={products[0].swatch}
          className="aspect-4/5"
          label="Black tee"
        />
      </section>
    </PageShell>
  );
}
