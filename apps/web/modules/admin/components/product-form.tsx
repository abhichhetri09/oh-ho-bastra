"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { ProductBodySchema, type Product, type ProductBody } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminCreateProduct, adminUpdateProduct } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { friendlyFieldErrors, withoutErrors } from "@/lib/forms";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { categoryPath, orderTree } from "../lib/categories";
import type { StoredImage } from "../lib/upload";
import { useCategoryTree } from "../queries";
import { ImageManager } from "./image-manager";
import { Panel } from "./panel";

const MAX_FEATURES = 7;

type Values = {
  name: string;
  description: string;
  category_id: string;
  features: string[];
  is_active: boolean;
  is_featured: boolean;
};

const labels: Record<string, string> = {
  name: "a name",
  description: "a description",
  category_id: "a category",
  images: "at least one image",
};

function valuesOf(product: Product | undefined): Values {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    category_id: product?.category_id ?? "",
    features: product?.features ?? [],
    is_active: product?.is_active ?? true,
    is_featured: product?.is_featured ?? false,
  };
}

function imagesOf(product: Product | undefined): StoredImage[] {
  return (product?.images ?? []).map((url, i) => ({
    url,
    public_id: product?.image_public_ids[i] ?? "",
  }));
}

function bodyOf(values: Values, images: StoredImage[]): ProductBody {
  return {
    ...values,
    features: values.features.map((f) => f.trim()).filter(Boolean),
    images: images.map((i) => i.url),
    image_public_ids: images.map((i) => i.public_id),
  };
}

/**
 * Creates a product or edits one. Every field is sent on save (the API's
 * PUT replaces the product). A new product moves to its edit page, where
 * its variants are added: until it has a default variant the store
 * doesn't list it.
 */
export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tree = useCategoryTree();
  const [values, setValues] = useState(() => valuesOf(product));
  const [images, setImages] = useState(() => imagesOf(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(() =>
    JSON.stringify(bodyOf(valuesOf(product), imagesOf(product))),
  );

  const body = bodyOf(values, images);
  const dirty = JSON.stringify(body) !== saved;

  // Leaving with unsaved edits asks first (reloads and closing the tab).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const categories = useMemo(() => {
    const nodes = tree.data ?? [];
    return orderTree(nodes).map((c) => ({
      value: c.id,
      label: categoryPath(nodes, c.id),
      name: c.name,
      depth: c.depth,
    }));
  }, [tree.data]);

  const save = useAdminMutation({
    mutationFn: async (next: ProductBody) => {
      const { data } = product
        ? await adminUpdateProduct({
            path: { productID: product.id },
            body: next,
            throwOnError: true,
          })
        : await adminCreateProduct({ body: next, throwOnError: true });
      return data.data;
    },
    quietOnFieldErrors: true,
    failure: "Couldn't save the product.",
    success: product
      ? "Product saved"
      : "Product created. Now add its variants.",
    invalidate: [
      adminKeys.products(),
      adminKeys.stats(),
      adminKeys.inventory(),
      adminKeys.counts(),
    ],
    onSuccess: (saved) => {
      setSaved(JSON.stringify(bodyOf(valuesOf(saved), imagesOf(saved))));
      queryClient.setQueryData(adminKeys.product(saved.id), saved);
      if (!product) router.replace(`/admin/products/${saved.id}#variants`);
    },
  });

  function set<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => withoutErrors(e, field));
  }

  function setFeature(i: number, value: string) {
    setValues((v) => ({
      ...v,
      features: v.features.map((f, j) => (j === i ? value : f)),
    }));
    setErrors((e) => withoutErrors(e, `features.${i}`));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ProductBodySchema.safeParse(body);
    if (!parsed.success) {
      setErrors(friendlyFieldErrors(parsed.error, labels));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onError: (error) => setErrors(mapFieldErrors(getApiError(error)?.errors)),
    });
  }

  const imageError = errors.images ?? errors.image_public_ids;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start"
    >
      <div className="space-y-6">
        <Panel title="Details">
          <div className="space-y-5">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel
                htmlFor="product-name"
                className="eyebrow !text-foreground"
              >
                Name
              </FieldLabel>
              <Input
                id="product-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={50}
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError key={errors.name} className="animate-rise">
                {errors.name}
              </FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel
                htmlFor="product-description"
                className="eyebrow !text-foreground"
              >
                Description
              </FieldLabel>
              <Textarea
                id="product-description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={5000}
                rows={6}
                aria-invalid={Boolean(errors.description)}
              />
              <FieldError key={errors.description} className="animate-rise">
                {errors.description}
              </FieldError>
            </Field>
          </div>
        </Panel>

        <Panel title="Images" hint={`${images.length} of 5`}>
          <ImageManager
            images={images}
            onChange={(update) => {
              setImages(update);
              setErrors((e) => withoutErrors(e, "images", "image_public_ids"));
            }}
            invalid={Boolean(imageError)}
            onUploadingChange={setUploading}
            label={values.name || "Product image"}
          />
          {imageError && (
            <p className="animate-rise mt-3 text-xs text-destructive">
              {imageError}
            </p>
          )}
        </Panel>

        <Panel
          title="Features"
          hint={`${values.features.length} of ${MAX_FEATURES}`}
        >
          <div className="space-y-2">
            {values.features.map((feature, i) => (
              <Field key={i} data-invalid={Boolean(errors[`features.${i}`])}>
                <div className="flex gap-2">
                  <Input
                    value={feature}
                    onChange={(e) => setFeature(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (values.features.length < MAX_FEATURES) {
                          set("features", [...values.features, ""]);
                        }
                      }
                    }}
                    maxLength={100}
                    aria-label={`Feature ${i + 1}`}
                    aria-invalid={Boolean(errors[`features.${i}`])}
                    autoFocus={
                      i === values.features.length - 1 && feature === ""
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      set(
                        "features",
                        values.features.filter((_, j) => j !== i),
                      )
                    }
                    aria-label={`Remove feature ${i + 1}`}
                  >
                    <XIcon />
                  </Button>
                </div>
                <FieldError>{errors[`features.${i}`]}</FieldError>
              </Field>
            ))}
            {values.features.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Short points shown under the description, such as &ldquo;100%
                organic linen&rdquo;.
              </p>
            )}
            {values.features.length < MAX_FEATURES && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("features", [...values.features, ""])}
              >
                <PlusIcon data-icon="inline-start" />
                Add feature
              </Button>
            )}
          </div>
        </Panel>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24">
        <Panel title="Organisation">
          <Field data-invalid={Boolean(errors.category_id)}>
            <FieldLabel
              htmlFor="product-category"
              className="eyebrow !text-foreground"
            >
              Category
            </FieldLabel>
            <Select
              value={values.category_id || null}
              onValueChange={(value) => value && set("category_id", value)}
              items={categories}
            >
              <SelectTrigger
                id="product-category"
                className="h-10 w-full"
                aria-invalid={Boolean(errors.category_id)}
              >
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span style={{ paddingLeft: `${c.depth}rem` }}>
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError key={errors.category_id} className="animate-rise">
              {errors.category_id}
            </FieldError>
          </Field>
        </Panel>

        <Panel title="Visibility">
          <div className="space-y-5">
            <ToggleField
              id="product-active"
              label="Active"
              description="Shown in the store and can be bought."
              checked={values.is_active}
              onChange={(checked) => set("is_active", checked)}
            />
            <ToggleField
              id="product-featured"
              label="Featured"
              description="Picked for the home page."
              checked={values.is_featured}
              onChange={(checked) => set("is_featured", checked)}
            />
          </div>
        </Panel>

        <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 xl:static xl:mx-0 xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={
              save.isPending || uploading || (Boolean(product) && !dirty)
            }
          >
            {save.isPending
              ? "Saving…"
              : uploading
                ? "Uploading…"
                : product
                  ? dirty
                    ? "Save changes"
                    : "Saved"
                  : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ToggleField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field
      orientation="horizontal"
      className="items-start justify-between gap-4"
    >
      <div className="space-y-1">
        <FieldLabel htmlFor={id} className="text-[0.8125rem]">
          {label}
        </FieldLabel>
        <FieldDescription className="text-xs">{description}</FieldDescription>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
        className="mt-0.5"
      />
    </Field>
  );
}
