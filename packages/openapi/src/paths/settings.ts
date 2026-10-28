import { schemas } from "../schemas.ts";
import { operation } from "./shared.ts";

export function registerSettingsPaths() {
  operation({
    method: "get",
    path: "/api/v1/settings",
    operationId: "getStoreSettings",
    tag: "Settings",
    summary: "Store settings",
    description:
      "Store-wide settings the storefront needs: its theme (with the headline font and corners the store uses in place of the theme's), the top banner's messages, the seller's business details and what delivery costs.",
    success: {
      status: 200,
      description: "Settings fetched",
      schema: schemas.StoreSettingsResponseSchema,
    },
  });
}
