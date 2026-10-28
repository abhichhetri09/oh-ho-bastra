import type { GetStoreSettingsRow } from "../db/gen";
import { shippingRuleOf } from "../checkout/shipping";

/**
 * The store_settings row as GET /settings and the admin's saves send it
 * (StoreSettings): as it is, with the delivery price as one object.
 */
export function storeSettings({
  shipping_flat,
  free_shipping_from,
  updated_at,
  ...row
}: GetStoreSettingsRow) {
  return {
    ...row,
    shipping: shippingRuleOf({ shipping_flat, free_shipping_from }),
    updated_at,
  };
}
