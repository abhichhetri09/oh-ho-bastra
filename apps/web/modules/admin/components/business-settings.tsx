"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BUSINESS_LIMITS, type BusinessDetailsBody } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminSetBusinessDetails } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { revalidateStoreSettings } from "../actions";

type Key = keyof BusinessDetailsBody;

const FIELDS: {
  key: Key;
  label: string;
  hint: string;
  placeholder: string;
  multiline?: boolean;
  type?: string;
  wide?: boolean;
}[] = [
  {
    key: "business_name",
    label: "Business name",
    hint: "Your registered name, as on your toiminimi or company registration.",
    placeholder: "Oh Ho Bastra / Firstname Lastname",
    wide: true,
  },
  {
    key: "business_id",
    label: "Business ID (Y-tunnus)",
    hint: "Shown in the footer and on the legal pages.",
    placeholder: "1234567-8",
  },
  {
    key: "business_phone",
    label: "Phone (optional)",
    hint: "Leave empty to show email only.",
    placeholder: "+358 40 123 4567",
    type: "tel",
  },
  {
    key: "business_email",
    label: "Customer email",
    hint: "Where shoppers reach you about orders and returns.",
    placeholder: "hello@ohhobastra.fi",
    type: "email",
    wide: true,
  },
  {
    key: "business_address",
    label: "Address",
    hint: "One line per line. Returns are sent here.",
    placeholder: "Street 1\n00100 Helsinki\nFinland",
    multiline: true,
    wide: true,
  },
];

/**
 * The seller's details (name, business ID, address, email, phone) that the
 * storefront shows in its footer, contact page and legal pages. EU law
 * wants them on the site, so empty ones are flagged.
 */
export function BusinessSettings({
  initial,
}: {
  initial: BusinessDetailsBody;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (body: BusinessDetailsBody) => {
      const { data } = await adminSetBusinessDetails({
        body,
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: async (settings) => {
      const next = pick(settings);
      setSaved(next);
      setValues(next);
      setErrors({});
      toast.success("Business details saved");
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      const api = getApiError(error);
      setErrors(mapFieldErrors(api?.errors));
      toast.error(api?.message ?? "Couldn't save the details. Try again.");
    },
  });

  const busy = save.isPending;
  const dirty = FIELDS.some(({ key }) => values[key] !== saved[key]);
  const missing = (
    [
      "business_name",
      "business_id",
      "business_address",
      "business_email",
    ] as const
  ).filter((key) => !saved[key].trim());

  const update = (key: Key, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  return (
    <section className="mt-6 overflow-hidden rounded-panel border border-border bg-card">
      <header className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="text-[0.8125rem] font-medium">Business details</h2>
        <p className="text-xs text-muted-foreground">
          Shown in the shop&apos;s footer, contact page, terms of sale and
          privacy policy.
        </p>
      </header>

      {missing.length > 0 && (
        <p className="mx-5 mt-5 rounded-panel bg-surface px-4 py-3 text-xs text-muted-foreground">
          EU consumer law requires your business name, business ID, address and
          email on the shop. Fill these in before you take real orders.
        </p>
      )}

      <div className="grid gap-5 p-5 sm:grid-cols-2">
        {FIELDS.map(
          ({ key, label, hint, placeholder, multiline, type, wide }) => {
            const id = `business-${key}`;
            const error = errors[key];
            const props = {
              id,
              value: values[key],
              placeholder,
              maxLength: BUSINESS_LIMITS[key],
              disabled: busy,
              "aria-invalid": Boolean(error) || undefined,
            };
            return (
              <Field
                key={key}
                data-invalid={Boolean(error)}
                className={cn(wide && "sm:col-span-2")}
              >
                <FieldLabel htmlFor={id} className="text-[0.8125rem]">
                  {label}
                </FieldLabel>
                {multiline ? (
                  <Textarea
                    {...props}
                    rows={3}
                    onChange={(e) => update(key, e.target.value)}
                  />
                ) : (
                  <Input
                    {...props}
                    type={type ?? "text"}
                    autoComplete="off"
                    onChange={(e) => update(key, e.target.value)}
                  />
                )}
                {error ? (
                  <FieldError className="animate-rise">{error}</FieldError>
                ) : (
                  <FieldDescription className="text-xs">
                    {hint}
                  </FieldDescription>
                )}
              </Field>
            );
          },
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
        <Button
          variant="outline"
          disabled={busy || !dirty}
          onClick={() => {
            setValues(saved);
            setErrors({});
          }}
        >
          Discard
        </Button>
        <Button disabled={busy || !dirty} onClick={() => save.mutate(values)}>
          {busy ? "Saving…" : "Save details"}
        </Button>
      </footer>
    </section>
  );
}

const pick = (s: BusinessDetailsBody): BusinessDetailsBody => ({
  business_name: s.business_name,
  business_id: s.business_id,
  business_address: s.business_address,
  business_email: s.business_email,
  business_phone: s.business_phone,
});
