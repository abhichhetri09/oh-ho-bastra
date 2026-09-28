import { Link, useLocation, useNavigate } from "react-router-dom";

import { authClient } from "@/features/auth/auth-client";
import { AuthForm, type AuthField } from "@/features/auth/components/AuthForm";
import { GuestOnly } from "@/features/auth/components/GuestOnly";
import { signInWithGoogle } from "@/features/auth/signInWithGoogle";
import { safeNext } from "@/lib/redirect";

const fields: AuthField[] = [
  { id: "name", label: "Name", autoComplete: "name" },
  { id: "email", label: "Email", type: "email", autoComplete: "email" },
  { id: "password", label: "Password", type: "password", autoComplete: "new-password", minLength: 8 },
];

export function SignUp() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const next = safeNext(search);

  async function signUp({ name = "", email = "", password = "" }: Record<string, string>) {
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) return error.message ?? "Could not sign up.";
    void navigate(next, { replace: true });
    return null;
  }

  return (
    <GuestOnly>
      <AuthForm
        title="Sign up"
        description="Create an account to shop with us, or continue with Google."
        fields={fields}
        submitLabel="Create account"
        onSubmit={signUp}
        onGoogle={() => signInWithGoogle(next)}
        footer={
          <>
            Already have an account?{" "}
            <Link to={`/sign-in${search}`} className="text-foreground underline">
              Sign in
            </Link>
          </>
        }
      />
    </GuestOnly>
  );
}
