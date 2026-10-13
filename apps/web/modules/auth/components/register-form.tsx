"use client";

import { AuthForm } from "./auth-form";
import { useRegister } from "../hooks/mutations/use-register";

export function RegisterForm() {
  const register = useRegister();

  return (
    <AuthForm
      mode="register"
      isPending={register.isPending}
      onSubmit={register.mutateAsync}
    />
  );
}
