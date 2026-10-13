"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logout } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { isProtectedPath } from "@/lib/proxy/config";
import { useAuth } from "@/providers/auth-provider";

export function useLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const setUser = useAuth((s) => s.setUser);

  return useMutation({
    mutationFn: () => logout({ throwOnError: true }),
    onSuccess: ({ data }) => {
      queryClient.clear();
      setUser(null);
      toast.success(data.message);
      if (isProtectedPath(pathname)) router.replace("/");
      router.refresh();
    },
    // The cookies are only cleared by a successful response, so stay
    // signed in rather than pretend.
    onError: (error) => {
      toast.error(getApiError(error)?.message ?? "Failed to sign out");
    },
  });
}
