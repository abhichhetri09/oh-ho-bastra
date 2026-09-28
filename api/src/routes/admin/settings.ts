import { Router } from "express";
import { paymentMethods, shippingOptions } from "../../checkout-options.ts";
import { HttpError } from "../../http-error.ts";
import { currentAdmin } from "../../session.ts";
import { getSettings, isSettingsSection, saveSettings } from "../../settings.ts";

export const adminSettings = Router();

adminSettings.get("/settings", async (_req, res) => {
  res.json({
    settings: await getSettings(),
    // What the settings refer to, so the UI can label and list everything.
    catalog: { shippingOptions, paymentMethods },
    paymentProvider: process.env.PAYMENT_PROVIDER ?? "mock",
  });
});

adminSettings.put("/settings/:section", async (req, res) => {
  const { section } = req.params;
  if (!isSettingsSection(section)) {
    throw new HttpError(404, "Unknown settings section");
  }
  res.json(await saveSettings(section, req.body, currentAdmin(res).id));
});
