import type { Deps } from "../deps";
import type { Group } from "../http/router";
import { cartRoutes } from "../shopping/cart";
import { reviewRoutes } from "../shopping/reviews";
import { wishlistRoutes } from "../shopping/wishlist";

// The cart, wishlist and reviews (internal/handlers/cart, wishlist, review
// and internal/handlers/admin/reviews.go).

export function shoppingRoutes(api: Group, deps: Deps) {
  cartRoutes(api, deps);
  wishlistRoutes(api, deps);
  reviewRoutes(api, deps);
}
