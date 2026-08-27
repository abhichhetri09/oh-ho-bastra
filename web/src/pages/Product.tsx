import { Link, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProduct } from "@/data/products";

export function Product() {
  const { slug } = useParams();
  const product = slug ? getProduct(slug) : undefined;

  if (!product) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-medium tracking-tight">Not found</h1>
        <p className="text-muted-foreground">That piece is not in the shop.</p>
        <Button variant="link" className="px-0" asChild>
          <Link to="/">Back to shop</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link to="/" className="hover:underline">
          Shop
        </Link>
        <span> / {product.name}</span>
      </p>
      <Card className="max-w-xl">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            {product.price}
          </Badge>
          <CardTitle className="text-3xl">{product.name}</CardTitle>
          <CardDescription className="text-base">
            {product.description}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button>Add to bag</Button>
        </CardFooter>
      </Card>
    </section>
  );
}
