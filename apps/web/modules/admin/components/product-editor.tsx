"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminDeleteProduct } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminProduct } from "../queries";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { AdminPageHeader } from "./page-header";
import { ProductForm } from "./product-form";
import { ActiveBadge } from "./status-badge";
import { VariantsPanel } from "./variants-panel";

export function BackToProducts() {
  return (
    <Link
      href="/admin/products"
      className="group mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
      Products
    </Link>
  );
}

/** The edit page: the product's fields, then its variants. */
export function ProductEditor({ productId }: { productId: string }) {
  const router = useRouter();
  const product = useAdminProduct(productId);
  const [confirming, setConfirming] = useState(false);

  const remove = useAdminMutation({
    mutationFn: async () => {
      await adminDeleteProduct({
        path: { productID: productId },
        throwOnError: true,
      });
    },
    success: "Product deleted",
    failure: "Couldn't delete the product.",
    // Not the product itself: refetching it while the page is still up
    // would flash "doesn't exist" on the way out.
    invalidate: [
      adminKeys.productLists(),
      adminKeys.stats(),
      adminKeys.inventory(),
      adminKeys.counts(),
    ],
    onSuccess: () => router.replace("/admin/products"),
  });

  if (product.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading the product">
        <BackToProducts />
        <Skeleton className="mb-8 h-14 w-80 max-w-full" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (product.isError) {
    const code = getApiError(product.error)?.code;
    const missing =
      code === "PRODUCT_NOT_FOUND" || code === "INVALID_PRODUCT_ID";
    return (
      <div>
        <BackToProducts />
        <h1 className="display text-4xl">
          {missing
            ? "This product doesn't exist."
            : "The product couldn't load."}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {missing
            ? "It may have been deleted."
            : "Check your connection and try again."}
        </p>
        {!missing && (
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => product.refetch()}
          >
            Try again
          </Button>
        )}
      </div>
    );
  }

  const p = product.data;
  const images = p.images.map((url, i) => ({
    url,
    public_id: p.image_public_ids[i] ?? "",
  }));

  return (
    <div>
      <BackToProducts />
      <AdminPageHeader
        eyebrow="Edit product"
        title={p.name}
        description={
          <span className="inline-flex items-center gap-3">
            <ActiveBadge active={p.is_active} />
            <span className="font-mono text-[0.625rem]">{p.slug}</span>
          </span>
        }
        actions={
          <>
            {p.is_active && (
              <a
                href={`/products/${p.slug}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <ArrowSquareOutIcon data-icon="inline-start" />
                View
              </a>
            )}
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        {/* Keyed by id: another product starts from its own values. */}
        <ProductForm key={p.id} product={p} />
        <VariantsPanel productId={p.id} productImages={images} />
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this product?"
        description={
          <>
            <span className="text-foreground">{p.name}</span>, its variants,
            images and reviews are removed for good. Orders keep their own copy.
            To take it off the store for now, switch off Active instead.
          </>
        }
        confirmLabel="Delete product"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </div>
  );
}
