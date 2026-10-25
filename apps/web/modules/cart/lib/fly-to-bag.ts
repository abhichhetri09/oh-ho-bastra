// The "added" flourish: a thumbnail of the product arcs from where the
// shopper clicked into the header bag, which then bounces. Purely visual;
// the add itself never waits on it.

/** The header bag button carries this attribute; the flight lands on it. */
export const BAG_TARGET = "data-bag-target";
/** A product photo the flight starts from, when it's on screen. */
export const FLY_SOURCE = "data-fly-source";
/** Fired on window when a flight lands (or at once with reduced motion). */
export const BAG_BUMP_EVENT = "bag:bump";

const DURATION = 750;
const SIZE = 72;

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < window.innerHeight &&
    r.left < window.innerWidth
  );
};

const bump = () => window.dispatchEvent(new Event(BAG_BUMP_EVENT));

/**
 * Flies `image` from the on-screen product photo on wide screens (else from
 * `origin`, the clicked button) to the header bag. Without a visible bag, or with reduced
 * motion, the bag just bumps. `fromPhoto: false` always starts at `origin`
 * (a drawer's button, with the product page's photo behind it).
 */
export function flyToBag(
  origin: Element | null,
  image: string,
  { fromPhoto = true }: { fromPhoto?: boolean } = {},
): void {
  if (typeof window === "undefined") return;
  const target = [...document.querySelectorAll(`[${BAG_TARGET}]`)].find(
    visible,
  );
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!target || reduced || !image) {
    bump();
    return;
  }

  // From the photo only on wide screens, where it sits beside the button.
  // On phones the photo fills the width, so the tapped button reads better.
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  const photo =
    fromPhoto && wide
      ? [...document.querySelectorAll(`[${FLY_SOURCE}]`)].find(visible)
      : undefined;
  const source = photo ?? origin;
  if (!source) {
    bump();
    return;
  }

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  // Start at the source's size (a photo's, capped; a button's is small),
  // centred on it; end small on the bag.
  const startSize = Math.min(
    Math.max(Math.min(from.width, from.height), SIZE),
    280,
  );
  const startX = from.left + from.width / 2 - SIZE / 2;
  const startY = from.top + from.height / 2 - SIZE / 2;
  const endX = to.left + to.width / 2 - SIZE / 2;
  const endY = to.top + to.height / 2 - SIZE / 2;
  const startScale = startSize / SIZE;

  // Two layers make the arc: the outer one moves across at a steady pace,
  // the inner one moves up/down with easing, so together they curve.
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  const img = document.createElement("img");
  img.src = image;
  img.alt = "";
  img.decoding = "async";
  Object.assign(outer.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    zIndex: "100",
    pointerEvents: "none",
    transform: `translateX(${startX}px)`,
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(inner.style, {
    width: "100%",
    height: "100%",
    transform: `translateY(${startY}px)`,
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(img.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "var(--radius-media, 12px)",
    boxShadow: "0 12px 32px -8px rgb(0 0 0 / 0.35)",
    background: "var(--surface, #eee)",
    transform: `scale(${startScale})`,
  } satisfies Partial<CSSStyleDeclaration>);
  inner.appendChild(img);
  outer.appendChild(inner);
  document.body.appendChild(outer);

  // Three layers make a thrown curve: across fast then slowing (outer),
  // up/down slow then fast (inner), and shrinking from the start (image).
  // The path bends toward the bag and never overshoots it.
  const across = outer.animate(
    [
      { transform: `translateX(${startX}px)` },
      { transform: `translateX(${endX}px)` },
    ],
    { duration: DURATION, easing: "cubic-bezier(0.25, 0.6, 0.4, 1)" },
  );
  inner.animate(
    [
      { transform: `translateY(${startY}px)` },
      { transform: `translateY(${endY}px)` },
    ],
    { duration: DURATION, easing: "cubic-bezier(0.6, 0, 0.9, 0.5)" },
  );
  img.animate(
    [
      { transform: `scale(${startScale})`, opacity: 1 },
      { transform: "scale(0.4)", opacity: 0.8 },
    ],
    { duration: DURATION, easing: "cubic-bezier(0.35, 0.45, 0.45, 1)" },
  );

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    outer.remove();
    bump();
  };
  across.onfinish = finish;
  across.oncancel = finish;
  // Safety net if the tab is hidden and animations are paused.
  setTimeout(finish, DURATION + 300);
}
