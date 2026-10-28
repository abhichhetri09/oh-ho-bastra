"use client";

import { useMemo, useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { SaleResult, SaleTarget } from "@repo/types";
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
import { adminEndSale, adminPutOnSale } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { withoutErrors } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { categoryPath, orderTree } from "../lib/categories";
import { fromLocalInput, toLocalInput } from "../lib/datetime";
import {
  MAX_PERCENT_OFF,
  parsePercent,
  salePreview,
  saleSummary,
  saleTarget,
  type SaleScope,
} from "../lib/sale";
import { useCategoryTree } from "../queries";
import { ToggleField } from "./product-form";

/** "start" puts products on sale, "end" clears their offers. */
export type SaleMode = "start" | "end";

/**
 * Puts products on sale (or ends their sale) in one go: the selected rows,
 * a category or the whole catalog. The sale is written as each variant's
 * offer, so it shows everywhere an offer does and the editor can change it
 * afterwards.
 */
export function SaleDialog({
  mode,
  selectedIds,
  examplePrice,
  onClose,
  onDone,
}: {
  /** null when closed. */
  mode: SaleMode | null;
  selectedIds: readonly string[];
  /** A selling price (cents) to preview the discount on. */
  examplePrice: number;
  onClose: () => void;
  /** After a successful write, e.g. to clear the selection. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {mode !== null && (
          <SaleForm
            key={mode}
            mode={mode}
            selectedIds={selectedIds}
            examplePrice={examplePrice}
            onBusyChange={setBusy}
            onCancel={onClose}
            onDone={() => {
              onDone();
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaleForm({
  mode,
  selectedIds,
  examplePrice,
  onBusyChange,
  onCancel,
  onDone,
}: {
  mode: SaleMode;
  selectedIds: readonly string[];
  examplePrice: number;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const ending = mode === "end";
  const tree = useCategoryTree();
  const categories = useMemo(() => {
    const nodes = tree.data ?? [];
    return orderTree(nodes).map((c) => ({
      value: c.id,
      label: categoryPath(nodes, c.id),
      name: c.name,
      depth: c.depth,
    }));
  }, [tree.data]);

  const [scope, setScope] = useState<SaleScope>(
    selectedIds.length ? "selected" : "category",
  );
  const [categoryId, setCategoryId] = useState("");
  const [subcategories, setSubcategories] = useState(true);
  const [percent, setPercent] = useState("20");
  const [ends, setEnds] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useAdminMutation({
    mutationFn: async (vars: {
      target: SaleTarget;
      percent_off: number;
      ends_at?: string;
    }): Promise<SaleResult> => {
      if (ending) {
        const { data } = await adminEndSale({
          body: { target: vars.target },
          throwOnError: true,
        });
        return data.data;
      }
      const { data } = await adminPutOnSale({ body: vars, throwOnError: true });
      return data.data;
    },
    quietOnFieldErrors: true,
    failure: ending ? "Couldn't end the sale." : "Couldn't start the sale.",
    success: (result) => saleSummary(result, ending),
    // every admin query (the default): prices show in the editor, the
    // inventory and the dashboard too
    onSuccess: () => {
      onBusyChange(false);
      onDone();
    },
  });

  function clear(...fields: string[]) {
    setErrors((e) => withoutErrors(e, ...fields));
  }

  const count = selectedIds.length;
  const scopes: { value: SaleScope; label: string; disabled?: boolean }[] = [
    {
      value: "selected",
      label: `Selected products (${count})`,
      disabled: count === 0,
    },
    { value: "category", label: "A category" },
    { value: "all", label: "All products" },
  ];
  const parsedPercent = parsePercent(percent);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const target = saleTarget(scope, {
      productIds: selectedIds,
      categoryId,
      includeSubcategories: subcategories,
    });
    if (!target) local.target = "Choose a category";
    if (!ending && parsedPercent === null) {
      local.percent_off = `Enter a whole number from 1 to ${MAX_PERCENT_OFF}`;
    }
    const endsAt = fromLocalInput(ends);
    if (!ending && endsAt && Date.parse(endsAt) <= Date.now()) {
      local.ends_at = "Pick a time in the future";
    }
    if (Object.keys(local).length > 0 || !target) {
      setErrors(local);
      return;
    }
    setErrors({});
    onBusyChange(true);
    save.mutate(
      {
        target,
        percent_off: parsedPercent ?? 0,
        ...(endsAt && { ends_at: endsAt }),
      },
      {
        onError: (error) => {
          onBusyChange(false);
          // target.product_ids.0 and the like are shown on the scope
          const fields = mapFieldErrors(getApiError(error)?.errors);
          const targetError = Object.entries(fields).find(([k]) =>
            k.startsWith("target"),
          )?.[1];
          setErrors({
            ...fields,
            ...(targetError && { target: targetError }),
          });
        },
      },
    );
  }

  // The earliest end a browser offers: now, to the minute.
  const now = toLocalInput(new Date().toISOString());

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader className="gap-1 border-b border-border px-6 py-5">
        <DialogTitle className="font-serif text-2xl font-normal">
          {ending ? "End a sale" : "Put on sale"}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {ending
            ? "Clears the offer of every variant, back to the full price. Offers set in the editor go too."
            : "Every variant gets the discount as its offer, replacing any it had. Change one later in the product editor."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 px-6 py-6">
        <Field data-invalid={Boolean(errors.target)}>
          <FieldLabel
            id="sale-scope-label"
            className="eyebrow !text-foreground"
          >
            Products
          </FieldLabel>
          <RadioGroup
            value={scope}
            onValueChange={(value) => {
              setScope(value as SaleScope);
              clear("target");
            }}
            aria-labelledby="sale-scope-label"
            className="grid gap-2"
          >
            {scopes.map((s) => (
              <Radio.Root
                key={s.value}
                value={s.value}
                disabled={s.disabled || save.isPending}
                className="group flex items-center gap-3 rounded-control border border-border px-3 py-2.5 text-left text-[0.8125rem] transition-colors outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/50 data-checked:border-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50"
              >
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input group-data-checked:border-primary">
                  <Radio.Indicator className="size-2 rounded-full bg-primary" />
                </span>
                {s.label}
              </Radio.Root>
            ))}
          </RadioGroup>
          {scope === "category" && (
            <div className="animate-rise space-y-4 pt-2">
              <Select
                value={categoryId || null}
                onValueChange={(value) => {
                  if (!value) return;
                  setCategoryId(value);
                  clear("target");
                }}
                items={categories}
              >
                <SelectTrigger
                  aria-label="Category"
                  className="h-10 w-full"
                  aria-invalid={Boolean(errors.target)}
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
              <ToggleField
                id="sale-subcategories"
                label="Include subcategories"
                description="Also the products of every category under it."
                checked={subcategories}
                onChange={setSubcategories}
              />
            </div>
          )}
          <FieldError>{errors.target}</FieldError>
        </Field>

        {!ending && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.percent_off)}>
              <FieldLabel
                htmlFor="sale-percent"
                className="eyebrow !text-foreground"
              >
                Percent off
              </FieldLabel>
              <Input
                id="sale-percent"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_PERCENT_OFF}
                step={1}
                value={percent}
                onChange={(e) => {
                  setPercent(e.target.value);
                  clear("percent_off");
                }}
                aria-invalid={Boolean(errors.percent_off)}
              />
              <FieldError>{errors.percent_off}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.ends_at)}>
              <FieldLabel
                htmlFor="sale-ends"
                className="eyebrow !text-foreground"
              >
                Ends
                <span className="ml-1 tracking-normal normal-case text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Input
                id="sale-ends"
                type="datetime-local"
                value={ends}
                min={now}
                onChange={(e) => {
                  setEnds(e.target.value);
                  clear("ends_at");
                }}
                aria-invalid={Boolean(errors.ends_at)}
              />
              <FieldError>{errors.ends_at}</FieldError>
            </Field>
          </div>
        )}

        {!ending && (
          <p
            aria-live="polite"
            className={cn(
              "rounded-control bg-surface px-3 py-2.5 text-xs tabular-nums",
              parsedPercent === null && "text-muted-foreground",
            )}
          >
            {parsedPercent === null
              ? "Enter a discount to see the new prices."
              : salePreview(parsedPercent, examplePrice)}
          </p>
        )}
      </div>

      <DialogFooter className="sticky bottom-0 border-t border-border bg-popover px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant={ending ? "destructive" : "default"}
          disabled={save.isPending}
        >
          {save.isPending
            ? ending
              ? "Ending…"
              : "Saving…"
            : ending
              ? "End sale"
              : "Put on sale"}
        </Button>
      </DialogFooter>
    </form>
  );
}
