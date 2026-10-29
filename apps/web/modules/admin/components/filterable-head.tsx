"use client";

import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { TableHead } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * A column header that filters the table by the column's value: a menu of
 * the values, with "" for all of them. The funnel stays lit while filtered.
 */
export function FilterableHead<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: V | "";
  /** The choices, the first usually { value: "", label: "All" }. */
  options: { value: V | ""; label: string; depth?: number }[];
  onChange: (value: V | "") => void;
  className?: string;
}) {
  const active = value !== "";
  return (
    <TableHead className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Filter by ${label.toLowerCase()}`}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase transition-colors hover:text-foreground",
            active && "text-foreground",
          )}
        >
          {label}
          <FunnelSimpleIcon
            weight={active ? "fill" : "bold"}
            className={cn("size-3", !active && "opacity-40")}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-48 overflow-y-auto p-1"
        >
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as V | "")}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <span style={{ paddingLeft: `${option.depth ?? 0}rem` }}>
                  {option.label}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableHead>
  );
}
