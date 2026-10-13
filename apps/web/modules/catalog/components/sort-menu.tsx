"use client";

import type { SortOption } from "@repo/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SORT_OPTIONS } from "../lib/filters";

type Option = (typeof SORT_OPTIONS)[number];

export function SortMenu({
  value,
  options,
  onChange,
}: {
  value: SortOption;
  options: Option[];
  onChange: (sort: SortOption) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => next && onChange(next as SortOption)}
      items={options}
    >
      <SelectTrigger
        aria-label="Sort products"
        className="h-9 border-none px-0 text-[0.8125rem] hover:bg-transparent"
      >
        <span className="text-muted-foreground">Sort:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        className="min-w-48"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="py-2.5 text-[0.8125rem]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
