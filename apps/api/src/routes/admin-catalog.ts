import { adminProductRoutes } from "../catalog-admin/products";
import { adminSaleRoutes } from "../catalog-admin/sale";
import { adminVariantRoutes } from "../catalog-admin/variants";
import type { Deps } from "../deps";
import { requireAuth, requireRole } from "../http/middleware";
import { ok } from "../http/response";
import type { Group } from "../http/router";
import { PRODUCT_FOLDER } from "../services/cloudinary";

// The admin catalog: products (internal/handlers/product/admin), their
// variants (internal/handlers/variant/admin), mass sales and signed image
// uploads (SignUpload in internal/handlers/admin/dashboard.go). All
// admin-only.

export function adminCatalogRoutes(api: Group, deps: Deps) {
  const { cfg, cloudinary } = deps;
  const adminOnly = [requireAuth(cfg), requireRole("admin")];

  adminProductRoutes(api.group("/admin/products", ...adminOnly), deps);
  adminSaleRoutes(api.group("/admin/products/sale", ...adminOnly), deps);
  adminVariantRoutes(
    api.group("/admin/products/:productID/variants", ...adminOnly),
    deps,
  );

  /**
   * A signature for one direct browser upload to Cloudinary (valid for an
   * hour), so image bytes never pass through us.
   */
  api.group("/admin", ...adminOnly).post("/uploads/signature", (_req, res) => {
    const sig = cloudinary.signUpload(
      PRODUCT_FOLDER,
      Math.floor(Date.now() / 1000),
    );
    ok(res, 200, "Upload signed", sig);
  });
}
