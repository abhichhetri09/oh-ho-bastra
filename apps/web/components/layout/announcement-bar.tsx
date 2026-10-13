import { site } from "@/lib/site";

/**
 * A slow ticker of store notices; static for reduced-motion users. It
 * pauses on hover, and a toggle (a checkbox, so no client script) stops it
 * for good, as moving content must be pausable.
 */
export function AnnouncementBar() {
  // Two copies side by side make the -50% marquee loop seamless.
  const items = [...site.announcement, ...site.announcement];
  return (
    <div className="group/ticker relative overflow-hidden bg-primary text-primary-foreground">
      <p className="sr-only">{site.announcement.join(". ")}</p>
      <div
        aria-hidden
        className="animate-marquee flex w-max group-hover/ticker:[animation-play-state:paused] group-has-checked/ticker:[animation-play-state:paused]"
      >
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0">
            {items.map((text, i) => (
              <li
                key={`${copy}-${i}`}
                className="flex h-9 items-center px-8 font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
              >
                {text}
                <span className="ml-16 opacity-40">✦</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <label className="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center bg-primary has-focus-visible:ring-2 has-focus-visible:ring-ring motion-reduce:hidden">
        <input type="checkbox" className="peer sr-only" />
        <span className="sr-only">Pause the announcements</span>
        {/* Pause bars, or a play triangle once paused. */}
        <span
          aria-hidden
          className="flex gap-[3px] opacity-60 peer-checked:hidden"
        >
          <span className="h-2.5 w-[2px] bg-current" />
          <span className="h-2.5 w-[2px] bg-current" />
        </span>
        <span
          aria-hidden
          className="hidden size-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-current opacity-60 peer-checked:block"
        />
      </label>
    </div>
  );
}
