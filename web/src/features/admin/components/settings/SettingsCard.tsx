import type { FormEvent, ReactNode } from "react";

import { Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app-shell/Panel";

/** A settings section: title, fields, and a save bar that appears once something changes. */
export function SettingsCard({
  title,
  description,
  form,
  children,
}: {
  title: string;
  description: string;
  form: { dirty: boolean; saving: boolean; error: string | null; justSaved: boolean; save: () => void; reset: () => void };
  children: ReactNode;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    form.save();
  }

  return (
    <form onSubmit={onSubmit}>
      <Panel
        title={title}
        description={description}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3 bg-muted/30 px-4 py-3">
            {form.error ? (
              <p className="mr-auto text-sm text-danger" role="alert">
                {form.error}
              </p>
            ) : form.justSaved ? (
              <p className="mr-auto flex items-center gap-1.5 text-sm text-success" role="status">
                <Check className="size-4" aria-hidden />
                Saved
              </p>
            ) : form.dirty ? (
              <p className="mr-auto text-sm text-muted-foreground">Unsaved changes</p>
            ) : null}
            <Button type="button" variant="ghost" onClick={form.reset} disabled={!form.dirty || form.saving}>
              Discard
            </Button>
            <Button type="submit" disabled={!form.dirty || form.saving}>
              {form.saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">{children}</div>
      </Panel>
    </form>
  );
}
