"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShippingBodySchema,
  type ShippingBody,
  type ShippingRule,
} from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { adminSetShipping } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { fromCents, toCents } from "@/lib/money";
import { shippingExample, shippingPerk } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import { revalidateStoreSettings } from "../actions";

type Values = { flat: string; freeFrom: string; neverFree: boolean };

/** The form's euro strings for a rule (no threshold when it's never free). */
const toValues = (rule: ShippingRule): Values => ({
  flat: fromCents(rule.flat),
  freeFrom: rule.free_from === null ? "" : fromCents(rule.free_from),
  neverFree: rule.free_from === null,
});

/**
 * The form's euros as the API's cents, with what's wrong with them by
 * field (the schema's messages, or how to write an amount).
 */
function toBody(values: Values): {
  body: ShippingBody | null;
  errors: Record<string, string>;
} {
  const flat = toCents(values.flat);
  const freeFrom = values.neverFree ? null : toCents(values.freeFrom);
  const errors: Record<string, string> = {};
  if (flat === null) errors.flat = "Enter an amount, like 4.90 or 0";
  if (!values.neverFree && freeFrom === null)
    errors.free_from = "Enter an amount, like 60, or switch on Never free";
  if (flat === null || (!values.neverFree && freeFrom === null))
    return { body: null, errors };
  const parsed = ShippingBodySchema.safeParse({ flat, free_from: freeFrom });
  if (parsed.success) return { body: parsed.data, errors };
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    errors[key] ??= issue.message;
  }
  return { body: null, errors };
}

/**
 * What delivery costs: a flat price, free from a subtotal (counted after
 * any discount code) unless it's never free. Saving reprices every bag and
 * checkout from then on, and the store's copy follows; placed orders keep
 * what they were charged.
 */
export function DeliverySettings({ initial }: { initial: ShippingRule }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(() => toValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (body: ShippingBody) => {
      const { data } = await adminSetShipping({ body, throwOnError: true });
      return data.data.shipping;
    },
    onSuccess: async (rule) => {
      setSaved(rule);
      setValues(toValues(rule));
      setErrors({});
      toast.success("Delivery price saved");
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      const api = getApiError(error);
      setErrors(mapFieldErrors(api?.errors));
      toast.error(
        api?.message ?? "Couldn't save the delivery price. Try again.",
      );
    },
  });

  const busy = save.isPending;
  const { body } = toBody(values);
  const dirty =
    body === null ||
    body.flat !== saved.flat ||
    (body.free_from ?? null) !== saved.free_from;
  // The example follows the form while it reads as a rule.
  const shown: ShippingRule = body
    ? { flat: body.flat, free_from: body.free_from ?? null }
    : saved;

  const change = (next: Partial<Values>, field: string) => {
    setValues((v) => ({ ...v, ...next }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[field];
      return rest;
    });
  };
  const amount = (value: string) => value.replace(/[^\d.]/g, "").slice(0, 10);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const result = toBody(values);
    setErrors(result.errors);
    if (result.body) save.mutate(result.body);
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
      <form
        className="overflow-hidden rounded-panel border border-border bg-card"
        onSubmit={submit}
        noValidate
      >
        <fieldset className="p-5 sm:p-6">
          <legend className="sr-only">Delivery</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.flat)}>
              <FieldLabel htmlFor="delivery-flat" className="text-[0.8125rem]">
                Delivery price (€)
              </FieldLabel>
              <EuroInput
                id="delivery-flat"
                value={values.flat}
                onChange={(v) => change({ flat: amount(v) }, "flat")}
                disabled={busy}
                invalid={Boolean(errors.flat)}
              />
              {errors.flat ? (
                <FieldError className="animate-rise">{errors.flat}</FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  0 ships every order free.
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(errors.free_from)}>
              <FieldLabel
                htmlFor="delivery-free-from"
                className="text-[0.8125rem]"
              >
                Free delivery from (€)
              </FieldLabel>
              <EuroInput
                id="delivery-free-from"
                value={values.neverFree ? "" : values.freeFrom}
                placeholder={values.neverFree ? "Never" : "e.g. 60"}
                onChange={(v) => change({ freeFrom: amount(v) }, "free_from")}
                disabled={busy || values.neverFree}
                invalid={Boolean(errors.free_from)}
              />
              {errors.free_from && (
                <FieldError className="animate-rise">
                  {errors.free_from}
                </FieldError>
              )}
              <label className="flex w-fit cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
                <Switch
                  checked={values.neverFree}
                  onCheckedChange={(neverFree) =>
                    change({ neverFree }, "free_from")
                  }
                  disabled={busy}
                  size="sm"
                />
                Never free
              </label>
            </Field>
          </div>
          <p
            className="mt-5 rounded-control bg-surface px-3 py-2 text-xs"
            aria-live="polite"
          >
            {shippingExample(shown)}
          </p>
        </fieldset>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/40 px-5 py-4">
          {dirty && (
            <p className="mr-auto text-xs text-muted-foreground" role="status">
              Unsaved changes
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => {
              setValues(toValues(saved));
              setErrors({});
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save delivery"}
          </Button>
        </footer>
      </form>

      <aside className="2xl:self-start">
        <div className="overflow-hidden rounded-panel border border-border bg-card">
          <p className="eyebrow border-b border-border px-5 py-3">
            Shoppers see
          </p>
          <div className="space-y-3 p-5 text-[0.8125rem] leading-relaxed">
            <p className="font-medium">{shippingPerk(shown)}</p>
            <p className="text-muted-foreground">
              On the home page, product pages, the bag&apos;s free delivery bar
              and the terms of sale. Placed orders keep what they paid.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** An amount in euros, with the € in front. */
function EuroInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground",
          disabled && "opacity-50",
        )}
      >
        €
      </span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="pl-7 tabular-nums"
      />
    </div>
  );
}
