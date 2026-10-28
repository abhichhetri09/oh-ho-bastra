"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
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
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { revalidateStoreSettings } from "../actions";

type Key = keyof BusinessDetailsBody;

type FieldSpec = {
  key: Key;
  label: string;
  hint: string;
  placeholder: string;
  autoComplete: string;
  multiline?: boolean;
  type?: string;
  wide?: boolean;
};

const IDENTITY: FieldSpec[] = [
  {
    key: "business_name",
    label: "Business name",
    hint: "Your registered name, as on your toiminimi or company registration.",
    placeholder: "e.g. Oh Ho Bastra Oy",
    autoComplete: "organization",
    wide: true,
  },
  {
    key: "business_id",
    label: "Business ID (Y-tunnus)",
    hint: "Format 1234567-8. Shown in the footer and legal pages.",
    placeholder: "e.g. 1234567-8",
    autoComplete: "off",
  },
];

const CONTACT: FieldSpec[] = [
  {
    key: "business_email",
    label: "Customer email",
    hint: "Contact form messages are sent here too.",
    placeholder: "e.g. hello@ohhobastra.fi",
    autoComplete: "email",
    type: "email",
  },
  {
    key: "business_phone",
    label: "Phone",
    hint: "Optional. Leave empty to show email only.",
    placeholder: "e.g. +358 40 123 4567",
    autoComplete: "tel",
    type: "tel",
  },
  {
    key: "business_address",
    label: "Address",
    hint: "One line per line. Returns are sent here.",
    placeholder: "e.g. Street 1\n00100 Helsinki\nFinland",
    autoComplete: "street-address",
    multiline: true,
    wide: true,
  },
];

const REQUIRED: { key: Key; label: string }[] = [
  { key: "business_name", label: "Business name" },
  { key: "business_id", label: "Business ID" },
  { key: "business_address", label: "Address" },
  { key: "business_email", label: "Customer email" },
];

/**
 * The seller's details (name, business ID, address, email, phone) shown in
 * the shop's footer, contact page and legal pages, with a live preview of
 * how shoppers see them and a checklist of what EU law requires.
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
  const dirty = (Object.keys(values) as Key[]).some(
    (key) => values[key] !== saved[key],
  );
  const done = REQUIRED.filter(({ key }) => values[key].trim()).length;

  const update = (key: Key, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const renderField = (spec: FieldSpec) => {
    const id = `business-${spec.key}`;
    const error = errors[spec.key];
    const common = {
      id,
      name: spec.key,
      value: values[spec.key],
      placeholder: spec.placeholder,
      maxLength: BUSINESS_LIMITS[spec.key],
      autoComplete: spec.autoComplete,
      disabled: busy,
      "aria-invalid": Boolean(error) || undefined,
      "aria-describedby": `${id}-hint`,
    };
    return (
      <Field
        key={spec.key}
        data-invalid={Boolean(error)}
        className={cn(spec.wide && "sm:col-span-2")}
      >
        <FieldLabel htmlFor={id} className="text-[0.8125rem]">
          {spec.label}
        </FieldLabel>
        {spec.multiline ? (
          <Textarea
            {...common}
            rows={3}
            onChange={(e) => update(spec.key, e.target.value)}
          />
        ) : (
          <Input
            {...common}
            type={spec.type ?? "text"}
            onChange={(e) => update(spec.key, e.target.value)}
          />
        )}
        {error ? (
          <FieldError id={`${id}-hint`} className="animate-rise">
            {error}
          </FieldError>
        ) : (
          <FieldDescription id={`${id}-hint`} className="text-xs">
            {spec.hint}
          </FieldDescription>
        )}
      </Field>
    );
  };

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
      <form
        className="overflow-hidden rounded-panel border border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !busy) save.mutate(values);
        }}
      >
        <FormGroup
          title="Identity"
          description="Who's selling. Required on the site by EU consumer law."
        >
          {IDENTITY.map(renderField)}
        </FormGroup>
        <FormGroup
          title="Contact"
          description="How shoppers reach you about orders and returns."
        >
          {CONTACT.map(renderField)}
        </FormGroup>

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
              setValues(saved);
              setErrors({});
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save details"}
          </Button>
        </footer>
      </form>

      <aside className="grid items-start gap-6 sm:grid-cols-2 2xl:sticky 2xl:top-24 2xl:grid-cols-1 2xl:self-start">
        <div className="rounded-panel border border-border bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-[0.8125rem] font-medium">Required details</h3>
            <span className="font-mono text-xs text-muted-foreground">
              {done}/{REQUIRED.length}
            </span>
          </div>
          <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                done === REQUIRED.length ? "bg-success" : "bg-foreground",
              )}
              style={{ width: `${(done / REQUIRED.length) * 100}%` }}
            />
          </div>
          <ul className="space-y-2 text-[0.8125rem]">
            {REQUIRED.map(({ key, label }) => {
              const ok = Boolean(values[key].trim());
              return (
                <li key={key} className="flex items-center gap-2">
                  {ok ? (
                    <CheckCircleIcon
                      weight="fill"
                      className="size-4 text-success"
                    />
                  ) : (
                    <CircleIcon className="size-4 text-muted-foreground" />
                  )}
                  <span className={cn(!ok && "text-muted-foreground")}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <Preview values={values} />
      </aside>
    </div>
  );
}

/** A titled group of fields inside the form card. */
function FormGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-b border-border p-5 last-of-type:border-b-0 sm:p-6">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 space-y-1">
        <p className="text-[0.8125rem] font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** How the details read on the shop's contact page and footer, live. */
function Preview({ values }: { values: BusinessDetailsBody }) {
  const address = values.business_address
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const empty =
    !values.business_name && !values.business_email && address.length === 0;
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-card">
      <p className="eyebrow border-b border-border px-5 py-3">Shoppers see</p>
      <div className="space-y-5 p-5">
        <div className="space-y-1 text-[0.8125rem] leading-relaxed">
          {empty ? (
            <p className="text-muted-foreground">
              Nothing yet. Fill in the form to see your contact card.
            </p>
          ) : (
            <>
              {values.business_name && (
                <p className="font-medium">{values.business_name}</p>
              )}
              {values.business_id && (
                <p className="text-muted-foreground">
                  Y-tunnus {values.business_id}
                </p>
              )}
              {address.map((line) => (
                <p key={line} className="text-muted-foreground">
                  {line}
                </p>
              ))}
              {values.business_email && (
                <p className="underline underline-offset-4">
                  {values.business_email}
                </p>
              )}
              {values.business_phone && <p>{values.business_phone}</p>}
            </>
          )}
        </div>
        <div className="rounded-control bg-surface px-3 py-2 text-[0.6875rem] text-muted-foreground">
          Footer: © {new Date().getUTCFullYear()} {site.name}
          {values.business_name && values.business_name !== site.name
            ? ` · ${values.business_name}`
            : ""}
          {values.business_id ? ` · Y-tunnus ${values.business_id}` : ""}
        </div>
      </div>
    </div>
  );
}

const pick = (s: BusinessDetailsBody): BusinessDetailsBody => ({
  business_name: s.business_name,
  business_id: s.business_id,
  business_address: s.business_address,
  business_email: s.business_email,
  business_phone: s.business_phone,
});
