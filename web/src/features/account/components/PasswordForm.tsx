import { useState, type FormEvent } from "react";

import { Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useChangePassword } from "@/features/account/api";
import { Panel } from "@/components/app-shell/Panel";

const fields = [
  { id: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { id: "newPassword", label: "New password", autoComplete: "new-password", minLength: 8 },
  { id: "confirmPassword", label: "Repeat new password", autoComplete: "new-password", minLength: 8 },
] as const;

type Values = Record<(typeof fields)[number]["id"], string>;
const empty: Values = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [values, setValues] = useState<Values>(empty);
  const change = useChangePassword();
  const mismatch = values.confirmPassword.length > 0 && values.confirmPassword !== values.newPassword;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mismatch) return;
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      { onSuccess: () => setValues(empty) },
    );
  }

  if (!hasPassword) {
    return (
      <Panel title="Password">
        <p className="text-sm text-muted-foreground">
          You sign in with Google, so there’s no password to change here.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Password" description="Changing it signs you out on your other devices.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {fields.map((field) => (
            <FormField
              key={field.id}
              type="password"
              required
              {...field}
              value={values[field.id]}
              onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
              aria-invalid={field.id === "confirmPassword" && mismatch}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={change.isPending || mismatch}>
            {change.isPending ? "Updating…" : "Update password"}
          </Button>
          {mismatch ? <span className="text-sm text-destructive">The new passwords don’t match.</span> : null}
          {change.isError ? <span className="text-sm text-destructive">{change.error.message}</span> : null}
          {change.isSuccess ? (
            <span className="flex items-center gap-1 text-sm text-success" role="status">
              <Check className="size-4" aria-hidden />
              Password updated
            </span>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
