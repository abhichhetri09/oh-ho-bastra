"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LoginBody } from "@repo/types";
import { login } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { homeFor, safeNextPath } from "@/lib/auth/redirect";
import { useAuth } from "@/providers/auth-provider";

export function useLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const setUser = useAuth((s) => s.setUser);

  return useMutation({
    mutationFn: (body: LoginBody) => login({ body, throwOnError: true }),
    onSuccess: ({ data }) => {
      // Drop anything cached for the previous (anonymous) visitor.
      queryClient.clear();
      setUser(data.data);
      toast.success(data.message);
      router.replace(
        safeNextPath(searchParams.get("next")) ?? homeFor(data.data.role),
      );
      router.refresh();
    },
    onError: (error) => {
      toast.error(getApiError(error)?.message ?? "Failed to sign in");
    },
  });
}
