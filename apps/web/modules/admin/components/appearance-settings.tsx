"use client";

import { useEffect, useRef, useState } from "react";
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
import { isThemeId, THEMES, themeById, type ThemeId } from "@/lib/themes";
import { revalidateStoreSettings } from "../actions";

/**
 * The store's theme. Each card renders a small storefront inside its own
 * [data-theme], so it shows that theme's real colours, type and corners.
 * Choosing a card previews it on this page; Save applies it to the store,
 * and leaving without saving puts the page back.
 */
export function AppearanceSettings({ initial }: { initial: ThemeId }) {
  const router = useRouter();
  const [saved, setSaved] = useState<ThemeId>(initial);
  const [selected, setSelected] = useState<ThemeId>(initial);
  // What <html> showed before previewing, restored on the way out.
  const restore = useRef<string | undefined>(undefined);

  useEffect(() => {
    const root = document.documentElement;
    restore.current = root.dataset.theme;
    return () => {
      if (restore.current) root.dataset.theme = restore.current;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = selected;
  }, [selected]);

  const save = useMutation({
    mutationFn: async (theme: ThemeId) => {
      const { data } = await adminSetStoreTheme({
        body: { theme },
        throwOnError: true,
      });
      return data.data;
    },
    onSuccess: async ({ theme }) => {
      restore.current = theme;
      setSaved(theme);
      toast.success(`${themeById(theme).name} is now the store's theme`);
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      toast.error(
        getApiError(error)?.message ?? "Couldn't save the theme. Try again.",
      );
    },
  });

  const dirty = selected !== saved;

  return (
    <section className="overflow-hidden rounded-panel border border-border bg-card">
      <header className="space-y-1 border-b border-border px-5 py-4">
        <h2 className="text-[0.8125rem] font-medium">Appearance</h2>
        <p className="text-xs text-muted-foreground">
          The look of your storefront: colours, type and shapes. Choosing one
          previews it here; save to show it to shoppers.
        </p>
      </header>

      <RadioGroup
        value={selected}
        onValueChange={(value) => {
          if (isThemeId(value)) setSelected(value);
        }}
        aria-label="Store theme"
        className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3"
      >
        {THEMES.map((theme) => (
          <Radio.Root
            key={theme.id}
            value={theme.id}
            disabled={save.isPending}
            className="group flex flex-col overflow-hidden rounded-panel border border-border text-left transition-[border-color,box-shadow] outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-checked:border-foreground data-checked:shadow-[0_0_0_1px_var(--foreground)]"
          >
            <ThemePreview id={theme.id} />
            <span className="flex items-start justify-between gap-3 border-t border-border p-4">
              <span className="min-w-0 space-y-1">
                <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
                  {theme.name}
                  {theme.id === saved && (
                    <span className="eyebrow !text-[0.5625rem]">Current</span>
                  )}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {theme.description}
                </span>
              </span>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border group-data-checked:border-primary group-data-checked:bg-primary">
                <Radio.Indicator>
                  <CheckIcon
                    weight="bold"
                    className="size-3 text-primary-foreground"
                  />
                </Radio.Indicator>
              </span>
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
        {dirty && (
          <p className="mr-auto text-xs text-muted-foreground" role="status">
            Previewing {themeById(selected).name}. Shoppers still see{" "}
            {themeById(saved).name}.
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
          {save.isPending ? "Saving…" : "Save theme"}
        </Button>
      </footer>
    </section>
  );
}

/** A small storefront drawn in one theme's tokens (decorative). */
function ThemePreview({ id }: { id: ThemeId }) {
  return (
    <span
      data-theme={id}
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
          Objects for <em>slow living.</em>
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
