import { useState, type FormEvent } from "react";

import { Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useUpdateName } from "@/features/account/api";
import type { SessionUser } from "@/features/auth/auth-client";
import { Panel } from "@/components/app-shell/Panel";

export function ProfileForm({ user }: { user: SessionUser }) {
  const [name, setName] = useState(user.name);
  const update = useUpdateName();
  const dirty = name.trim() !== user.name && name.trim().length > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate(name.trim());
  }

  return (
    <Panel title="Profile" description="How we address you on orders and emails.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="name" label="Name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          <FormField id="email" label="Email" value={user.email} disabled readOnly />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          {update.isSuccess && !dirty ? (
            <span className="flex items-center gap-1 text-sm text-success" role="status">
              <Check className="size-4" aria-hidden />
              Saved
            </span>
          ) : null}
          {update.isError ? <span className="text-sm text-destructive">{update.error.message}</span> : null}
        </div>
      </form>
    </Panel>
  );
}
