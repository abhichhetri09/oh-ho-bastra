import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import type { AdminProductDetail, ProductInput } from "@/features/admin/types";
import { slugPreview } from "./slug";
import { PhotosSection } from "./PhotosSection";
import { DetailsSection, PricingSection, SizesSection, SpecsSection } from "./sections";
import { useProductForm } from "./useProductForm";

/** Create/edit form for a product. `onSubmit` gets the API-shaped input. */
export function ProductForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: AdminProductDetail;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: ProductInput) => void;
}) {
  const form = useProductForm(initial);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.problems.length === 0) onSubmit(form.toInput());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <DetailsSection form={form} slugPreview={initial ? undefined : slugPreview(form.draft.name)} />
          <SpecsSection form={form} />
          <SizesSection form={form} />
        </div>
        <div className="space-y-6">
          <PricingSection form={form} />
          <PhotosSection form={form} />
        </div>
      </div>

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        {error || form.problems[0] ? (
          <p className="mr-auto text-sm text-danger" role="alert">
            {error ?? form.problems[0]}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || form.problems.length > 0}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
