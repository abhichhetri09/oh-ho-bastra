"use client";

import { AuthForm } from "./auth-form";
import { useLogin } from "../hooks/mutations/use-login";

export function LoginForm() {
  const login = useLogin();

  return (
    <AuthForm
      mode="login"
      isPending={login.isPending}
      onSubmit={login.mutateAsync}
    />
  );
}
