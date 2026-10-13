"use client";

import { useState } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import type { FilterOption, PriceRange } from "@repo/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { formatPriceShort } from "@/lib/money";
import { isLightSwatch, swatchColor } from "@/lib/swatches";
import { cn } from "@/lib/utils";
import { hasOption, toggleOption, type ListingFilters } from "../lib/filters";
import { compareOptionValues, optionLabel } from "../lib/option-order";

type Group = { name: string; color: boolean; values: string[] };

/** Facets grouped by option, colours first, values in shopper order. */
function groupFacets(facets: FilterOption[]): Group[] {
  const groups = new Map<string, Group>();
  for (const f of facets) {
    const group = groups.get(f.option_name) ?? {
      name: f.option_name,
      color: false,
      values: [],
    };
    group.color ||= f.option_type === "color";
    group.values.push(f.option_value);
    groups.set(f.option_name, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, values: g.values.sort(compareOptionValues) }))
    .sort(
      (a, b) =>
        Number(b.color) - Number(a.color) || a.name.localeCompare(b.name),
    );
}

export function FilterPanel({
  filters,
  onChange,
  facets,
  priceRange,
}: {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  facets: FilterOption[];
  priceRange: PriceRange;
}) {
  const groups = groupFacets(facets);
  // Sections come and go with the facets (a search or the editor's picks
  // toggle changes them), so track what the shopper closed: a section that
  // appears later starts open, and a closed one stays closed.
  const [closed, setClosed] = useState<string[]>([]);
  const sections = ["price", ...groups.map((g) => g.name), "edit"];

  return (
    <Accordion
      multiple
      value={sections.filter((section) => !closed.includes(section))}
      onValueChange={(open) =>
        setClosed((prev) => [
          ...prev.filter((s) => !open.includes(s)),
          ...sections.filter((s) => !open.includes(s) && !prev.includes(s)),
        ])
      }
      className="w-full"
    >
      {priceRange.max_price > priceRange.min_price && (
        <AccordionItem value="price">
          <AccordionTrigger className="eyebrow !text-foreground py-4 hover:no-underline">
            Price
          </AccordionTrigger>
          <AccordionContent>
            <PriceFilter
              // Reset the local slider when the URL's range changes.
              key={`${filters.priceMin}-${filters.priceMax}`}
              filters={filters}
              onChange={onChange}
              range={priceRange}
            />
          </AccordionContent>
        </AccordionItem>
      )}

      {groups.map((group) => (
        <AccordionItem key={group.name} value={group.name}>
          <AccordionTrigger className="eyebrow !text-foreground py-4 hover:no-underline">
            {optionLabel(group.name)}
          </AccordionTrigger>
          <AccordionContent>
            <div
              role="group"
              aria-label={optionLabel(group.name)}
              className={cn(
                "flex flex-wrap gap-2 pb-1",
                group.color && "gap-x-3 gap-y-3",
              )}
            >
              {group.values.map((value) => {
                const pressed = hasOption(filters, group.name, value);
                const toggle = () =>
                  onChange(toggleOption(filters, group.name, value));
                return group.color ? (
                  <SwatchToggle
                    key={value}
                    value={value}
                    pressed={pressed}
                    onToggle={toggle}
                  />
                ) : (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={toggle}
                    className="h-9 min-w-11 rounded-control border border-border px-3 text-xs tabular-nums transition-colors duration-200 hover:border-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}

      <AccordionItem value="edit">
        <AccordionTrigger className="eyebrow !text-foreground py-4 hover:no-underline">
          Curated
        </AccordionTrigger>
        <AccordionContent>
          <label className="flex cursor-pointer items-center gap-3 text-[0.8125rem]">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={filters.featured}
              onChange={(e) =>
                onChange({ ...filters, featured: e.target.checked })
              }
            />
            <span className="flex size-4 items-center justify-center rounded-[calc(var(--radius-field)*0.4)] border border-input transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40">
              {filters.featured && (
                <CheckIcon weight="bold" className="size-3" />
              )}
            </span>
            Editor&apos;s picks only
          </label>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SwatchToggle({
  value,
  pressed,
  onToggle,
}: {
  value: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  const color = swatchColor(value);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className="group flex items-center gap-2 text-xs outline-none"
    >
      {/* The ring is drawn inside this box, not as an outer ring/offset:
          the panel scrolls and the accordion clips, so anything outside
          the button would be cut off. */}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--border)] transition-[box-shadow] duration-200 group-hover:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_50%,transparent)] group-aria-pressed:shadow-[inset_0_0_0_2px_var(--foreground)] group-focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]!">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--border)]",
            !color && "bg-muted",
          )}
          style={color ? { background: color } : undefined}
        >
          {pressed && (
            <CheckIcon
              weight="bold"
              className={cn(
                "size-3.5",
                color && isLightSwatch(value)
                  ? "text-foreground"
                  : "text-white",
                !color && "text-foreground",
              )}
            />
          )}
        </span>
      </span>
      <span className="text-muted-foreground group-aria-pressed:text-foreground">
        {value}
      </span>
    </button>
  );
}

function PriceFilter({
  filters,
  onChange,
  range,
}: {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  range: PriceRange;
}) {
  // Whole currency units keep the slider steps meaningful.
  const floor = Math.floor(range.min_price / 100);
  const ceil = Math.ceil(range.max_price / 100);
  const clamp = (n: number) => Math.min(ceil, Math.max(floor, n));
  const [value, setValue] = useState<number[]>([
    filters.priceMin ? clamp(Math.floor(filters.priceMin / 100)) : floor,
    filters.priceMax ? clamp(Math.ceil(filters.priceMax / 100)) : ceil,
  ]);

  function commit(next: number[]) {
    const [lo = floor, hi = ceil] = next;
    onChange({
      ...filters,
      // The full range means no bound, so the URL stays clean.
      priceMin: lo > floor ? lo * 100 : 0,
      priceMax: hi < ceil ? hi * 100 : 0,
    });
  }

  return (
    <div className="space-y-4 px-1 pt-2 pb-1">
      <Slider
        min={floor}
        max={ceil}
        step={1}
        minStepsBetweenValues={1}
        value={value}
        onValueChange={(next) => setValue(next as number[])}
        onValueCommitted={(next) => commit(next as number[])}
        aria-label="Price range"
      />
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{formatPriceShort((value[0] ?? floor) * 100)}</span>
        <span>{formatPriceShort((value[1] ?? ceil) * 100)}</span>
      </div>
    </div>
  );
}
