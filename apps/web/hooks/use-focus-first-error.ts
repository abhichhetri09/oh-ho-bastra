"use client";

import { useEffect, useRef, useState } from "react";

const FOCUSABLE =
  'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus to a form's first invalid field after a failed submit, and
 * scrolls it into view, so the shopper lands on what needs fixing (the
 * errors can be far above the submit button on a phone). Call the
 * returned function whenever a submit sets errors; it runs once React has
 * rendered them, and not on later edits, so typing a fix doesn't move
 * focus. Fields mark themselves with aria-invalid; a group (the star
 * rating) passes focus to its first focusable child.
 */
export function useFocusFirstError<T extends HTMLElement = HTMLFormElement>() {
  const ref = useRef<T>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) return;
    const invalid = ref.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (!invalid) return;
    const target = invalid.matches(FOCUSABLE)
      ? invalid
      : invalid.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
    invalid.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [attempt]);

  return { ref, focusFirstError: () => setAttempt((n) => n + 1) };
}
