import { useQuery } from "@tanstack/react-query";

import { getJson, retryUnlessClientError as retry } from "@/lib/http";
import type { Collection, Product } from "./types";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => getJson<Product[]>("/products"),
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ["products", slug],
    queryFn: () => getJson<Product & { related: Product[] }>(`/products/${slug}`),
    enabled: Boolean(slug),
    retry,
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: () => getJson<Collection[]>("/collections"),
  });
}

export function useCollection(slug: string | undefined) {
  return useQuery({
    queryKey: ["collections", slug],
    queryFn: () =>
      getJson<Collection & { products: Product[] }>(`/collections/${slug}`),
    enabled: Boolean(slug),
    retry,
  });
}

/** Looks up one collection's display data from the cached list. */
export function useCollectionInfo(slug: string | undefined) {
  const { data } = useCollections();
  return data?.find((collection) => collection.slug === slug);
}
