import { Link, useLocation, useNavigate } from "react-router-dom";

import { authClient } from "@/features/auth/auth-client";
import { AuthForm, type AuthField } from "@/features/auth/components/AuthForm";
import { GuestOnly } from "@/features/auth/components/GuestOnly";
import { signInWithGoogle } from "@/features/auth/signInWithGoogle";
import { safeNext } from "@/lib/redirect";

const fields: AuthField[] = [
  { id: "email", label: "Email", type: "email", autoComplete: "email" },
  { id: "password", label: "Password", type: "password", autoComplete: "current-password", minLength: 8 },
];

export function SignIn() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const next = safeNext(search);

  async function signIn({ email = "", password = "" }: Record<string, string>) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) return error.message ?? "Could not sign in.";
    void navigate(next, { replace: true });
    return null;
  }

  return (
    <GuestOnly>
      <AuthForm
        title="Sign in"
        description="Use the email you registered with, or continue with Google."
        fields={fields}
        submitLabel="Sign in"
        onSubmit={signIn}
        onGoogle={() => signInWithGoogle(next)}
        footer={
          <>
            No account?{" "}
            <Link to={`/sign-up${search}`} className="text-foreground underline">
              Sign up
            </Link>
          </>
        }
      />
    </GuestOnly>
  );
}
