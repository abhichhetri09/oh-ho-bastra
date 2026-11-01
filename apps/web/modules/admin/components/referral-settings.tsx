"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ReferralBodySchema,
  type ReferralBody,
  type ReferralFriendKind,
  type ReferralRule,
} from "@repo/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { adminSetReferrals } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { fromCents, toCents } from "@/lib/money";
import { referralPerk } from "@/lib/referrals";
import { cn } from "@/lib/utils";
import { revalidateStoreSettings } from "../actions";

type Values = {
  enabled: boolean;
  friendKind: ReferralFriendKind;
  /** Euros for an amount, a whole percent otherwise. */
  friendValue: string;
  /** Euros, or "" for no minimum. */
  friendMin: string;
  reward: string;
  payAfterDays: string;
  customPrints: boolean;
  /** Whole referrals, or "" for no limit. */
  monthlyCap: string;
  creditMaxPercent: string;
  /** Whole months, or "" for credit that never lapses. */
  creditExpiryMonths: string;
};

/** The form's strings for a rule (euros for amounts, digits otherwise). */
const toValues = (rule: ReferralRule): Values => ({
  enabled: rule.enabled,
  friendKind: rule.friend_kind,
  friendValue:
    rule.friend_kind === "percent"
      ? String(rule.friend_value)
      : fromCents(rule.friend_value),
  friendMin: rule.friend_min === null ? "" : fromCents(rule.friend_min),
  reward: fromCents(rule.reward),
  payAfterDays: String(rule.pay_after_days),
  customPrints: rule.custom_prints,
  monthlyCap: rule.monthly_cap === null ? "" : String(rule.monthly_cap),
  creditMaxPercent: String(rule.credit_max_percent),
  creditExpiryMonths:
    rule.credit_expiry_months === null ? "" : String(rule.credit_expiry_months),
});

/** A whole number from digits, or null for an empty field. */
const whole = (value: string) => (value === "" ? null : Number(value));

/**
 * The form's euros as the API's cents, with what's wrong with them by
 * field (the schema's messages, or how to write an amount).
 */
function toBody(values: Values): {
  body: ReferralBody | null;
  errors: Record<string, string>;
} {
  const percent = values.friendKind === "percent";
  const friendValue = percent
    ? whole(values.friendValue)
    : toCents(values.friendValue);
  const friendMin = values.friendMin === "" ? null : toCents(values.friendMin);
  const reward = toCents(values.reward);
  const errors: Record<string, string> = {};
  if (friendValue === null)
    errors.friend_value = percent
      ? "Enter a percent, like 10"
      : "Enter an amount, like 5";
  if (values.friendMin !== "" && friendMin === null)
    errors.friend_min = "Enter an amount, like 30, or leave it empty";
  if (reward === null) errors.reward = "Enter an amount, like 5";
  if (values.payAfterDays === "")
    errors.pay_after_days = "Enter a number of days, like 30 or 0";
  if (values.creditMaxPercent === "")
    errors.credit_max_percent = "Enter a percent, like 30";
  if (Object.keys(errors).length > 0) return { body: null, errors };
  const parsed = ReferralBodySchema.safeParse({
    enabled: values.enabled,
    friend_kind: values.friendKind,
    friend_value: friendValue,
    friend_min: friendMin,
    reward,
    pay_after_days: whole(values.payAfterDays),
    custom_prints: values.customPrints,
    monthly_cap: whole(values.monthlyCap),
    credit_max_percent: whole(values.creditMaxPercent),
    credit_expiry_months: whole(values.creditExpiryMonths),
  });
  if (parsed.success) return { body: parsed.data, errors };
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    errors[key] ??= issue.message;
  }
  return { body: null, errors };
}

/** The body as the rule it saves (nulls for what's left out). */
const toRule = (body: ReferralBody): ReferralRule => ({
  ...body,
  friend_min: body.friend_min ?? null,
  monthly_cap: body.monthly_cap ?? null,
  credit_expiry_months: body.credit_expiry_months ?? null,
});

const sameRule = (a: ReferralRule, b: ReferralRule) =>
  (Object.keys(a) as (keyof ReferralRule)[]).every((k) => a[k] === b[k]);

/**
 * The referral programme: whether it runs, what a referred friend gets off
 * their first order (euros or a percent, from an optional minimum), the
 * credit the referrer earns and when it's paid, and the limits on credit.
 * Referrals already made keep the rule they were made under.
 */
export function ReferralSettings({ initial }: { initial: ReferralRule }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(() => toValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (body: ReferralBody) => {
      const { data } = await adminSetReferrals({ body, throwOnError: true });
      return data.data.referrals;
    },
    onSuccess: async (rule) => {
      setSaved(rule);
      setValues(toValues(rule));
      setErrors({});
      toast.success("Referral programme saved");
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      const api = getApiError(error);
      setErrors(mapFieldErrors(api?.errors));
      toast.error(
        api?.message ?? "Couldn't save the referral programme. Try again.",
      );
    },
  });

  const busy = save.isPending;
  const { body } = toBody(values);
  const dirty = body === null || !sameRule(toRule(body), saved);
  // The perk follows the form while it reads as a rule.
  const shown: ReferralRule = body ? toRule(body) : saved;

  const change = (next: Partial<Values>, field: string) => {
    setValues((v) => ({ ...v, ...next }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[field];
      return rest;
    });
  };
  const amount = (value: string) => value.replace(/[^\d.]/g, "").slice(0, 10);
  const digits = (value: string, max: number) =>
    value.replace(/\D/g, "").slice(0, max);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const result = toBody(values);
    setErrors(result.errors);
    if (result.body) save.mutate(result.body);
  }

  const percent = values.friendKind === "percent";

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_18rem]">
      <form
        className="overflow-hidden rounded-panel border border-border bg-card"
        onSubmit={submit}
        noValidate
      >
        <fieldset className="p-5 sm:p-6">
          <legend className="sr-only">Referrals</legend>
          <label className="mb-5 flex w-fit cursor-pointer items-center gap-2.5 text-[0.8125rem] font-medium">
            <Switch
              checked={values.enabled}
              onCheckedChange={(enabled) => change({ enabled }, "enabled")}
              disabled={busy}
            />
            Run the referral programme
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.friend_value)}>
              <FieldLabel
                htmlFor="referral-friend-value"
                className="text-[0.8125rem]"
              >
                Friend&apos;s discount
              </FieldLabel>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  {percent ? (
                    <UnitInput
                      id="referral-friend-value"
                      unit="%"
                      after
                      value={values.friendValue}
                      placeholder="e.g. 10"
                      onChange={(v) =>
                        change({ friendValue: digits(v, 2) }, "friend_value")
                      }
                      disabled={busy}
                      invalid={Boolean(errors.friend_value)}
                    />
                  ) : (
                    <UnitInput
                      id="referral-friend-value"
                      unit="€"
                      value={values.friendValue}
                      placeholder="e.g. 5"
                      onChange={(v) =>
                        change({ friendValue: amount(v) }, "friend_value")
                      }
                      disabled={busy}
                      invalid={Boolean(errors.friend_value)}
                    />
                  )}
                </div>
                <div
                  className="flex shrink-0 gap-1"
                  role="group"
                  aria-label="Discount in"
                >
                  {(["amount", "percent"] as const).map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      variant={
                        values.friendKind === kind ? "default" : "outline"
                      }
                      aria-pressed={values.friendKind === kind}
                      disabled={busy}
                      onClick={() =>
                        values.friendKind !== kind &&
                        change(
                          { friendKind: kind, friendValue: "" },
                          "friend_value",
                        )
                      }
                    >
                      {kind === "amount" ? "€" : "%"}
                    </Button>
                  ))}
                </div>
              </div>
              {errors.friend_value ? (
                <FieldError className="animate-rise">
                  {errors.friend_value}
                </FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  Off a referred friend&apos;s first order; a percent is 50% at
                  most.
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(errors.friend_min)}>
              <FieldLabel
                htmlFor="referral-friend-min"
                className="text-[0.8125rem]"
              >
                Friend&apos;s minimum order (€)
              </FieldLabel>
              <UnitInput
                id="referral-friend-min"
                unit="€"
                value={values.friendMin}
                placeholder="e.g. 30, or empty for none"
                onChange={(v) => change({ friendMin: amount(v) }, "friend_min")}
                disabled={busy}
                invalid={Boolean(errors.friend_min)}
              />
              {errors.friend_min ? (
                <FieldError className="animate-rise">
                  {errors.friend_min}
                </FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  The subtotal the friend&apos;s order needs for the discount.
                </FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(errors.reward)}>
              <FieldLabel
                htmlFor="referral-reward"
                className="text-[0.8125rem]"
              >
                Referrer&apos;s credit (€)
              </FieldLabel>
              <UnitInput
                id="referral-reward"
                unit="€"
                value={values.reward}
                placeholder="e.g. 5"
                onChange={(v) => change({ reward: amount(v) }, "reward")}
                disabled={busy}
                invalid={Boolean(errors.reward)}
              />
              {errors.reward ? (
                <FieldError className="animate-rise">
                  {errors.reward}
                </FieldError>
              ) : (
                <FieldDescription className="text-xs">
                  Store credit for each friend who orders.
                </FieldDescription>
              )}
            </Field>

            <NumberField
              id="referral-pay-after-days"
              label="Pay credit after (days)"
              value={values.payAfterDays}
              placeholder="e.g. 30"
              onChange={(v) =>
                change({ payAfterDays: digits(v, 3) }, "pay_after_days")
              }
              disabled={busy}
              error={errors.pay_after_days}
              hint="After the friend's order, so returns settle first; 0 pays at once."
            />

            <NumberField
              id="referral-monthly-cap"
              label="Monthly cap (referrals)"
              value={values.monthlyCap}
              placeholder="e.g. 10, or empty for no limit"
              onChange={(v) =>
                change({ monthlyCap: digits(v, 3) }, "monthly_cap")
              }
              disabled={busy}
              error={errors.monthly_cap}
              hint="The most friends a referrer earns credit for a month."
            />

            <NumberField
              id="referral-credit-max-percent"
              label="Credit pays at most (%)"
              value={values.creditMaxPercent}
              placeholder="e.g. 30"
              onChange={(v) =>
                change({ creditMaxPercent: digits(v, 3) }, "credit_max_percent")
              }
              disabled={busy}
              error={errors.credit_max_percent}
              hint="Of an order's total; the rest is paid as usual."
            />

            <NumberField
              id="referral-credit-expiry-months"
              label="Credit lapses after (months)"
              value={values.creditExpiryMonths}
              placeholder="e.g. 12, or empty for never"
              onChange={(v) =>
                change(
                  { creditExpiryMonths: digits(v, 2) },
                  "credit_expiry_months",
                )
              }
              disabled={busy}
              error={errors.credit_expiry_months}
              hint="Unused credit expires this long after it's paid."
            />
          </div>

          <label className="mt-5 flex w-fit cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
            <Checkbox
              checked={values.customPrints}
              onCheckedChange={(customPrints) =>
                change({ customPrints }, "custom_prints")
              }
              disabled={busy}
            />
            The friend&apos;s discount applies to custom prints too
          </label>
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
            {busy ? "Saving…" : "Save referrals"}
          </Button>
        </footer>
      </form>

      <aside className="2xl:self-start">
        <div className="overflow-hidden rounded-panel border border-border bg-card">
          <p className="eyebrow border-b border-border px-5 py-3">
            Shoppers see
          </p>
          <div className="space-y-3 p-5 text-[0.8125rem] leading-relaxed">
            <p className="font-medium">
              {shown.enabled ? referralPerk(shown) : "Nothing while it's off"}
            </p>
            <p className="text-muted-foreground">
              Referrals already made keep the rule they were made under.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** A whole number with its label, and its error or a hint under it. */
function NumberField({
  id,
  label,
  value,
  placeholder,
  onChange,
  disabled,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
  hint: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id} className="text-[0.8125rem]">
        {label}
      </FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className="h-10"
      />
      {error ? (
        <FieldError className="animate-rise">{error}</FieldError>
      ) : (
        <FieldDescription className="text-xs">{hint}</FieldDescription>
      )}
    </Field>
  );
}

/** An amount with its unit, € in front or % after. */
function UnitInput({
  id,
  unit,
  after = false,
  value,
  onChange,
  disabled,
  invalid,
  placeholder,
}: {
  id: string;
  unit: string;
  after?: boolean;
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
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
          after ? "right-3" : "left-3",
          disabled && "opacity-50",
        )}
      >
        {unit}
      </span>
      <Input
        id={id}
        inputMode={after ? "numeric" : "decimal"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn("tabular-nums", after ? "pr-7" : "pl-7")}
      />
    </div>
  );
}
