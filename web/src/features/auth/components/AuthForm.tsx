import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FormField } from "@/components/ui/form-field";

export type AuthField = {
  id: string;
  label: string;
} & Pick<InputHTMLAttributes<HTMLInputElement>, "type" | "autoComplete" | "minLength">;

/** Card form for sign-in and sign-up. `onSubmit` / `onGoogle` resolve to an error message or null. */
export function AuthForm({
  title,
  description,
  fields,
  submitLabel,
  onSubmit,
  onGoogle,
  footer,
}: {
  title: string;
  description: string;
  fields: AuthField[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<string | null>;
  onGoogle?: () => Promise<string | null>;
  footer: ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const message = await onSubmit(values);
    setSubmitting(false);
    setError(message);
  }

  async function handleGoogle() {
    if (!onGoogle) return;
    setError(null);
    setGoogleSubmitting(true);
    const message = await onGoogle();
    setGoogleSubmitting(false);
    setError(message);
  }

  const busy = submitting || googleSubmitting;

  return (
    <PageShell>
      <section className="mx-auto max-w-sm space-y-4">
        <Eyebrow className="text-sm tracking-[0.16em]">Account</Eyebrow>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <CardContent className="space-y-4">
              {fields.map((field) => (
                <FormField
                  key={field.id}
                  required
                  {...field}
                  value={values[field.id] ?? ""}
                  onChange={(event) => setValues((v) => ({ ...v, [field.id]: event.target.value }))}
                />
              ))}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button type="submit" disabled={busy}>
                {submitting ? "Working…" : submitLabel}
              </Button>
              {onGoogle ? (
                <>
                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleGoogle()}
                  >
                    {googleSubmitting ? "Redirecting…" : "Continue with Google"}
                  </Button>
                </>
              ) : null}
              <p className="text-center text-sm text-muted-foreground">{footer}</p>
            </CardFooter>
          </form>
        </Card>
      </section>
    </PageShell>
  );
}
