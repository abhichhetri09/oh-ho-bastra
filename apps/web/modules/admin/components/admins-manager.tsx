"use client";

import { useState } from "react";
import { AddAdminBodySchema, type AdminUser } from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminAddAdmin, adminRemoveAdmin } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminAdmins } from "../queries";

/**
 * Who can use the admin: the list, a form that makes an existing account
 * an admin by email, and removing one (not yourself, never the last).
 */
export function AdminsManager() {
  const me = useAuth((s) => s.user);
  const admins = useAdminAdmins();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  const add = useAdminMutation({
    mutationFn: async (body: { email: string }) => {
      const { data } = await adminAddAdmin({ body, throwOnError: true });
      return data.data;
    },
    success: (admin) => `${admin.name} is now an admin`,
    failure: "Couldn't add the admin. Try again.",
    invalidate: [adminKeys.admins()],
    quietOnFieldErrors: true,
    onSuccess: () => {
      setEmail("");
      setError(null);
    },
  });

  const remove = useAdminMutation({
    mutationFn: async (admin: AdminUser) => {
      const { data } = await adminRemoveAdmin({
        path: { userID: admin.id },
        throwOnError: true,
      });
      return data.data;
    },
    success: (admin) => `${admin.name} is no longer an admin`,
    failure: "Couldn't remove the admin. Try again.",
    invalidate: [adminKeys.admins()],
    onSuccess: () => setRemoving(null),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (add.isPending) return;
    const parsed = AddAdminBodySchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setError(null);
    add.mutate(parsed.data, {
      onError: (err) => {
        const api = getApiError(err);
        if (api?.errors?.length) setError(api.errors[0]!.message);
      },
    });
  }

  const list = admins.data ?? [];
  const onlyOne = list.length <= 1;

  return (
    <div className="space-y-6">
      <form
        className="overflow-hidden rounded-panel border border-border bg-card"
        onSubmit={submit}
        noValidate
      >
        <div className="p-5 sm:p-6">
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="admin-email" className="text-[0.8125rem]">
              Add an admin
            </FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="admin-email"
                type="email"
                autoComplete="off"
                value={email}
                placeholder="their.account@email.com"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                disabled={add.isPending}
                aria-invalid={Boolean(error)}
                className="h-10 sm:flex-1"
              />
              <Button type="submit" disabled={add.isPending || !email.trim()}>
                {add.isPending ? "Adding…" : "Make admin"}
              </Button>
            </div>
            {error ? (
              <FieldError className="animate-rise">{error}</FieldError>
            ) : (
              <FieldDescription className="text-xs">
                The email of an existing account. They get full access to the
                admin the next time they sign in (or within 15 minutes).
              </FieldDescription>
            )}
          </Field>
        </div>
      </form>

      <div className="overflow-hidden rounded-panel border border-border bg-card">
        <p className="eyebrow border-b border-border px-5 py-3">
          Admins{admins.data ? ` · ${list.length}` : ""}
        </p>
        {admins.isPending ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : admins.isError ? (
          <p className="p-5 text-[0.8125rem] text-muted-foreground">
            Couldn&apos;t load the admins.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => admins.refetch()}
            >
              Try again
            </button>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((admin) => {
              const isMe = admin.id === me?.id;
              return (
                <li
                  key={admin.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-medium">
                      {admin.name}
                      {isMe && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {admin.email}
                    </p>
                  </div>
                  {!isMe && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={onlyOne || remove.isPending}
                      onClick={() => setRemoving(admin)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this admin?"
        description={
          removing && (
            <>
              <span className="text-foreground">{removing.name}</span> becomes a
              regular customer and is signed out everywhere. Their orders and
              account stay.
            </>
          )
        }
        confirmLabel="Remove admin"
        pending={remove.isPending}
        pendingLabel="Removing…"
        onConfirm={() =>
          removing &&
          remove.mutate(removing, { onError: () => setRemoving(null) })
        }
      />
    </div>
  );
}
