"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import {
  CreateVariantBodySchema,
  UpdateVariantBodySchema,
  type AdminVariant,
  type CreateVariantBody,
  type UpdateVariantBody,
  type Attribute,
  type OptionType,
} from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminCreateVariant,
  adminSetVariantStock,
  adminUpdateVariant,
} from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { friendlyFieldErrors, withoutErrors } from "@/lib/forms";
import { fromCents, toCents } from "@/lib/money";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminAttributes, useAdminBlanks } from "../queries";
import { fromLocalInput, toLocalInput } from "../lib/datetime";
import type { StoredImage } from "../lib/upload";
import { ImageManager } from "./image-manager";
import { ToggleField } from "./product-form";

type Property = { name: string; value: string; type: OptionType };

const NO_BLANK = "none";

/** "color", "Colour" and "colours" are one option. */
const nameKey = (name: string) => {
  const key = name.trim().toLowerCase();
  return /^colou?rs?$/.test(key) ? "colour" : key;
};

/** The store's list an option name belongs to, however it is spelt. */
const listFor = (name: string, lists: Attribute[]) =>
  lists.find((a) => nameKey(a.name) === nameKey(name));

/**
 * The values row i can pick: its list's, plus the value it has now when the
 * list no longer holds it (a variant made before the list changed).
 */
function valueItems(p: Property, lists: Attribute[]) {
  const values = listFor(p.name, lists)?.values ?? [];
  const items = values.map((v) => ({ value: v.value, hex: v.hex }));
  if (p.value && !items.some((v) => v.value === p.value))
    items.unshift({ value: p.value, hex: null });
  return items;
}

/** A colour's dot, from its swatch (or its name, which CSS may know). */
function Swatch({ hex, name }: { hex: string | null; name: string }) {
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/15"
      style={{ backgroundColor: hex ?? name.toLowerCase().replace(/\s+/g, "") }}
    />
  );
}

/** `editing` is the variant to edit, "new" to add one, null when closed. */
export function VariantDialog({
  productId,
  productImages,
  editing,
  options,
  first,
  onClose,
}: {
  productId: string;
  productImages: StoredImage[];
  editing: AdminVariant | "new" | null;
  /** The product's option names and types, to start a new variant from. */
  options: { name: string; type: OptionType }[];
  /** No variants yet: the new one starts as the default. */
  first: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const lists = useAdminAttributes();
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {editing !== null && !lists.data && (
          <div className="space-y-4 p-6">
            <DialogTitle className="sr-only">Loading</DialogTitle>
            {lists.isError ? (
              <p className="text-sm text-muted-foreground">
                The option lists couldn&apos;t load.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => lists.refetch()}
                >
                  Try again
                </button>
              </p>
            ) : (
              Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))
            )}
          </div>
        )}
        {editing !== null && lists.data && (
          <VariantForm
            key={editing === "new" ? "new" : editing.id}
            productId={productId}
            productImages={productImages}
            variant={editing === "new" ? undefined : editing}
            options={options}
            lists={lists.data}
            first={first}
            onBusyChange={setBusy}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VariantForm({
  productId,
  productImages,
  variant,
  options,
  lists,
  first,
  onBusyChange,
  onDone,
}: {
  productId: string;
  productImages: StoredImage[];
  variant?: AdminVariant;
  options: { name: string; type: OptionType }[];
  /** The store's option lists, which options and values are picked from. */
  lists: Attribute[];
  first: boolean;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  // An existing variant edits its own values; a new one starts with the
  // product's options, or the store's first two lists (Size and Colour) for
  // a product's first variant.
  const [properties, setProperties] = useState<Property[]>(() =>
    variant
      ? variant.options.map((o) => ({
          name: o.name,
          value: o.value,
          type: o.type,
        }))
      : (options.length > 0
          ? options
          : lists.slice(0, 2).map((a) => ({ name: a.name, type: a.type }))
        ).map((o) => ({ ...o, value: "" })),
  );
  const [selling, setSelling] = useState(
    variant ? fromCents(variant.selling_price) : "",
  );
  const [offer, setOffer] = useState(
    variant?.offer_price ? fromCents(variant.offer_price) : "",
  );
  const [offerEnds, setOfferEnds] = useState(
    toLocalInput(variant?.offer_expires_at ?? null),
  );
  // An existing variant's count is saved through its own write, and only
  // when changed here, so an untouched form can't put back an old count.
  const [stock, setStock] = useState(variant ? String(variant.stock) : "");
  // A blank shares its stock with every variant printed on it.
  const [blankId, setBlankId] = useState(variant?.blank_id ?? NO_BLANK);
  const blanks = useAdminBlanks();
  const blankItems = [
    { value: NO_BLANK, label: "None: its own stock" },
    ...(blanks.data ?? []).map((b) => ({
      value: b.id,
      label: `${b.name} (${b.stock})`,
    })),
  ];
  const onBlank = blankId !== NO_BLANK;
  const blank = blanks.data?.find((b) => b.id === blankId);
  const [images, setImages] = useState<StoredImage[]>(() =>
    variant
      ? variant.images.map((url, i) => ({
          url,
          public_id: variant.image_public_ids[i] ?? "",
        }))
      : productImages.slice(0, 1),
  );
  const [isDefault, setIsDefault] = useState(variant?.is_default ?? first);
  const [isActive, setIsActive] = useState(variant?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const save = useAdminMutation({
    mutationFn: async (body: CreateVariantBody | UpdateVariantBody) => {
      if (variant) {
        await adminUpdateVariant({
          path: { productID: productId, variantID: variant.id },
          body,
          throwOnError: true,
        });
        const count = Number(stock);
        if (blankId === NO_BLANK && count !== variant.stock) {
          await adminSetVariantStock({
            path: { productID: productId, variantID: variant.id },
            body: { stock: count },
            throwOnError: true,
          });
        }
      } else {
        await adminCreateVariant({
          path: { productID: productId },
          body: body as CreateVariantBody,
          throwOnError: true,
        });
      }
    },
    quietOnFieldErrors: true,
    failure: "Couldn't save the variant.",
    success: variant ? "Variant saved" : "Variant added",
    invalidate: [
      adminKeys.variants(productId),
      adminKeys.products(),
      adminKeys.stats(),
      adminKeys.inventory(),
      adminKeys.counts(),
      adminKeys.blanks(),
    ],
    onSuccess: () => {
      onBusyChange(false);
      onDone();
    },
  });

  function clear(...fields: string[]) {
    setErrors((e) => withoutErrors(e, ...fields));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const sellingCents = toCents(selling);
    const offerCents = offer.trim() ? toCents(offer) : undefined;
    if (sellingCents === null)
      local.selling_price = "Enter a price, like 49 or 49.50";
    if (offerCents === null)
      local.offer_price = "Enter a price, like 39 or 39.50";
    if (!onBlank && !/^\d+$/.test(stock.trim())) {
      local.stock = "Enter a whole number";
    } else if (!onBlank && Number(stock) > 10_000) {
      local.stock = "Enter a count up to 10,000";
    }

    const body = {
      images: images.map((i) => i.url),
      image_public_ids: images.map((i) => i.public_id),
      ...(!variant && !onBlank && { stock: Number(stock) }),
      blank_id: onBlank ? blankId : null,
      selling_price: sellingCents ?? 0,
      ...(offerCents != null && {
        offer_price: offerCents,
        ...(fromLocalInput(offerEnds) && {
          offer_expires_at: fromLocalInput(offerEnds),
        }),
      }),
      is_default: isDefault,
      is_active: isActive,
      properties: properties
        .map((p) => ({
          ...p,
          name: listFor(p.name, lists)?.name ?? p.name.trim(),
          value: p.value.trim(),
        }))
        .filter((p) => p.name || p.value),
    };

    const schema = variant ? UpdateVariantBodySchema : CreateVariantBodySchema;
    const parsed = schema.safeParse(body);
    const labels: Record<string, string> = {
      images: "at least one image",
      stock: "a count up to 10,000",
      selling_price: "a price up to €1,000,000",
    };
    properties.forEach((_, i) => {
      labels[`properties.${i}.name`] = "an option name";
      labels[`properties.${i}.value`] = "a value";
    });
    const all = {
      ...(parsed.success ? {} : friendlyFieldErrors(parsed.error, labels)),
      ...local,
    };
    if (Object.keys(all).length > 0 || !parsed.success) {
      setErrors(all);
      return;
    }
    setErrors({});
    onBusyChange(true);
    save.mutate(parsed.data, {
      onError: (error) => {
        onBusyChange(false);
        setErrors(mapFieldErrors(getApiError(error)?.errors));
      },
    });
  }

  // The next list no row uses yet, for "Add option".
  const unused = lists.find(
    (l) => !properties.some((p) => nameKey(p.name) === nameKey(l.name)),
  );

  const label = variant
    ? variant.options.map((o) => o.value).join(" / ") || "Default variant"
    : "New variant";
  const imageError = errors.images ?? errors.image_public_ids;
  // The earliest end a browser offers: now, to the minute.
  const now = toLocalInput(new Date().toISOString());

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader className="gap-1 border-b border-border px-6 py-5">
        <DialogTitle className="font-serif text-2xl font-normal">
          {label}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {variant
            ? `SKU ${variant.sku ?? "none"}. Prices are in euros.`
            : "The options tell this variant apart, like Size M in Black. Prices are in euros."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-7 px-6 py-6">
        <fieldset className="space-y-3">
          <legend className="eyebrow mb-1 !text-foreground">Options</legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Picked from your option lists. Add sizes, colours or new options
            under{" "}
            <Link href="/admin/attributes" className="underline">
              Catalog → Options
            </Link>
            .
          </p>
          {properties.map((p, i) => {
            const taken = new Set(
              properties.filter((_, j) => j !== i).map((x) => nameKey(x.name)),
            );
            const nameItems = lists
              .filter((l) => !taken.has(nameKey(l.name)))
              .map((l) => ({ value: l.name, label: l.name }));
            const current = listFor(p.name, lists)?.name ?? p.name;
            if (current && !nameItems.some((n) => n.value === current))
              nameItems.unshift({ value: current, label: current });
            const values = valueItems(p, lists);
            return (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2"
              >
                <Field data-invalid={Boolean(errors[`properties.${i}.name`])}>
                  <Select
                    value={current || null}
                    onValueChange={(name) => {
                      if (!name) return;
                      const list = listFor(name, lists);
                      setProperties((ps) =>
                        ps.map((x, j) =>
                          j === i
                            ? { name, value: "", type: list?.type ?? x.type }
                            : x,
                        ),
                      );
                      clear(
                        `properties.${i}.name`,
                        `properties.${i}.value`,
                        "properties",
                      );
                    }}
                    items={nameItems}
                  >
                    <SelectTrigger
                      aria-label={`Option ${i + 1}`}
                      aria-invalid={Boolean(errors[`properties.${i}.name`])}
                      className="h-10 w-full"
                    >
                      <SelectValue placeholder="Choose an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {nameItems.map((n) => (
                        <SelectItem key={n.value} value={n.value}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{errors[`properties.${i}.name`]}</FieldError>
                </Field>
                <Field data-invalid={Boolean(errors[`properties.${i}.value`])}>
                  <Select
                    value={p.value || null}
                    onValueChange={(value) => {
                      if (!value) return;
                      setProperties((ps) =>
                        ps.map((x, j) => (j === i ? { ...x, value } : x)),
                      );
                      clear(`properties.${i}.value`);
                    }}
                    items={values.map((v) => ({
                      value: v.value,
                      label: v.value,
                    }))}
                    disabled={!p.name}
                  >
                    <SelectTrigger
                      aria-label={`${p.name || `Option ${i + 1}`} value`}
                      aria-invalid={Boolean(errors[`properties.${i}.value`])}
                      className="h-10 w-full"
                    >
                      <SelectValue
                        placeholder={
                          p.name ? `Choose a ${p.name.toLowerCase()}` : "—"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {values.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {p.type === "color" && (
                            <Swatch hex={v.hex} name={v.value} />
                          )}
                          {v.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{errors[`properties.${i}.value`]}</FieldError>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  onClick={() => {
                    setProperties((ps) => ps.filter((_, j) => j !== i));
                    setErrors({});
                  }}
                  aria-label={`Remove option ${i + 1}`}
                >
                  <XIcon />
                </Button>
              </div>
            );
          })}
          {errors.properties && (
            <p className="text-xs text-destructive">{errors.properties}</p>
          )}
          {unused && properties.length < 10 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setProperties((ps) => [
                  ...ps,
                  { name: unused.name, value: "", type: unused.type },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Add option
            </Button>
          )}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <MoneyField
            id="variant-selling"
            label="Price"
            value={selling}
            onChange={(v) => {
              setSelling(v);
              clear("selling_price", "offer_price");
            }}
            error={errors.selling_price}
          />
          <Field className="sm:col-span-2">
            <FieldLabel className="eyebrow !text-foreground">
              Printed on blank
              <span className="ml-1 tracking-normal normal-case text-muted-foreground">
                (optional)
              </span>
            </FieldLabel>
            <Select
              value={blankId}
              onValueChange={(v) => {
                setBlankId(v ?? NO_BLANK);
                clear("stock", "blank_id");
              }}
              items={blankItems}
            >
              <SelectTrigger aria-label="Blank" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {blankItems.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {onBlank
                ? "Shares the blank's stock: a sale of any print on it takes one from all of them."
                : "Pick one when you print this to order on a plain garment you keep in stock. Add blanks under Catalog → Blanks."}
            </p>
            <FieldError>{errors.blank_id}</FieldError>
          </Field>
          {onBlank ? (
            <div className="space-y-2">
              <p className="eyebrow !text-foreground">Stock</p>
              <p className="flex h-10 items-center text-sm tabular-nums">
                {blank?.stock ?? "—"}
                <span className="ml-2 text-xs text-muted-foreground">
                  The blank&apos;s, shared.
                </span>
              </p>
            </div>
          ) : (
            <Field data-invalid={Boolean(errors.stock)}>
              <FieldLabel
                htmlFor="variant-stock"
                className="eyebrow !text-foreground"
              >
                Stock
              </FieldLabel>
              <Input
                id="variant-stock"
                inputMode="numeric"
                value={stock}
                onChange={(e) => {
                  setStock(e.target.value.replace(/\D/g, "").slice(0, 5));
                  clear("stock");
                }}
                aria-invalid={Boolean(errors.stock)}
              />
              <FieldError>{errors.stock}</FieldError>
            </Field>
          )}
          <MoneyField
            id="variant-offer"
            label="Offer price"
            optional
            value={offer}
            onChange={(v) => {
              setOffer(v);
              clear("offer_price");
            }}
            error={errors.offer_price}
          />
          <Field data-invalid={Boolean(errors.offer_expires_at)}>
            <FieldLabel
              htmlFor="variant-offer-ends"
              className="eyebrow !text-foreground"
            >
              Offer ends
              <span className="ml-1 tracking-normal normal-case text-muted-foreground">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="variant-offer-ends"
              type="datetime-local"
              value={offerEnds}
              min={now}
              disabled={!offer.trim()}
              onChange={(e) => {
                setOfferEnds(e.target.value);
                clear("offer_expires_at");
              }}
              aria-invalid={Boolean(errors.offer_expires_at)}
            />
            <FieldError>{errors.offer_expires_at}</FieldError>
          </Field>
        </div>

        <div className="space-y-3">
          <p className="eyebrow !text-foreground">Images</p>
          <ImageManager
            images={images}
            onChange={(update) => {
              setImages(update);
              clear("images", "image_public_ids");
            }}
            library={productImages}
            invalid={Boolean(imageError)}
            onUploadingChange={setUploading}
            label={label}
          />
          {imageError && (
            <p className="text-xs text-destructive">{imageError}</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <ToggleField
            id="variant-default"
            label="Default"
            description="Its price and photos represent the product in listings. Switching it on takes over from the current default."
            checked={isDefault}
            onChange={setIsDefault}
          />
          <ToggleField
            id="variant-active"
            label="Active"
            description="Can be chosen and bought."
            checked={isActive}
            onChange={setIsActive}
          />
        </div>
      </div>

      <DialogFooter className="sticky bottom-0 border-t border-border bg-popover px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || uploading}>
          {save.isPending
            ? "Saving…"
            : uploading
              ? "Uploading…"
              : variant
                ? "Save variant"
                : "Add variant"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
  error,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  optional?: boolean;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id} className="eyebrow !text-foreground">
        {label}
        {optional && (
          <span className="ml-1 tracking-normal normal-case text-muted-foreground">
            (optional)
          </span>
        )}
      </FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
          €
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) =>
            onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))
          }
          className="pl-7 tabular-nums"
          aria-invalid={Boolean(error)}
        />
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
