import type { Country } from "@repo/types";

// Static names (not Intl.DisplayNames, whose output differs between the
// server's and the browser's ICU data and would break hydration).
export const COUNTRY_NAMES: Record<Country, string> = {
  FI: "Finland",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  AU: "Australia",
  NZ: "New Zealand",
  NP: "Nepal",
  IN: "India",
  JP: "Japan",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code as Country] ?? code;
}
