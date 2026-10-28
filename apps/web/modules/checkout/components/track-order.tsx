"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { CheckoutEmailSchema, type OrderDetail } from "@repo/types";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { parseOrderNumber } from "../lib/orders";
import { lookupOrderByEmail } from "../queries";
import { OrderDetails } from "./orders-view";

type Values = { number: string; email: string };

/**
 * Order tracking without an account: the order number and the email it
 * was placed with show the order, read-only (its timeline, items and
 * address). A wrong email reads as an unknown number.
 */
export function TrackOrder({ initialNumber }: { initialNumber: string }) {
  const [values, setValues] = useState<Values>({
    number: initialNumber,
    email: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const { ref: formRef, focusFirstError } = useFocusFirstError();

  const lookup = useMutation({
    mutationFn: lookupOrderByEmail,
    onSuccess: setOrder,
    onError: (error) => {
      const apiError = getApiError(error);
      const fields = mapFieldErrors(apiError?.errors);
      setErrors(
        Object.keys(fields).length > 0
          ? fields
          : {
              form:
                apiError?.code === "ORDER_NOT_FOUND"
                  ? "We couldn't find an order with that number and email. Check both against your confirmation email."
                  : (apiError?.message ??
                    "Couldn't look up your order. Try again."),
            },
      );
      focusFirstError();
    },
  });

  function change(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field] && !current.form) return current;
      const rest = { ...current };
      delete rest[field];
      delete rest.form;
      return rest;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = parseOrderNumber(values.number);
    const email = CheckoutEmailSchema.safeParse(values.email.trim());
    const next: Record<string, string> = {};
    if (!number) next.number = "Enter the order number, like OHB-1042";
    if (!email.success) {
      next.email = values.email.trim()
        ? "Enter a valid email address"
        : "Enter the email you ordered with";
    }
    if (!number || !email.success) {
      setErrors(next);
      focusFirstError();
      return;
    }
    setErrors({});
    lookup.mutate({ number, email: email.data });
  }

  if (order) {
    return (
      <OrderDetails
        order={order}
        back={
          <button
            type="button"
            onClick={() => setOrder(null)}
            className="link-underline text-xs text-muted-foreground hover:text-foreground"
          >
            Look up another order
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
      <header className="max-w-xl space-y-4">
        <p className="eyebrow animate-rise">Orders</p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          Track an <em>order.</em>
        </h1>
        <p
          className="animate-rise text-sm text-muted-foreground"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          Enter your order number and the email you ordered with. Both are in
          your confirmation email. Have an account?{" "}
          <Link
            href="/account/orders"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Your orders
          </Link>{" "}
          are all there.
        </p>
      </header>

      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        className="animate-rise"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.number)}>
            <FieldLabel
              htmlFor="track-number"
              className="eyebrow !text-foreground"
            >
              Order number
            </FieldLabel>
            <Input
              id="track-number"
              name="number"
              placeholder="OHB-1042"
              autoComplete="off"
              value={values.number}
              onChange={(e) => change("number", e.target.value)}
              aria-invalid={Boolean(errors.number)}
              aria-describedby={
                errors.number ? "track-number-error" : undefined
              }
            />
            <FieldError
              key={errors.number}
              id="track-number-error"
              className="animate-rise"
            >
              {errors.number}
            </FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel
              htmlFor="track-email"
              className="eyebrow !text-foreground"
            >
              Email
            </FieldLabel>
            <Input
              id="track-email"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => change("email", e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "track-email-error" : undefined}
            />
            <FieldError
              key={errors.email}
              id="track-email-error"
              className="animate-rise"
            >
              {errors.email}
            </FieldError>
          </Field>
          {errors.form && (
            <p className="animate-rise text-sm text-clay" role="alert">
              {errors.form}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={lookup.isPending}
          >
            <MagnifyingGlassIcon />
            {lookup.isPending ? "Looking it up…" : "Find my order"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
