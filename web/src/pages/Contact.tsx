import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Mail, Send } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <textarea
                id="note"
                name="note"
                required
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
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
