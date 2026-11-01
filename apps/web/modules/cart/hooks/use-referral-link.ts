"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Cart } from "@repo/types";
import { applyCartReferral } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import {
  REF_COOKIE,
  REF_COOKIE_MAX_AGE,
  referralCodeFrom,
} from "@/lib/referrals";
import { useAuth } from "@/providers/auth-provider";
import { cartKeys } from "../keys";

/** The code a shared link left, or null. Client only. */
export function linkCode(): string | null {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${REF_COOKIE}=`))
    ?.slice(REF_COOKIE.length + 1);
  return referralCodeFrom(raw ? decodeURIComponent(raw) : null);
}

/** Forgets a shared link's code. Client only. */
export const clearLinkCode = () => {
  document.cookie = `${REF_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
};

/**
 * Keeps ?ref=CODE from any shop page, as /r/CODE does. Mounted once in
 * the shop's layout.
 */
export function useRefParam() {
  useEffect(() => {
    const code = referralCodeFrom(
      new URLSearchParams(window.location.search).get("ref"),
    );
    if (code)
      document.cookie = `${REF_COOKIE}=${code}; Max-Age=${REF_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  }, []);
}

/**
 * Puts a shared link's code on the bag once there is one to put it on.
 * The API decides whether it applies (a first order, not the referrer's
 * own), and a refusal says why; either way the link has done its job and
 * its cookie goes, unless the request didn't get an answer.
 */
export function useReferralLink(cart: Cart | undefined) {
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  const tried = useRef(false);

  useEffect(() => {
    if (!cart || !userId || cart.items.length === 0 || tried.current) return;
    const code = linkCode();
    if (!code) return;
    tried.current = true;
    if (cart.referral?.code === code) {
      clearLinkCode();
      return;
    }
    applyCartReferral({ body: { code }, throwOnError: true })
      .then(({ data }) => {
        queryClient.setQueryData(cartKeys.mine(userId), data.data);
        clearLinkCode();
      })
      .catch((error: unknown) => {
        const api = getApiError(error);
        if (!api) return;
        clearLinkCode();
        // Why the friend's link doesn't apply to them: their own, or not
        // a first order (an unknown code was said on arrival).
        if (api.code !== "REFERRAL_NOT_FOUND") toast(api.message);
      });
  }, [cart, userId, queryClient]);
}
