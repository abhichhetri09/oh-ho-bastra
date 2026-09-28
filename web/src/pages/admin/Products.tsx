import { Link } from "react-router-dom";

import { QueryView } from "@/components/feedback/QueryView";
import { Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAdminProducts } from "@/features/admin/api";
import { AppPage } from "@/components/app-shell/AppPage";
import { Panel } from "@/components/app-shell/Panel";
import { ProductEditorRow } from "@/features/admin/components/products/ProductEditorRow";

export function Products() {
  return (
    <AppPage
      title="Products"
      description="Quick-edit price, visibility and stock here, or open a product for everything else."
      actions={
        <Button asChild>
          <Link to="/admin/products/new">
            <Plus />
            Add product
          </Link>
        </Button>
      }
    >
      <QueryView query={useAdminProducts()}>
        {(products) => (
          <Panel flush>
            <div className="divide-y px-4">
              {products.map((product) => (
                <ProductEditorRow key={product.slug} product={product} />
              ))}
            </div>
          </Panel>
        )}
      </QueryView>
    </AppPage>
  );
}
