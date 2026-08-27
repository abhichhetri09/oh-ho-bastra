import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Product } from "@/data/products";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/products/${product.slug}`} className="block h-full">
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            {product.price}
          </Badge>
          <CardTitle>{product.name}</CardTitle>
          <CardDescription>{product.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
