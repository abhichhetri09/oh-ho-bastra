import { authClient } from "@/features/auth/auth-client";

/** Starts the Google OAuth redirect. Returns an error message, or null on success. */
export async function signInWithGoogle(callbackURL = "/account"): Promise<string | null> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL,
  });
  return error?.message ?? null;
}
