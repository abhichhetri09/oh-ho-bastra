"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GiftIcon, XIcon } from "@phosphor-icons/react";
import type { ReferralOffer } from "@repo/types";
import { getReferralOffer } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { referralWelcome } from "@/lib/referrals";
import { cn } from "@/lib/utils";
import {
  clearLinkCode,
  linkCode,
  useRefParam,
} from "../hooks/use-referral-link";
import { useCart } from "../queries";

// Per browser: the welcome is shown in full once per code, then as a slim
// reminder; dismissing it hides it for that code. Storage can be off
// (private windows): then the welcome shows in full each visit.
const SEEN_KEY = "ohb_ref_seen";
const DISMISSED_KEY = "ohb_ref_dismissed";

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The banner just shows again next time.
  }
}

/**
 * The welcome for a shopper who came through a friend's link (/r/CODE or
 * ?ref=CODE): what the link gives them, in full on arrival, then a slim
 * reminder on later pages until the bag has the code or they dismiss it.
 * A link that isn't valid, or the programme being off, is said once and
 * the link forgotten.
 */
export function ReferralWelcome() {
  useRefParam();
  const [offer, setOffer] = useState<ReferralOffer | null>(null);
  const [full, setFull] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { data: cart } = useCart();

  useEffect(() => {
    // After useRefParam's effect, so ?ref=CODE is in the cookie.
    const code = linkCode();
    if (!code || stored(DISMISSED_KEY) === code) return;
    let cancelled = false;
    getReferralOffer({ path: { code }, throwOnError: true })
      .then(({ data }) => {
        if (cancelled) return;
        setFull(stored(SEEN_KEY) !== code);
        store(SEEN_KEY, code);
        setOffer(data.data);
      })
      .catch((error: unknown) => {
        const api = getApiError(error);
        if (api?.code !== "REFERRAL_NOT_FOUND") return;
        clearLinkCode();
        toast(api.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // On the bag now, which says whether it applies.
  const onBag = offer !== null && cart?.referral?.code === offer.code;
  if (!offer || dismissed || onBag) return null;

  return (
    <div
      role="status"
      className={cn(
        "border-b border-border bg-surface",
        full ? "py-3" : "py-1.5",
      )}
    >
      <div className="container-page flex items-center gap-3">
        <GiftIcon
          className={cn("shrink-0 text-success", full ? "size-5" : "size-4")}
          weight="light"
        />
        <p className={cn("min-w-0 flex-1", full ? "text-sm" : "text-xs")}>
          {referralWelcome(offer)}.
          {full && (
            <span className="text-muted-foreground">
              {" "}
              It goes on your bag by itself.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            store(DISMISSED_KEY, offer.code);
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
