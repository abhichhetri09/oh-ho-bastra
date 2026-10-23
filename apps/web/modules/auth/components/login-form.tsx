"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthForm } from "./auth-form";
import { useLogin } from "../hooks/mutations/use-login";

/** What the API's ?google_error= codes mean to the shopper. */
const GOOGLE_ERRORS: Record<string, string> = {
  unavailable: "Signing in with Google isn't available right now.",
  cancelled: "Google sign-in was cancelled.",
  unverified: "Your Google account's email isn't verified yet.",
  exists:
    "An account already uses that email. Sign in with your password instead.",
  failed: "Couldn't sign in with Google. Try again.",
};

export function LoginForm() {
  const login = useLogin();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const googleError = searchParams.get("google_error");

  // Show the error once, then drop it from the url so a reload doesn't repeat it.
  useEffect(() => {
    if (!googleError) return;
    toast.error(GOOGLE_ERRORS[googleError] ?? GOOGLE_ERRORS.failed);
    const rest = new URLSearchParams(searchParams);
    rest.delete("google_error");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [googleError, pathname, router, searchParams]);

  return (
    <AuthForm
      mode="login"
      isPending={login.isPending}
      onSubmit={login.mutateAsync}
    />
  );
}
