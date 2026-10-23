import type { Addresse, CreateAddressParams } from "../db/gen";

/**
 * A shipping address as the order snapshots it (Go's types.AddressInput):
 * every key present, "" for an empty line2 or region.
 */
export interface AddressInput {
  full_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
}

const clean = (s: string | undefined) =>
  (s ?? "").split(/\s+/).filter(Boolean).join(" ");

/** Trims every field and collapses inner whitespace. */
export function normalizeAddress(a: Partial<AddressInput>): AddressInput {
  return {
    full_name: clean(a.full_name),
    phone: clean(a.phone),
    line1: clean(a.line1),
    line2: clean(a.line2),
    city: clean(a.city),
    region: clean(a.region),
    postal_code: clean(a.postal_code).toUpperCase(),
    country: a.country ?? "",
  };
}

export function addressFromRow(a: Addresse): AddressInput {
  return {
    full_name: a.full_name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    region: a.region ?? "",
    postal_code: a.postal_code,
    country: a.country,
  };
}

export function createAddressParams(
  userId: string,
  a: AddressInput,
  isDefault: boolean,
): CreateAddressParams {
  return {
    user_id: userId,
    full_name: a.full_name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || null,
    city: a.city,
    region: a.region || null,
    postal_code: a.postal_code,
    country: a.country,
    is_default: isDefault,
  };
}

/** The JSON stored as the order's shipping_address, keys in Go's order. */
export const snapshot = (a: AddressInput) =>
  JSON.stringify({
    full_name: a.full_name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    region: a.region,
    postal_code: a.postal_code,
    country: a.country,
  });

/**
 * " (Black / M)" for the hosted checkout's line names, so two variants of
 * one product read apart; "" without options.
 */
export function optionSuffix(options: unknown): string {
  if (!Array.isArray(options) || options.length === 0) return "";
  const values: string[] = [];
  for (const o of options) {
    if (o === null) {
      values.push("");
      continue;
    }
    // Go unmarshalled into []struct{Value string}: anything else fails it.
    if (typeof o !== "object" || Array.isArray(o)) return "";
    const v = (o as Record<string, unknown>).value;
    if (v !== undefined && v !== null && typeof v !== "string") return "";
    values.push(v ?? "");
  }
  return " (" + values.join(" / ") + ")";
}
