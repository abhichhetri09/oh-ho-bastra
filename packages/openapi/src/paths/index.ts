import { registerAdminPaths } from "./admin.ts";
import { registerAttributePaths } from "./attributes.ts";
import { registerAuthPaths } from "./auth.ts";
import { registerBlankPaths } from "./blanks.ts";
import { registerCartPaths } from "./carts.ts";
import { registerCategoryPaths } from "./categories.ts";
import { registerCheckoutPaths } from "./checkout.ts";
import { registerContactPaths } from "./contact.ts";
import { registerCouponPaths } from "./coupons.ts";
import { registerHealthPaths } from "./health.ts";
import { registerProductPaths } from "./products.ts";
import { registerReferralPaths } from "./referrals.ts";
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
  registerContactPaths();
  registerWishlistPaths();
  registerReviewPaths();
  registerSettingsPaths();
  registerAdminPaths();
  registerCouponPaths();
  registerBlankPaths();
  registerAttributePaths();
  registerReferralPaths();
}
