"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import {
  CreateVariantBodySchema,
  UpdateVariantBodySchema,
  type AdminVariant,
  type CreateVariantBody,
  type UpdateVariantBody,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminCreateVariant, adminUpdateVariant } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { friendlyFieldErrors, withoutErrors } from "@/lib/forms";
import { fromCents, toCents } from "@/lib/money";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { fromLocalInput, toLocalInput } from "../lib/datetime";
import type { StoredImage } from "../lib/upload";
import { ImageManager } from "./image-manager";
import { ToggleField } from "./product-form";

type Property = { name: string; value: string; type: OptionType };

const typeItems = [
  { value: "text", label: "Text" },
  { value: "color", label: "Colour" },
];

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
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {editing !== null && (
          <VariantForm
            key={editing === "new" ? "new" : editing.id}
            productId={productId}
            productImages={productImages}
            variant={editing === "new" ? undefined : editing}
            options={options}
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
  first,
  onBusyChange,
  onDone,
}: {
  productId: string;
  productImages: StoredImage[];
  variant?: AdminVariant;
  options: { name: string; type: OptionType }[];
  first: boolean;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const [properties, setProperties] = useState<Property[]>(() =>
    options.map((o) => ({ ...o, value: "" })),
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
  // Stock is set here only for a new variant: an existing one's is counted
  // in the table (its own write, so this form can't put back an old count).
  const [stock, setStock] = useState("");
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
    if (!variant && !/^\d+$/.test(stock.trim())) {
      local.stock = "Enter a whole number";
    }

    const body = {
      images: images.map((i) => i.url),
      image_public_ids: images.map((i) => i.public_id),
      ...(!variant && { stock: Number(stock) }),
      selling_price: sellingCents ?? 0,
      ...(offerCents != null && {
        offer_price: offerCents,
        ...(fromLocalInput(offerEnds) && {
          offer_expires_at: fromLocalInput(offerEnds),
        }),
      }),
      is_default: isDefault,
      is_active: isActive,
      ...(!variant && {
        properties: properties
          .map((p) => ({ ...p, name: p.name.trim(), value: p.value.trim() }))
          .filter((p) => p.name || p.value),
      }),
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
            ? `SKU ${variant.sku ?? "none"}. Its options are fixed; add a new variant for another combination.`
            : "The options tell this variant apart, like Size M in Black. Prices are in dollars."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-7 px-6 py-6">
        {!variant && (
          <fieldset className="space-y-3">
            <legend className="eyebrow mb-3 !text-foreground">Options</legend>
            {properties.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_6.5rem_auto] items-start gap-2"
              >
                <Field data-invalid={Boolean(errors[`properties.${i}.name`])}>
                  <Input
                    value={p.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setProperties((ps) =>
                        ps.map((x, j) => (j === i ? { ...x, name } : x)),
                      );
                      clear(`properties.${i}.name`, "properties");
                    }}
                    placeholder="Option, e.g. Size"
                    aria-label={`Option ${i + 1} name`}
                    maxLength={20}
                    aria-invalid={Boolean(errors[`properties.${i}.name`])}
                  />
                  <FieldError>{errors[`properties.${i}.name`]}</FieldError>
                </Field>
                <Field data-invalid={Boolean(errors[`properties.${i}.value`])}>
                  <Input
                    value={p.value}
                    onChange={(e) => {
                      const value = e.target.value;
                      setProperties((ps) =>
                        ps.map((x, j) => (j === i ? { ...x, value } : x)),
                      );
                      clear(`properties.${i}.value`);
                    }}
                    placeholder={p.type === "color" ? "e.g. Black" : "e.g. M"}
                    aria-label={`${p.name || `Option ${i + 1}`} value`}
                    maxLength={20}
                    aria-invalid={Boolean(errors[`properties.${i}.value`])}
                  />
                  <FieldError>{errors[`properties.${i}.value`]}</FieldError>
                </Field>
                <Select
                  value={p.type}
                  onValueChange={(type) =>
                    type &&
                    setProperties((ps) =>
                      ps.map((x, j) =>
                        j === i ? { ...x, type: type as OptionType } : x,
                      ),
                    )
                  }
                  items={typeItems}
                >
                  <SelectTrigger
                    aria-label={`Option ${i + 1} type`}
                    className="h-10 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeItems.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setProperties((ps) => ps.filter((_, j) => j !== i));
                    setErrors({});
                  }}
                  aria-label={`Remove option ${i + 1}`}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            {errors.properties && (
              <p className="text-xs text-destructive">{errors.properties}</p>
            )}
            {properties.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setProperties((ps) => [
                    ...ps,
                    { name: "", value: "", type: "text" },
                  ])
                }
              >
                <PlusIcon data-icon="inline-start" />
                Add option
              </Button>
            )}
          </fieldset>
        )}

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
          {variant ? (
            <div className="space-y-2">
              <p className="eyebrow !text-foreground">Stock</p>
              <p className="flex h-10 items-center text-sm tabular-nums">
                {variant.stock}
                <span className="ml-2 text-xs text-muted-foreground">
                  Count it in the variants table.
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
          $
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
