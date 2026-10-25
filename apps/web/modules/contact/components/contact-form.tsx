"use client";

import { useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CheckCircleIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import {
  CONTACT_LIMITS,
  CONTACT_TOPIC_LABELS,
  CONTACT_TOPICS,
  ContactBodySchema,
  type ContactBody,
  type ContactTopic,
} from "@repo/types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendContactMessage } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

type Values = {
  name: string;
  email: string;
  topic: ContactTopic;
  order_number: string;
  message: string;
  website: string;
};

const EMPTY: Values = {
  name: "",
  email: "",
  topic: "order",
  order_number: "",
  message: "",
  website: "",
};

/** Topics where an order number helps us find the order. */
const ORDER_TOPICS: ContactTopic[] = ["order", "return"];

/**
 * The contact form: validated in the browser with the API's own schema,
 * then emailed to the store. A hidden "website" field catches bots.
 */
export function ContactForm({ defaults }: { defaults?: Partial<Values> }) {
  const [values, setValues] = useState<Values>({ ...EMPTY, ...defaults });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async (body: ContactBody) => {
      await sendContactMessage({ body, throwOnError: true });
    },
    onSuccess: () => setSentTo(values.email.trim()),
    onError: (error) => {
      const api = getApiError(error);
      setErrors({
        ...mapFieldErrors(api?.errors),
        form: api?.errors?.length
          ? ""
          : (api?.message ??
            "We couldn't send your message. Please try again."),
      });
    },
  });

  const update = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      delete next.form;
      return next;
    });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      ...values,
      order_number: ORDER_TOPICS.includes(values.topic)
        ? values.order_number.trim() || undefined
        : undefined,
      website: values.website || undefined,
    };
    const parsed = ContactBodySchema.safeParse(body);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    send.mutate(parsed.data);
  };

  if (sentTo) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center gap-5 rounded-panel border border-border bg-card p-8 text-center sm:p-12">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10">
          <CheckCircleIcon weight="fill" className="size-8 text-success" />
        </span>
        <div className="space-y-2">
          <h2 className="display text-3xl">Message sent.</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Thanks for getting in touch. We&apos;ll reply to{" "}
            <span className="text-foreground">{sentTo}</span>, usually within
            one to two working days.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setValues({ ...EMPTY, name: values.name, email: values.email });
            setSentTo(null);
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  const busy = send.isPending;
  const showOrder = ORDER_TOPICS.includes(values.topic);
  const length = values.message.trim().length;

  return (
    <form
      noValidate
      onSubmit={submit}
      className="rounded-panel border border-border bg-card p-6 sm:p-8"
    >
      <div className="mb-8 space-y-1.5">
        <h2 className="font-serif text-2xl sm:text-3xl">Send us a message</h2>
        <p className="text-sm text-muted-foreground">
          Fields marked * are required.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel
            htmlFor="contact-name"
            className="eyebrow !text-foreground"
          >
            Name *
          </FieldLabel>
          <Input
            id="contact-name"
            name="name"
            autoComplete="name"
            value={values.name}
            maxLength={CONTACT_LIMITS.name}
            onChange={(e) => update("name", e.target.value)}
            aria-invalid={Boolean(errors.name)}
            disabled={busy}
          />
          <FieldError key={errors.name} className="animate-rise">
            {errors.name}
          </FieldError>
        </Field>

        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel
            htmlFor="contact-email"
            className="eyebrow !text-foreground"
          >
            Email *
          </FieldLabel>
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            maxLength={CONTACT_LIMITS.email}
            onChange={(e) => update("email", e.target.value)}
            aria-invalid={Boolean(errors.email)}
            disabled={busy}
          />
          <FieldError key={errors.email} className="animate-rise">
            {errors.email}
          </FieldError>
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel
            id="contact-topic-label"
            className="eyebrow !text-foreground"
          >
            What&apos;s it about? *
          </FieldLabel>
          <RadioGroup
            value={values.topic}
            onValueChange={(value) => update("topic", value as ContactTopic)}
            aria-labelledby="contact-topic-label"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {CONTACT_TOPICS.map((topic) => (
              <Radio.Root
                key={topic}
                value={topic}
                disabled={busy}
                className="rounded-control border border-border px-3 py-2.5 text-left text-[0.8125rem] transition-colors outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/50 data-checked:border-foreground data-checked:bg-foreground data-checked:text-background"
              >
                {CONTACT_TOPIC_LABELS[topic]}
              </Radio.Root>
            ))}
          </RadioGroup>
        </Field>

        {showOrder && (
          <Field
            data-invalid={Boolean(errors.order_number)}
            className="animate-rise sm:col-span-2"
          >
            <FieldLabel
              htmlFor="contact-order"
              className="eyebrow !text-foreground"
            >
              Order number
              <span className="ml-1 normal-case tracking-normal text-muted-foreground">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="contact-order"
              name="order_number"
              placeholder="OHB-1042"
              value={values.order_number}
              maxLength={CONTACT_LIMITS.order_number}
              onChange={(e) => update("order_number", e.target.value)}
              aria-invalid={Boolean(errors.order_number)}
              disabled={busy}
            />
            <FieldError key={errors.order_number} className="animate-rise">
              {errors.order_number}
            </FieldError>
          </Field>
        )}

        <Field data-invalid={Boolean(errors.message)} className="sm:col-span-2">
          <FieldLabel
            htmlFor="contact-message"
            className="eyebrow !text-foreground"
          >
            Message *
          </FieldLabel>
          <Textarea
            id="contact-message"
            name="message"
            rows={6}
            value={values.message}
            maxLength={CONTACT_LIMITS.message}
            placeholder={
              values.topic === "custom"
                ? "Tell us about your design: the text or artwork, colours, sizes and quantity."
                : "How can we help?"
            }
            onChange={(e) => update("message", e.target.value)}
            aria-invalid={Boolean(errors.message)}
            disabled={busy}
          />
          <div className="flex items-start justify-between gap-4">
            <FieldError key={errors.message} className="animate-rise">
              {errors.message}
            </FieldError>
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-[0.625rem] text-muted-foreground",
                length > CONTACT_LIMITS.message * 0.9 && "text-destructive",
              )}
            >
              {length}/{CONTACT_LIMITS.message}
            </span>
          </div>
        </Field>

        {/* Hidden from people; bots fill it in and are dropped. */}
        <div
          aria-hidden
          className="absolute -left-[9999px] h-0 overflow-hidden"
        >
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => update("website", e.target.value)}
          />
        </div>
      </div>

      {errors.form && (
        <p
          role="alert"
          className="mt-6 rounded-control bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errors.form}
        </p>
      )}

      <div className="mt-8 flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          We use your details only to reply to you.
        </p>
        <Button type="submit" size="lg" disabled={busy}>
          <PaperPlaneTiltIcon />
          {busy ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
