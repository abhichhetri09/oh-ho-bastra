import { useParams } from "react-router-dom";

import { AppPage } from "@/components/app-shell/AppPage";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryView } from "@/components/feedback/QueryView";
import { ExternalLink, Search } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useAdminProduct, useSaveProduct } from "@/features/admin/api";
import { ProductForm } from "@/features/admin/components/products/form/ProductForm";
import type { AdminProductDetail } from "@/features/admin/types";
import { formatDateTime, plural } from "@/lib/format";

export function ProductEdit() {
  const { slug } = useParams();
  // Lives above the keyed view so the "Saved" state survives the refetch after saving.
  const save = useSaveProduct(slug ?? "");
  return (
    <QueryView
      query={useAdminProduct(slug)}
      notFound={<EmptyState icon={Search} title="Product not found" description="It may have been renamed or removed." />}
    >
      {/* Keyed on updatedAt so the form resets to the saved values after each save. */}
      {(product) => <ProductEditView key={product.updatedAt} product={product} save={save} />}
    </QueryView>
  );
}

function ProductEditView({
  product,
  save,
}: {
  product: AdminProductDetail;
  save: ReturnType<typeof useSaveProduct>;
}) {
  const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);

  return (
    <AppPage
      back={{ to: "/admin/products", label: "Products" }}
      title={product.name}
      meta={product.active ? <StatusPill tone="success">Visible</StatusPill> : <StatusPill>Hidden</StatusPill>}
      description={`${plural(stock, "unit")} in stock · ${plural(product.unitsSold, "unit")} sold · updated ${formatDateTime(product.updatedAt)}`}
      actions={
        <Button variant="outline" asChild>
          <a href={`/products/${product.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink />
            View in shop
          </a>
        </Button>
      }
    >
      {save.isSuccess ? (
        <p className="rounded-lg border border-success/30 bg-success-soft px-4 py-2 text-sm text-success" role="status">
          Saved.
        </p>
      ) : null}
      <ProductForm
        initial={product}
        submitLabel="Save changes"
        pending={save.isPending}
        error={save.error?.message ?? null}
        onSubmit={(input) => save.mutate(input)}
      />
    </AppPage>
  );
}
