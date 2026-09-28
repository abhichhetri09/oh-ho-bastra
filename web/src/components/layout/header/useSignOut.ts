import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { authClient } from "@/features/auth/auth-client";

/** Signs out, drops cached per-user data, and returns to the shop. */
export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    await authClient.signOut();
    queryClient.removeQueries({ queryKey: ["account"] });
    queryClient.removeQueries({ queryKey: ["admin"] });
    void navigate("/");
  };
}
