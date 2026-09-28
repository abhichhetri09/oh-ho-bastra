import { z } from "zod";
import { paymentMethods, shippingOptions } from "./checkout-options.ts";
import { db } from "./db/index.ts";
import { setting } from "./db/schema.ts";

// Each section is validated on read and on write. Stored values that no longer
// parse (e.g. after a schema change) fall back to the defaults.
const storeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  supportEmail: z.email(),
  phone: z.string().trim().max(30),
  // Finnish business ID (Y-tunnus), e.g. 1234567-8.
  businessId: z
    .string()
    .trim()
    .regex(/^(\d{7}-\d)?$/, "Format 1234567-8"),
});

const shippingSchema = z.object({
  options: z.record(
    z.string(),
    z.object({ enabled: z.boolean(), priceCents: z.number().int().min(0).max(100_000) }),
  ),
  // Orders at or above this subtotal ship free. Null turns it off.
  freeShippingThresholdCents: z.number().int().min(0).max(1_000_000).nullable(),
});

const paymentsSchema = z.object({
  enabledMethods: z.array(z.string()).min(1, "Keep at least one payment method"),
});

const inventorySchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(1000),
});

export const settingsSchemas = {
  store: storeSchema,
  shipping: shippingSchema,
  payments: paymentsSchema,
  inventory: inventorySchema,
};

export type SettingsSection = keyof typeof settingsSchemas;
export type Settings = { [K in SettingsSection]: z.infer<(typeof settingsSchemas)[K]> };

export const defaultSettings: Settings = {
  store: {
    name: "Oh Ho Bastra",
    supportEmail: "hello@ohhobastra.fi",
    phone: "",
    businessId: "",
  },
  shipping: {
    options: Object.fromEntries(
      shippingOptions.map((o) => [o.id, { enabled: true, priceCents: o.priceCents }]),
    ),
    freeShippingThresholdCents: null,
  },
  payments: { enabledMethods: paymentMethods.map((m) => m.id) },
  inventory: { lowStockThreshold: 5 },
};

export function isSettingsSection(key: string): key is SettingsSection {
  return key in settingsSchemas;
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(setting);
  const settings = structuredClone(defaultSettings);
  for (const row of rows) {
    if (!isSettingsSection(row.key)) continue;
    const parsed = settingsSchemas[row.key].safeParse(row.value);
    if (parsed.success) {
      (settings as Record<string, unknown>)[row.key] = parsed.data;
    }
  }
  return settings;
}

export async function saveSettings(section: SettingsSection, value: unknown, userId: string) {
  const parsed = settingsSchemas[section].parse(value);
  await db
    .insert(setting)
    .values({ key: section, value: parsed, updatedBy: userId })
    .onConflictDoUpdate({ target: setting.key, set: { value: parsed, updatedBy: userId } });
  return parsed;
}

/** Shipping options and payment methods as checkout should offer them right now. */
export async function checkoutOffer() {
  const settings = await getSettings();
  const shipping = shippingOptions.flatMap((option) => {
    const config = settings.shipping.options[option.id];
    return config?.enabled === false
      ? []
      : [{ ...option, priceCents: config?.priceCents ?? option.priceCents }];
  });
  const enabled = new Set(settings.payments.enabledMethods);
  const methods = paymentMethods.filter((m) => enabled.has(m.id));
  return {
    shippingOptions: shipping,
    paymentMethods: methods,
    freeShippingThresholdCents: settings.shipping.freeShippingThresholdCents,
  };
}

export function shippingPrice(priceCents: number, subtotalCents: number, freeFrom: number | null) {
  return freeFrom !== null && subtotalCents >= freeFrom ? 0 : priceCents;
}
