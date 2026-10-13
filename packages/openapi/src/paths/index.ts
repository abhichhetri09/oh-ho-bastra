import { registerAdminPaths } from "./admin.ts";
import { registerAuthPaths } from "./auth.ts";
import { registerCartPaths } from "./carts.ts";
import { registerCategoryPaths } from "./categories.ts";
import { registerCheckoutPaths } from "./checkout.ts";
import { registerHealthPaths } from "./health.ts";
import { registerProductPaths } from "./products.ts";
import { registerReviewPaths } from "./reviews.ts";
import { registerSettingsPaths } from "./settings.ts";
import { registerVariantPaths } from "./variants.ts";
import { registerWishlistPaths } from "./wishlist.ts";

export function registerPaths() {
  registerHealthPaths();
  registerAuthPaths();
  registerCategoryPaths();
  registerProductPaths();
  registerVariantPaths();
  registerCartPaths();
  registerCheckoutPaths();
  registerWishlistPaths();
  registerReviewPaths();
  registerSettingsPaths();
  registerAdminPaths();
}
