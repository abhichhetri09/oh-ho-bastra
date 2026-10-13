"use client";

import { useEffect } from "react";
import { site } from "@/lib/site";
import { useListingFilters } from "../hooks/use-listing-filters";
import { shopTitle } from "../lib/filters";
import { CollectionHeader } from "./collection-header";

/**
 * The /shop header. It reads the URL on the client because filters change
 * through the History API without a server render: a search or the
 * editor's picks toggle retitles the page (and the tab) in place.
 */
export function ShopHeader({
  links,
}: {
  links: { label: string; href: string }[];
}) {
  const { filters } = useListingFilters();
  const title = shopTitle(filters.q, filters.featured);

  // Metadata only renders on navigation; keep the tab in step with pushState.
  useEffect(() => {
    document.title = `${title} | ${site.name}`;
  }, [title]);

  if (filters.q) {
    return (
      <CollectionHeader
        // Remount on a new search so the entrance plays again.
        key={filters.q}
        eyebrow="Search results"
        title={`“${filters.q}”`}
        description="Matches from every collection, by name, category, description and details."
        links={links}
      />
    );
  }

  return filters.featured ? (
    <CollectionHeader
      eyebrow="Curated"
      title="Editor's picks."
      description="The pieces we reach for most, chosen by the people who choose everything."
      links={links}
    />
  ) : (
    <CollectionHeader
      eyebrow="The collection"
      title="Shop all."
      description="Clothing, accessories and homewares in natural materials. Filter by size, colour and price."
      links={links}
    />
  );
}
