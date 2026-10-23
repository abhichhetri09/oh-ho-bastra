import { storeAnnouncements } from "@/lib/theme-server";

/**
 * A slow ticker of store notices, edited in Admin → Settings (none hides
 * it); static for reduced-motion users. It pauses on hover, and a toggle (a
 * checkbox, so no client script) stops it for good, as moving content must
 * be pausable.
 */
export async function AnnouncementBar() {
  const announcements = await storeAnnouncements();
  if (announcements.length === 0) return null;
  // Two copies side by side make the -50% marquee loop seamless, as long as
  // each copy is wider than the screen: a few short messages are repeated
  // until a copy spans ~1920px (11px mono caps are about 7.6px a letter,
  // plus 128px of padding and the separator per item).
  const width = announcements.reduce(
    (sum, text) => sum + text.length * 7.6 + 128,
    0,
  );
  const repeat = Math.max(2, Math.ceil(1920 / width));
  const items = Array.from({ length: repeat }, () => announcements).flat();
  // A steady reading speed (~60px/s) however much there is to read.
  const duration = `${Math.round((width * repeat) / 60)}s`;
  return (
    <div className="group/ticker relative overflow-hidden bg-primary text-primary-foreground">
      <p className="sr-only">{announcements.join(". ")}</p>
      <div
        aria-hidden
        style={{ animationDuration: duration }}
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
