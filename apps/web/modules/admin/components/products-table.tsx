"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { AdminProduct, ProductSort, SortDir } from "@repo/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminDeleteProduct } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { orderTree } from "../lib/categories";
import {
  adminProductsSearch,
  EMPTY_FILTERS,
  type AdminProductFilters,
} from "../lib/filters";
import { useAdminProducts, useCategoryTree } from "../queries";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PageNav } from "./page-nav";
import { SaleDialog, type SaleMode } from "./sale-dialog";
import { SortableHead } from "./sortable-head";
import { ActiveBadge } from "./status-badge";

const ALL = "all";
const PATH = "/admin/products";

const statusItems = [
  { value: ALL, label: "Any status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Hidden" },
];

export function ProductsTable({ initial }: { initial: AdminProductFilters }) {
  const [filters, setFilters] = useState(initial);
  const [search, setSearch] = useState(initial.q);
  const debounced = useDebouncedValue(search.trim(), 300);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  // Picked rows by id, kept across pages and filters until cleared, so a
  // sale can span several pages.
  const [selected, setSelected] = useState<ReadonlyMap<string, AdminProduct>>(
    () => new Map(),
  );
  const [sale, setSale] = useState<SaleMode | null>(null);

  const products = useAdminProducts(filters);
  const tree = useCategoryTree();
  const categoryItems = useMemo(
    () => [
      { value: ALL, label: "All categories", depth: 0 },
      ...orderTree(tree.data ?? []).map((c) => ({
        value: c.slug,
        label: c.name,
        depth: c.depth,
      })),
    ],
    [tree.data],
  );

  // A new search starts from page 1.
  useEffect(() => {
    setFilters((f) =>
      f.q === debounced ? f : { ...f, q: debounced, page: 1 },
    );
  }, [debounced]);

  // The URL mirrors the table, so a reload or a shared link shows the same page.
  useEffect(() => {
    window.history.replaceState(null, "", PATH + adminProductsSearch(filters));
  }, [filters]);

  // A page past the end (its last product was deleted, or an old link)
  // falls back to the first.
  const outOfRange =
    products.isError &&
    getApiError(products.error)?.code === "INVALID_PAGE_PARAMETER";
  useEffect(() => {
    if (outOfRange && filters.page > 1) setFilters((f) => ({ ...f, page: 1 }));
  }, [outOfRange, filters.page]);

  const remove = useAdminMutation({
    mutationFn: async (product: AdminProduct) => {
      await adminDeleteProduct({
        path: { productID: product.id },
        throwOnError: true,
      });
    },
    success: (_, product) => `${product.name} was deleted`,
    failure: "Couldn't delete the product.",
    onSuccess: (_, product) => {
      setDeleting(null);
      toggle(product, false);
    },
  });

  const filtered = Boolean(filters.q || filters.status || filters.category);
  const sortProps = {
    sort: filters.sort,
    dir: filters.dir,
    onSort: (sort: ProductSort, dir: SortDir) =>
      setFilters((f) => ({ ...f, sort, dir, page: 1 })),
  };
  const rows = products.data?.data ?? [];
  const meta = products.data?.meta;

  const pickedOnPage = rows.filter((p) => selected.has(p.id)).length;
  const allOnPage = rows.length > 0 && pickedOnPage === rows.length;
  function toggle(product: AdminProduct, on: boolean) {
    setSelected((m) => {
      const next = new Map(m);
      if (on) next.set(product.id, product);
      else next.delete(product.id);
      return next;
    });
  }
  function togglePage(on: boolean) {
    setSelected((m) => {
      const next = new Map(m);
      for (const p of rows) {
        if (on) next.set(p.id, p);
        else next.delete(p.id);
      }
      return next;
    });
  }
  const clearSelection = () => setSelected(new Map());
  // The preview's price: a picked product's, else one on this page.
  const examplePrice =
    [...selected.values(), ...rows].find((p) => p.default_price !== null)
      ?.default_price ?? 2500;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name"
            aria-label="Search products"
            className="h-10 pl-9"
            maxLength={100}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <Select
            value={filters.status || ALL}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                status: value === "active" || value === "inactive" ? value : "",
                page: 1,
              }))
            }
            items={statusItems}
          >
            <SelectTrigger aria-label="Status" className="h-10 w-full lg:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.category || ALL}
            onValueChange={(value) =>
              setFilters((f) => ({
                ...f,
                category: !value || value === ALL ? "" : value,
                page: 1,
              }))
            }
            items={categoryItems}
          >
            <SelectTrigger
              aria-label="Category"
              className="h-10 w-full lg:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span style={{ paddingLeft: `${item.depth}rem` }}>
                    {item.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite">
          {meta
            ? `${meta.total} ${meta.total === 1 ? "product" : "products"}${filtered ? " found" : ""}`
            : " "}
        </p>
        <div className="flex items-center gap-4">
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilters((f) => ({
                  ...EMPTY_FILTERS,
                  sort: f.sort,
                  dir: f.dir,
                }));
              }}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <XIcon className="size-3" />
              Clear filters
            </button>
          )}
          {/* A sale on a category or everything needs no selection. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <TagIcon data-icon="inline-start" />
              Sale
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 p-1">
              <DropdownMenuItem onClick={() => setSale("start")}>
                Put on sale…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSale("end")}>
                End a sale…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Selected products"
          className="animate-rise flex flex-wrap items-center gap-3 rounded-panel border border-border bg-surface px-4 py-2.5 text-xs"
        >
          <p aria-live="polite" className="tabular-nums">
            {selected.size} selected
          </p>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3" />
            Clear selection
          </button>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => setSale("start")}>
              Put on sale
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSale("end")}>
              End sale
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "overflow-hidden rounded-panel border border-border transition-opacity",
          products.isPlaceholderData && "opacity-60",
        )}
      >
        <Table className="md:min-w-[48rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPage}
                  indeterminate={pickedOnPage > 0 && !allOnPage}
                  disabled={rows.length === 0}
                  onCheckedChange={(on) => togglePage(on)}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <SortableHead
                field="name"
                label="Product"
                natural="asc"
                {...sortProps}
                className="w-[45%]"
              />
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <SortableHead
                field="price"
                label="Price"
                natural="asc"
                {...sortProps}
                className="hidden text-right sm:table-cell"
              />
              <SortableHead
                field="stock"
                label="Stock"
                natural="asc"
                {...sortProps}
                className="text-right"
              />
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.isPending ? (
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-12" />
                  </TableCell>
                </TableRow>
              ))
            ) : products.isError && !outOfRange ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16 text-center">
                  <p className="mb-4 text-sm text-muted-foreground">
                    The products couldn&apos;t load.
                  </p>
                  <Button variant="outline" onClick={() => products.refetch()}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16 text-center">
                  <p className="font-serif text-2xl">
                    {filtered ? "Nothing matches." : "No products yet."}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {filtered
                      ? "Try another name or clear the filters."
                      : "Add the first one and it appears here."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  selected={selected.has(product.id)}
                  onSelect={(on) => toggle(product, on)}
                  onDelete={() => setDeleting(product)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && (
        <PageNav
          page={meta.page}
          totalPages={meta.total_pages}
          href={(page) => PATH + adminProductsSearch({ ...filters, page })}
          onPage={(page) => {
            setFilters((f) => ({ ...f, page }));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <SaleDialog
        mode={sale}
        selectedIds={[...selected.keys()]}
        examplePrice={examplePrice}
        onClose={() => setSale(null)}
        onDone={clearSelection}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this product?"
        description={
          <>
            <span className="text-foreground">{deleting?.name}</span> and its{" "}
            {deleting?.variant_count === 1
              ? "variant"
              : `${deleting?.variant_count ?? 0} variants`}{" "}
            will be removed for good, with their images and reviews. Orders keep
            their own copy. To take it off the store for now, hide it instead.
          </>
        }
        confirmLabel="Delete product"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function ProductRow({
  product,
  selected,
  onSelect,
  onDelete,
}: {
  product: AdminProduct;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onDelete: () => void;
}) {
  const href = `/admin/products/${product.id}`;
  const [image] = product.images;
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={selected}
          onCheckedChange={(on) => onSelect(on)}
          aria-label={`Select ${product.name}`}
        />
      </TableCell>
      <TableCell>
        <Link href={href} className="flex items-center gap-3">
          <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-media bg-surface">
            {image && (
              <Image
                src={image}
                alt=""
                fill
                sizes="44px"
                className="object-cover"
              />
            )}
          </span>
          {/* A fixed width on phones, where the table fits the screen. */}
          <span className="w-32 min-w-0 sm:w-auto">
            <span className="block truncate text-[0.8125rem] group-hover:underline">
              {product.name}
            </span>
            <span className="block truncate font-mono text-[0.625rem] text-muted-foreground">
              {product.slug}
              {product.is_featured && (
                <span className="ml-2 text-clay">Featured</span>
              )}
            </span>
            <span className="sm:hidden">
              <ActiveBadge active={product.is_active} />
            </span>
          </span>
        </Link>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {product.category_name ?? <span className="italic">None</span>}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">
        {product.default_price === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatPrice(product.default_price)
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className={cn(product.total_stock === 0 && "text-destructive")}>
          {product.total_stock}
        </span>
        <span className="block text-[0.625rem] text-muted-foreground">
          {product.variant_count === 1
            ? "1 variant"
            : `${product.variant_count} variants`}
        </span>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <ActiveBadge active={product.is_active} />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={`Actions for ${product.name}`}
          >
            <DotsThreeIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 p-1">
            <DropdownMenuItem render={<Link href={href} />}>
              <PencilSimpleIcon />
              Edit
            </DropdownMenuItem>
            {product.is_active && (
              <DropdownMenuItem
                render={
                  <a
                    href={`/products/${product.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <ArrowSquareOutIcon />
                View in store
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export function NewProductButton() {
  return (
    <Link href="/admin/products/new" className={buttonVariants()}>
      <PlusIcon data-icon="inline-start" />
      Add product
    </Link>
  );
}
