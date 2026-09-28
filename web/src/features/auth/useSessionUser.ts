import { authClient, getSessionUser } from "./auth-client";

export function useSessionUser() {
  const { data, isPending } = authClient.useSession();
  const user = getSessionUser(data);
  return { user, isPending, isAdmin: user?.role === "admin" };
}
