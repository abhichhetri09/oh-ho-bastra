"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CheckIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { adminSetStoreTheme } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { site } from "@/lib/site";
import {
  appearanceName,
  applyAppearance,
  CORNERS,
  DEFAULT_THEME,
  HEADING_FONTS,
  headingFontById,
  isCornersId,
  isHeadingFontId,
  isThemeId,
  sameAppearance,
  THEMES,
  themeById,
  type Appearance,
  type ThemeId,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import { revalidateStoreSettings } from "../actions";

// The font and corner pickers' value for "the theme's own". As an attribute
// (data-font="theme") it matches no [data-font] block, and keeps the page's
// pick from reaching into a preview of the theme's own.
const THEME_DEFAULT = "theme";

// The theme grid's columns (base, sm, xl). The selected theme's options sit
// in a full-width row right under its card: cards up to that row come
// before it, the rest after. Tailwind sees whole class names only, so each
// breakpoint's are spelt out.
const COLUMNS = [1, 2, 3];
const BEFORE = ["order-0", "sm:order-0", "xl:order-0"];
const AFTER = ["order-2", "sm:order-2", "xl:order-2"];

function placement(index: number, selected: number): string {
  return COLUMNS.map((columns, i) =>
    Math.floor(index / columns) <= Math.floor(selected / columns)
      ? BEFORE[i]
      : AFTER[i],
  ).join(" ");
}

const OPTION =
  "group flex flex-col rounded-field border border-border text-left transition-[border-color,box-shadow] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-checked:border-foreground data-checked:shadow-[0_0_0_1px_var(--foreground)]";

/**
 * The store's look: a theme, and the headline font and corners it uses in
 * place of the theme's. Each theme card renders a small storefront inside
 * its own [data-theme], so it shows that theme's real colours, type and
 * corners; the selected one opens its font and corner options right under
 * it, and its card shows them. Another theme starts from its own font and
 * corners. Choosing anything previews it on this page; Save applies it all
 * to the store, and leaving without saving puts the page back.
 */
export function AppearanceSettings({ initial }: { initial: Appearance }) {
  const router = useRouter();
  const [saved, setSaved] = useState<Appearance>(initial);
  const [selected, setSelected] = useState<Appearance>(initial);
  // What <html> showed before previewing, restored on the way out.
  const restore = useRef<Appearance | undefined>(undefined);

  useEffect(() => {
    const root = document.documentElement;
    const { theme, font, corners } = root.dataset;
    restore.current = {
      theme: isThemeId(theme) ? theme : DEFAULT_THEME,
      font: isHeadingFontId(font) ? font : null,
      corners: isCornersId(corners) ? corners : null,
    };
    return () => {
      if (restore.current) applyAppearance(root, restore.current);
    };
  }, []);

  useEffect(() => {
    applyAppearance(document.documentElement, selected);
  }, [selected]);

  const save = useMutation({
    mutationFn: async ({ theme, font, corners }: Appearance) => {
      const { data } = await adminSetStoreTheme({
        body: { theme, heading_font: font, corners },
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: async ({ theme, heading_font, corners }) => {
      const appearance: Appearance = {
        theme,
        font: heading_font,
        corners,
      };
      restore.current = appearance;
      setSaved(appearance);
      toast.success(`${appearanceName(appearance)} is now the store's look`);
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        getApiError(error)?.message ?? "Couldn't save the theme. Try again.",
      );
    },
  });

  const dirty = !sameAppearance(selected, saved);
  const selectedIndex = THEMES.findIndex((t) => t.id === selected.theme);

  return (
    <div className="overflow-hidden rounded-panel border border-border bg-card">
      <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
        <RadioGroup
          value={selected.theme}
          onValueChange={(value) => {
            if (!isThemeId(value)) return;
            // back to the saved theme: its saved font and corners
            setSelected(
              value === saved.theme
                ? saved
                : { theme: value, font: null, corners: null },
            );
          }}
          aria-label="Store theme"
          className="contents"
        >
          {THEMES.map((theme, index) => (
            <Radio.Root
              key={theme.id}
              value={theme.id}
              disabled={save.isPending}
              className={cn(
                placement(index, selectedIndex),
                "group flex flex-col overflow-hidden rounded-panel border border-border text-left transition-[border-color,box-shadow] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-checked:border-foreground data-checked:shadow-[0_0_0_1px_var(--foreground)]",
              )}
            >
              <ThemePreview
                id={theme.id}
                appearance={
                  theme.id === selected.theme
                    ? selected
                    : { theme: theme.id, font: null, corners: null }
                }
              />
              <span className="flex items-start justify-between gap-3 border-t border-border p-4">
                <span className="min-w-0 space-y-1">
                  <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
                    {theme.name}
                    {theme.id === saved.theme && (
                      <span className="eyebrow !text-[0.5625rem]">Current</span>
                    )}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {theme.description}
                  </span>
                </span>
                <Check />
              </span>
            </Radio.Root>
          ))}
        </RadioGroup>

        <Customise
          selected={selected}
          disabled={save.isPending}
          onChange={(change) => setSelected((s) => ({ ...s, ...change }))}
        />
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
        {dirty && (
          <p className="mr-auto text-xs text-muted-foreground" role="status">
            Previewing {appearanceName(selected)}. Shoppers still see{" "}
            {appearanceName(saved)}.
          </p>
        )}
        <Button
          variant="outline"
          disabled={!dirty || save.isPending}
          onClick={() => setSelected(saved)}
        >
          Discard
        </Button>
        <Button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(selected)}
        >
          {save.isPending ? "Saving…" : "Save appearance"}
        </Button>
      </footer>
    </div>
  );
}

/** The selected option's tick. */
function Check() {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border group-data-checked:border-primary group-data-checked:bg-primary">
      <Radio.Indicator>
        <CheckIcon weight="bold" className="size-3 text-primary-foreground" />
      </Radio.Indicator>
    </span>
  );
}

/**
 * The selected theme's headline font and corners, attached to its card
 * (outlined like it). Each option is drawn in its own font or corners;
 * "Theme default" in the theme's.
 */
function Customise({
  selected,
  disabled,
  onChange,
}: {
  selected: Appearance;
  disabled: boolean;
  onChange: (change: Partial<Omit<Appearance, "theme">>) => void;
}) {
  const fontLabel = useId();
  const cornersLabel = useId();
  const theme = themeById(selected.theme);
  const themeFont = headingFontById(theme.font);

  return (
    <div className="order-1 col-span-full space-y-6 rounded-panel border border-foreground p-5 shadow-[0_0_0_1px_var(--foreground)]">
      <div className="space-y-1">
        <h3 className="text-[0.8125rem] font-medium">Customise {theme.name}</h3>
        <p className="text-xs leading-snug text-muted-foreground">
          Keep its colours and change its headline font or corners. Another
          theme starts again from its own.
        </p>
      </div>

      <div className="space-y-3">
        <p id={fontLabel} className="eyebrow">
          Heading font
        </p>
        <RadioGroup
          value={selected.font ?? THEME_DEFAULT}
          onValueChange={(value) => {
            if (value === THEME_DEFAULT) onChange({ font: null });
            else if (isHeadingFontId(value)) onChange({ font: value });
          }}
          aria-labelledby={fontLabel}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4"
        >
          <FontOption
            value={THEME_DEFAULT}
            theme={selected.theme}
            name="Theme default"
            character={themeFont.name}
            disabled={disabled}
          />
          {HEADING_FONTS.map((font) => (
            <FontOption
              key={font.id}
              value={font.id}
              name={font.name}
              character={font.character}
              disabled={disabled}
            />
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <p id={cornersLabel} className="eyebrow">
          Corners
        </p>
        <RadioGroup
          value={selected.corners ?? THEME_DEFAULT}
          onValueChange={(value) => {
            if (value === THEME_DEFAULT) onChange({ corners: null });
            else if (isCornersId(value)) onChange({ corners: value });
          }}
          aria-labelledby={cornersLabel}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <CornersOption
            value={THEME_DEFAULT}
            theme={selected.theme}
            name="Theme default"
            disabled={disabled}
          />
          {CORNERS.map((corners) => (
            <CornersOption
              key={corners.id}
              value={corners.id}
              name={corners.name}
              disabled={disabled}
            />
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}

/**
 * One headline font, "Aa" in that face. The theme default renders inside
 * [data-theme] with data-font="theme", so the page's pick can't reach it.
 */
function FontOption({
  value,
  theme,
  name,
  character,
  disabled,
}: {
  value: string;
  theme?: ThemeId;
  name: string;
  character: string;
  disabled: boolean;
}) {
  return (
    <Radio.Root value={value} disabled={disabled} className={OPTION}>
      <span className="flex items-start justify-between gap-2 p-3 pb-0">
        <span
          aria-hidden
          data-theme={theme}
          data-font={value}
          className="display block bg-transparent text-[2.5rem] text-foreground"
        >
          Aa
        </span>
        <Check />
      </span>
      <span className="space-y-0.5 p-3">
        <span className="block text-[0.8125rem] font-medium">{name}</span>
        <span className="block text-xs leading-snug text-muted-foreground">
          {character}
        </span>
      </span>
    </Radio.Root>
  );
}

/**
 * One corner style: a photo well and a button drawn with its corners. The
 * theme default renders in [data-theme] with data-corners="theme".
 */
function CornersOption({
  value,
  theme,
  name,
  disabled,
}: {
  value: string;
  theme?: ThemeId;
  name: string;
  disabled: boolean;
}) {
  return (
    <Radio.Root value={value} disabled={disabled} className={OPTION}>
      <span className="flex items-start justify-between gap-2 p-3 pb-0">
        <span
          aria-hidden
          data-theme={theme}
          data-corners={value}
          className="flex items-end gap-1.5 bg-transparent text-foreground"
        >
          <span className="block size-9 rounded-media border border-border bg-surface" />
          <span className="block h-4 w-9 rounded-control bg-primary" />
        </span>
        <Check />
      </span>
      <span className="block p-3 text-[0.8125rem] font-medium">{name}</span>
    </Radio.Root>
  );
}

/**
 * A small storefront drawn in one theme's tokens, with its font and corners
 * (decorative). data-font="theme" keeps the page's pick out of the others.
 */
function ThemePreview({
  id,
  appearance,
}: {
  id: ThemeId;
  appearance: Appearance;
}) {
  return (
    <span
      data-theme={id}
      data-font={appearance.font ?? THEME_DEFAULT}
      data-corners={appearance.corners ?? THEME_DEFAULT}
      aria-hidden
      className="pointer-events-none flex flex-col gap-4 bg-background p-4 text-foreground"
    >
      <span className="flex items-center justify-between">
        <span className="font-serif text-lg leading-none">{site.name}</span>
        <span className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-5 rounded-full bg-foreground/15" />
          ))}
        </span>
      </span>
      <span className="grid grid-cols-[1fr_auto] items-end gap-4">
        <span className="display block text-[1.75rem]">
          Tees, printed <em>for you.</em>
        </span>
        <span className="relative block aspect-[4/5] w-16 overflow-hidden rounded-media bg-surface">
          <Image
            src={site.hero.image}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
          />
          <span className="absolute top-1 left-1 rounded-control bg-clay px-1 font-mono text-[0.5rem] text-clay-foreground">
            −15%
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className={buttonVariants({ size: "sm" })}>Shop now</span>
        <span className={buttonVariants({ size: "sm", variant: "outline" })}>
          Editor&apos;s picks
        </span>
      </span>
    </span>
  );
}
