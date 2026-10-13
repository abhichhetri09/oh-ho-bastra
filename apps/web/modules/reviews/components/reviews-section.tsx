"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StarIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ReviewBodySchema, type ReviewSummary } from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useFocusFirstError } from "@/hooks/use-focus-first-error";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { loginPath } from "@/lib/auth/redirect";
import { friendlyFieldErrors } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { formatOrderDate } from "@/modules/checkout/lib/orders";
import { useMyReview, useReviewMutations, useReviews } from "../hooks";
import { Stars } from "./stars";

/**
 * The product page's reviews: a summary with per-star bars, the reviews
 * themselves (10 at a time) and, for buyers, writing or editing theirs.
 * `?review=1` (from an order page) opens the form for a buyer.
 */
export function ReviewsSection({
  slug,
  productName,
}: {
  slug: string;
  productName: string;
}) {
  const reviews = useReviews(slug);
  const summary = reviews.data?.pages[0]?.data.summary;
  const list = reviews.data?.pages.flatMap((p) => p.data.reviews) ?? [];

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="scroll-mt-24 border-t border-border pt-16"
    >
      <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-20">
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-2">
            <p className="eyebrow">Reviews</p>
            <h2 id="reviews-heading" className="display text-5xl">
              What buyers say.
            </h2>
          </div>
          {summary ? (
            <Summary summary={summary} />
          ) : (
            <Skeleton className="h-40" />
          )}
          <WriteReview slug={slug} productName={productName} />
        </div>

        <div>
          {reviews.isPending ? (
            <div className="space-y-6">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : reviews.isError && !reviews.data ? (
            <p className="text-sm text-muted-foreground">
              Reviews couldn&apos;t load.{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => void reviews.refetch()}
              >
                Try again
              </button>
            </p>
          ) : list.length === 0 ? (
            <p className="rounded-panel border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No reviews yet. Buyers can be the first to share how it wears.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border border-y border-border">
                {list.map((review, i) => (
                  <li
                    key={review.id}
                    className="animate-rise space-y-2 py-7"
                    style={{ "--i": i % 10 } as React.CSSProperties}
                  >
                    <Stars value={review.rating} />
                    <h3 className="font-serif text-2xl">{review.title}</h3>
                    <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                      {review.body}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {review.author} · Verified buyer ·{" "}
                      {formatOrderDate(review.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
              {reviews.hasNextPage && (
                <div className="pt-6 text-center">
                  <Button
                    variant="outline"
                    onClick={() => void reviews.fetchNextPage()}
                    disabled={reviews.isFetchingNextPage}
                  >
                    {reviews.isFetchingNextPage ? "Loading…" : "More reviews"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Summary({ summary }: { summary: ReviewSummary }) {
  if (summary.count === 0) {
    return <p className="text-sm text-muted-foreground">No reviews yet.</p>;
  }
  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4">
        <span className="font-serif text-6xl leading-none tabular-nums">
          {summary.average.toFixed(1)}
        </span>
        <div className="space-y-1 pb-1">
          <Stars value={summary.average} size="size-4" />
          <p className="text-xs text-muted-foreground">
            {summary.count} {summary.count === 1 ? "review" : "reviews"}
          </p>
        </div>
      </div>
      <ul className="space-y-1.5" aria-label="Reviews per rating">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.distribution[star - 1] ?? 0;
          const share = summary.count ? count / summary.count : 0;
          return (
            <li
              key={star}
              className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-3 text-xs"
            >
              <span className="tabular-nums text-muted-foreground">
                {star} star
              </span>
              <span className="h-1 overflow-hidden bg-border" aria-hidden>
                <span
                  className="block h-full bg-foreground transition-[width] duration-700 ease-out-expo"
                  style={{ width: `${share * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WriteReview({
  slug,
  productName,
}: {
  slug: string;
  productName: string;
}) {
  const user = useAuth((s) => s.user);
  const pathname = usePathname();
  const mine = useMyReview(slug);
  const [open, setOpen] = useState(false);
  // Whether the open form differs from what's saved (set by the form).
  const dirty = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function close() {
    dirty.current = false;
    setOpen(false);
  }

  // From an order page: /products/x?review=1#reviews opens the form.
  const canReview = mine.data?.can_review ?? false;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("review") !== "1" || !canReview) return;
    setOpen(true);
    url.searchParams.delete("review");
    window.history.replaceState(null, "", url);
  }, [canReview]);

  if (!user) {
    return (
      <Link
        href={loginPath(`${pathname}#reviews`)}
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        Sign in to review
      </Link>
    );
  }
  if (mine.isPending) return <Skeleton className="h-10" />;
  if (!mine.data?.can_review) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Reviews come from customers who bought this piece, so every one is from
        someone who has worn or used it.
      </p>
    );
  }

  const review = mine.data.review;
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {review ? "Edit your review" : "Write a review"}
      </Button>
      {review?.status === "hidden" && (
        <p className="text-xs text-muted-foreground">
          Your review is hidden from the shop.
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Esc or a click outside shouldn't throw away a half-written review.
          if (!next && dirty.current) setConfirmDiscard(true);
          else setOpen(next);
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] gap-6 p-6 sm:max-w-lg">
          {/* Keyed so reopening starts from the saved review. */}
          {open && (
            <ReviewForm
              key={review?.updated_at ?? "new"}
              slug={slug}
              productName={productName}
              initial={review ?? undefined}
              onDirtyChange={(isDirty) => {
                dirty.current = isDirty;
              }}
              close={close}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={review ? "Discard your changes?" : "Discard your review?"}
        description="What you've written hasn't been saved."
        confirmLabel="Discard"
        pending={false}
        onConfirm={() => {
          setConfirmDiscard(false);
          close();
        }}
      />
    </>
  );
}

function ReviewForm({
  slug,
  productName,
  initial,
  onDirtyChange,
  close,
}: {
  slug: string;
  productName: string;
  initial?: { rating: number; title: string; body: string };
  onDirtyChange: (dirty: boolean) => void;
  close: () => void;
}) {
  const { write, remove } = useReviewMutations(slug);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { ref: formRef, focusFirstError } = useFocusFirstError();

  const dirty =
    rating !== (initial?.rating ?? 0) ||
    title !== (initial?.title ?? "") ||
    body !== (initial?.body ?? "");
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function fail(next: Record<string, string>) {
    setErrors(next);
    focusFirstError();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ReviewBodySchema.safeParse({ rating, title, body });
    if (!parsed.success) {
      fail(
        friendlyFieldErrors(parsed.error, {
          rating: "a rating",
          title: "a title",
          body: "a few words about it",
        }),
      );
      return;
    }
    setErrors({});
    write.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(initial ? "Review updated" : "Thanks for your review");
        close();
      },
      onError: (error) => {
        fail(mapFieldErrors(getApiError(error)?.errors));
        toast.error(getApiError(error)?.message ?? "Couldn't save your review");
      },
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
      <DialogHeader className="gap-1">
        <DialogTitle className="font-serif text-3xl font-normal">
          {initial ? "Edit your review" : "Write a review"}
        </DialogTitle>
        <DialogDescription>{productName}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-5">
        <Field data-invalid={Boolean(errors.rating)}>
          <FieldLabel className="eyebrow !text-foreground">Rating</FieldLabel>
          <StarInput
            value={rating}
            onChange={setRating}
            invalid={Boolean(errors.rating)}
          />
          <FieldError key={errors.rating} className="animate-rise">
            {errors.rating}
          </FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel
            htmlFor="review-title"
            className="eyebrow !text-foreground"
          >
            Title
          </FieldLabel>
          <Input
            id="review-title"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "review-title-error" : undefined}
            placeholder="In a few words"
          />
          <FieldError
            key={errors.title}
            id="review-title-error"
            className="animate-rise"
          >
            {errors.title}
          </FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.body)}>
          <FieldLabel
            htmlFor="review-body"
            className="eyebrow !text-foreground"
          >
            Review
          </FieldLabel>
          <Textarea
            id="review-body"
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={Boolean(errors.body)}
            aria-describedby={errors.body ? "review-body-error" : undefined}
            placeholder="How does it fit, feel and wear?"
          />
          <FieldError
            key={errors.body}
            id="review-body-error"
            className="animate-rise"
          >
            {errors.body}
          </FieldError>
        </Field>
      </FieldGroup>

      <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
        {initial ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="link-underline text-xs text-muted-foreground hover:text-destructive"
          >
            Delete review
          </button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={write.isPending}>
          {write.isPending
            ? "Saving…"
            : initial
              ? "Save changes"
              : "Post review"}
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete your review?"
        description="It comes off the product page for good. You can write a new one later."
        confirmLabel="Delete review"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast("Review deleted");
              close();
            },
            onError: (error) => {
              setConfirmDelete(false);
              toast.error(
                getApiError(error)?.message ?? "Couldn't delete your review",
              );
            },
          })
        }
      />
    </form>
  );
}

const LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * Five stars as a radio group: arrow keys move between them, hovering
 * previews a rating.
 */
function StarInput({
  value,
  onChange,
  invalid,
}: {
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Rating"
        aria-invalid={invalid}
        className="flex"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? "s" : ""}, ${LABELS[star - 1]}`}
            tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(star)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight" || e.key === "ArrowUp"
                  ? Math.min(star + 1, 5)
                  : e.key === "ArrowLeft" || e.key === "ArrowDown"
                    ? Math.max(star - 1, 1)
                    : null;
              if (next === null) return;
              e.preventDefault();
              onChange(next);
              (
                e.currentTarget.parentElement?.children[next - 1] as
                  | HTMLElement
                  | undefined
              )?.focus();
            }}
            className="p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <StarIcon
              weight="fill"
              className={cn(
                "size-7 transition-[color,transform] duration-200",
                star <= shown ? "scale-110 text-foreground" : "text-border",
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground" aria-hidden>
        {shown ? LABELS[shown - 1] : ""}
      </span>
    </div>
  );
}
