"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CheckIcon, PaletteIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  isThemeId,
  THEME_COOKIE,
  THEMES,
  themeById,
  type ThemeId,
} from "@/lib/themes";

const YEAR = 60 * 60 * 24 * 365;
// In development the React Query devtools button owns the corner.
const LIFT =
  process.env.NODE_ENV === "development"
    ? "bottom-20 sm:bottom-20"
    : "bottom-4 sm:bottom-6";

/** Applies a theme at once and remembers it for the server's next render. */
function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=${YEAR}; samesite=lax`;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeById(id).themeColor);
}

/**
 * Demo-only theme switcher (DEMO_THEME_PICKER=true): a floating button that
 * lets whoever is presenting the store try each theme live.
 */
export function ThemePicker({ initial }: { initial: ThemeId }) {
  const [theme, setTheme] = useState<ThemeId>(initial);

  return (
    <Popover.Root>
      {/* z-40: under the sheets' backdrop (z-50), so an open drawer covers
          it instead of the picker sitting on the drawer's buttons. */}
      <Popover.Trigger
        aria-label="Choose a theme"
        className={cn(
          LIFT,
          "fixed right-4 z-40 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-10px_oklch(0.2_0.01_60/0.5)] transition-transform duration-200 ease-out-expo outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 sm:right-6",
        )}
      >
        <PaletteIcon weight="light" className="size-5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={10}>
          <Popover.Popup className="w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-panel border border-border bg-popover p-3 text-popover-foreground shadow-2xl transition-[opacity,transform] duration-200 ease-out-expo outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="eyebrow px-1 pt-1 pb-3">
              Theme
            </Popover.Title>
            <RadioGroup
              value={theme}
              onValueChange={(value) => {
                if (!isThemeId(value)) return;
                setTheme(value);
                applyTheme(value);
              }}
              aria-label="Theme"
              className="grid gap-2"
            >
              {THEMES.map((option) => (
                <Radio.Root
                  key={option.id}
                  value={option.id}
                  className="flex items-center gap-3 rounded-field border border-border p-2.5 text-left transition-colors outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring data-checked:border-foreground"
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-12 shrink-0 overflow-hidden rounded-[calc(var(--radius-field)*0.6)] border border-border"
                  >
                    {option.preview.map((color) => (
                      <span
                        key={color}
                        className="flex-1"
                        style={{ background: color }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] font-medium">
                      {option.name}
                    </span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                  <Radio.Indicator className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon weight="bold" className="size-3" />
                  </Radio.Indicator>
                </Radio.Root>
              ))}
            </RadioGroup>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
