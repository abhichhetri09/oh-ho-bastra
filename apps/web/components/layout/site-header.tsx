import { getCollections } from "@/modules/catalog/api";
import { HeaderShell } from "./header-shell";

/** Server half of the header: the collections for the menus (cached). */
export async function SiteHeader() {
  return <HeaderShell categories={await getCollections()} />;
}
