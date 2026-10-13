"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResetPasswordBodySchema } from "@repo/types";
import { PasswordInput } from "@/components/forms/password-input";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { logout, resetPassword } from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { LOGIN_PATH } from "@/lib/auth/redirect";
import { useAuth } from "@/providers/auth-provider";

const FORGOT_PATH = "/auth/forgot";

/**
 * Sets a new password from the emailed link (?token=). The API signs the
 * account out everywhere, so this browser signs out too, then goes to sign
 * in with the new password.
 */
export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedIn = useAuth((s) => Boolean(s.user));
  const setUser = useAuth((s) => s.setUser);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [linkDead, setLinkDead] = useState(false);
  const { ref: formRef, focusFirstError } = useFocusFirstError();

  const reset = useMutation({
    mutationFn: async (body: { token: string; password: string }) => {
      const { data } = await resetPassword({ body, throwOnError: true });
      return data.message;
    },
    onSuccess: async (message) => {
      // Its session was just revoked: drop the cookies and cached data.
      if (signedIn) await logout({}).catch(() => undefined);
      queryClient.clear();
      setUser(null);
      toast.success(message);
      router.replace(LOGIN_PATH);
      router.refresh();
    },
    onError: (err) => {
      const apiError = getApiError(err);
      if (apiError?.code === "INVALID_RESET_TOKEN") {
        setLinkDead(true);
        return;
      }
      const fields = mapFieldErrors(apiError?.errors);
      if (fields.password) {
        setError(fields.password);
        focusFirstError();
        return;
      }
      toast.error(apiError?.message ?? "Couldn't change your password.");
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ResetPasswordBodySchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(
        parsed.error.issues.find((i) => i.path[0] === "password")?.message,
      );
      focusFirstError();
      return;
    }
    setError(undefined);
    reset.mutate(parsed.data);
  }

  if (!token || linkDead) {
    return (
      <div className="w-full max-w-sm space-y-6" role="status">
        <p className="eyebrow animate-rise">Reset link</p>
        <h1 className="display animate-rise text-5xl sm:text-6xl">
          Link <em>expired.</em>
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {token
            ? "This link has expired or was already used. Each link works once, for an hour."
            : "This link is incomplete. Open it straight from the email, or ask for a new one."}
        </p>
        <Link href={FORGOT_PATH} className={buttonVariants({ size: "lg" })}>
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="w-full max-w-sm"
    >
      <div className="mb-10 space-y-3">
        <p className="eyebrow animate-rise">Reset your password</p>
        <h1
          className="display animate-rise text-5xl sm:text-6xl"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          Choose a <em>new one.</em>
        </h1>
        <p
          className="animate-rise text-sm text-muted-foreground"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          Your other devices get signed out too. Then sign in here with the new
          one.
        </p>
      </div>

      <FieldGroup>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="password" className="eyebrow !text-foreground">
            New password
          </FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(undefined);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "password-error" : "password-hint"}
          />
          {!error && (
            <FieldDescription id="password-hint" className="text-xs">
              8 to 72 characters.
            </FieldDescription>
          )}
          <FieldError key={error} id="password-error" className="animate-rise">
            {error}
          </FieldError>
        </Field>
        <Button
          className="mt-2 w-full"
          size="lg"
          type="submit"
          disabled={reset.isPending}
        >
          {reset.isPending ? "Saving…" : "Set new password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
