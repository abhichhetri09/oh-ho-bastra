import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Mail, Send } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";

const fields = [
  { id: "name", label: "Name", autoComplete: "name" },
  { id: "email", label: "Email", type: "email", autoComplete: "email" },
];

export function Contact() {
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <PageShell>
      <section className="grid gap-12 lg:grid-cols-2">
        <PageHeader
          kicker="Contact"
          title="Contact"
          description="Ask about a size, a custom print, or a small run."
        />
        {sent ? (
          <p className="flex items-center gap-2 self-center text-muted-foreground">
            <Mail className="size-4" strokeWidth={1.5} aria-hidden />
            Received. We will write back.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="max-w-md space-y-5">
            {fields.map((field) => (
              <FormField key={field.id} required {...field} />
            ))}
            <FormField id="note" label="Note">
              <Textarea id="note" name="note" required rows={4} />
            </FormField>
            <Button type="submit">
              <Send />
              Send
            </Button>
          </form>
        )}
      </section>
    </PageShell>
  );
}
