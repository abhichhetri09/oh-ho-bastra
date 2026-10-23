import { useNavigate } from "react-router-dom";

import { AppPage } from "@/components/app-shell/AppPage";
import { useCreateProduct } from "@/features/admin/api";
import { ProductForm } from "@/features/admin/components/products/form/ProductForm";

export function ProductNew() {
  const navigate = useNavigate();
  const create = useCreateProduct();

  return (
    <AppPage back={{ to: "/admin/products", label: "Products" }} title="Add product" description="It appears in the shop as soon as it’s saved and visible.">
      <ProductForm
        submitLabel="Create product"
        pending={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={(input) =>
          create.mutate(input, { onSuccess: ({ slug }) => void navigate(`/admin/products/${slug}`, { replace: true }) })
        }
      />
    </AppPage>
  );
}
