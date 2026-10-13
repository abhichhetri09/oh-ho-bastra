"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChangePasswordBodySchema,
  type PublicUser,
  UpdateProfileBodySchema,
} from "@repo/types";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { changePassword, updateProfile } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { friendlyFieldErrors } from "@/lib/forms";
import { useAuth } from "@/providers/auth-provider";

/** Account settings: the name, and the password. */
export function AccountSettings({ user }: { user: PublicUser }) {
  return (
    <div className="space-y-14">
      <header className="space-y-3">
        <p className="eyebrow animate-rise">Settings</p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          Your <em>details.</em>
        </h1>
      </header>
      <ProfileForm user={user} />
      <PasswordForm />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid max-w-3xl gap-6 border-t border-border pt-8 md:grid-cols-[14rem_1fr] md:gap-12">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(user.name);
  const [error, setError] = useState<string | undefined>();
  const { ref, focusFirstError } = useFocusFirstError();

  const save = useMutation({
    mutationFn: async (body: { name: string }) => {
      const { data } = await updateProfile({ body, throwOnError: true });
      return data;
    },
    onSuccess: ({ data, message }) => {
      setUser(data);
      setName(data.name);
      setSaved(data.name);
      toast.success(message);
      // Server-rendered parts (the overview greeting) read the new token.
      router.refresh();
    },
    onError: (err) => {
      const apiError = getApiError(err);
      const fields = mapFieldErrors(apiError?.errors);
      if (fields.name) {
        setError(fields.name);
        focusFirstError();
        return;
      }
      toast.error(apiError?.message ?? "Couldn't save your name.");
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = UpdateProfileBodySchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      focusFirstError();
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <Section
      title="Profile"
      description="Your name appears on orders and in the emails we send."
    >
      <form ref={ref} onSubmit={submit} noValidate className="max-w-sm">
        <FieldGroup>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="name" className="eyebrow !text-foreground">
              Name
            </FieldLabel>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(undefined);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "name-error" : undefined}
            />
            <FieldError key={error} id="name-error" className="animate-rise">
              {error}
            </FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="email" className="eyebrow !text-foreground">
              Email
            </FieldLabel>
            <Input id="email" value={user.email} readOnly disabled />
            <FieldDescription className="text-xs">
              Your email signs you in, so it can&apos;t be changed here.
            </FieldDescription>
          </Field>
          <Button
            type="submit"
            className="self-start"
            disabled={save.isPending || name.trim() === saved}
          >
            {save.isPending ? "Saving…" : "Save name"}
          </Button>
        </FieldGroup>
      </form>
    </Section>
  );
}

const EMPTY = { current_password: "", new_password: "" };

function PasswordForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { ref, focusFirstError } = useFocusFirstError();

  function fail(next: Record<string, string>) {
    setErrors(next);
    focusFirstError();
  }

  const change = useMutation({
    mutationFn: async (body: typeof EMPTY) => {
      const { data } = await changePassword({ body, throwOnError: true });
      return data.message;
    },
    onSuccess: (message) => {
      setValues(EMPTY);
      toast.success(message);
    },
    onError: (err) => {
      const apiError = getApiError(err);
      const fields = mapFieldErrors(apiError?.errors);
      if (Object.keys(fields).length > 0) {
        fail(fields);
        return;
      }
      toast.error(apiError?.message ?? "Couldn't change your password.");
    },
  });

  function update(field: keyof typeof EMPTY, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ChangePasswordBodySchema.safeParse(values);
    if (!parsed.success) {
      fail(
        friendlyFieldErrors(parsed.error, {
          current_password: "your current password",
          new_password: "a new password",
        }),
      );
      return;
    }
    setErrors({});
    change.mutate(parsed.data);
  }

  function field(
    name: keyof typeof EMPTY,
    label: string,
    autoComplete: string,
    hint?: string,
  ) {
    const error = errors[name];
    return (
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={name} className="eyebrow !text-foreground">
          {label}
        </FieldLabel>
        <PasswordInput
          id={name}
          name={name}
          autoComplete={autoComplete}
          value={values[name]}
          onChange={(e) => update(name, e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${name}-error` : hint ? `${name}-hint` : undefined
          }
        />
        {hint && !error && (
          <FieldDescription id={`${name}-hint`} className="text-xs">
            {hint}
          </FieldDescription>
        )}
        <FieldError key={error} id={`${name}-error`} className="animate-rise">
          {error}
        </FieldError>
      </Field>
    );
  }

  return (
    <Section
      title="Password"
      description="Changing it signs you out on your other devices; you stay signed in here."
    >
      <form ref={ref} onSubmit={submit} noValidate className="max-w-sm">
        <FieldGroup>
          {field("current_password", "Current password", "current-password")}
          {field(
            "new_password",
            "New password",
            "new-password",
            "8 to 72 characters.",
          )}
          <Button
            type="submit"
            className="self-start"
            disabled={change.isPending}
          >
            {change.isPending ? "Saving…" : "Change password"}
          </Button>
        </FieldGroup>
      </form>
    </Section>
  );
}
