import { schemas } from "../schemas.ts";
import { operation } from "./shared.ts";

export function registerSettingsPaths() {
  operation({
    method: "get",
    path: "/api/v1/settings",
    operationId: "getStoreSettings",
    tag: "Settings",
    summary: "Store settings",
    description: "Store-wide settings the storefront needs, such as its theme.",
    success: {
      status: 200,
      description: "Settings fetched",
      schema: schemas.StoreSettingsResponseSchema,
    },
  });
}
