"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ImageSquareIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { adminSetStoreLogo, adminSignUpload } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { site } from "@/lib/site";
import { revalidateStoreSettings } from "../actions";
import { ACCEPTED_IMAGES, rejectImage, uploadImage } from "../lib/upload";

/**
 * The logo in the store's header: upload an image (a wide PNG with a
 * transparent background works best) or go back to the built-in mark.
 * Saved at once; the storefront shows it on its next render.
 */
export function LogoSettings({ initial }: { initial: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState(initial);
  const [progress, setProgress] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: async (logo_url: string | null) => {
      const { data } = await adminSetStoreLogo({
        body: { logo_url },
        throwOnError: true,
      });
      return data.data.logo_url;
    },
    onSuccess: async (saved) => {
      setLogo(saved);
      toast.success(saved ? "Logo saved" : "Back to the built-in logo");
      await revalidateStoreSettings().catch(() => undefined);
      router.refresh();
    },
    onError: (error) => {
      toast.error(getApiError(error)?.message ?? "Couldn't save the logo.");
    },
  });

  async function upload(file: File) {
    const problem = rejectImage(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setProgress(0);
    try {
      const { data } = await adminSignUpload({ throwOnError: true });
      const image = await uploadImage(file, data.data, setProgress);
      save.mutate(image.url);
    } catch (error) {
      toast.error(
        getApiError(error)?.message ??
          (error instanceof Error ? error.message : "The upload failed."),
      );
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null || save.isPending;

  return (
    <section className="overflow-hidden rounded-panel border border-border bg-card">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <h2 className="text-sm font-medium">Logo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Shown in the header of the shop and admin. A wide PNG with a
          transparent background works best.
        </p>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        {/* How it reads in the header, on the light and dark backgrounds. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            "bg-background text-foreground",
            "bg-foreground text-background",
          ].map((tone) => (
            <div
              key={tone}
              className={`relative flex h-16 items-center overflow-hidden rounded-control border border-border px-4 font-serif text-[1.65rem] leading-none ${tone}`}
            >
              {logo ? (
                <Image
                  src={logo}
                  alt={`${site.name} logo`}
                  width={320}
                  height={80}
                  className="h-[1.1em] w-auto max-w-full object-contain"
                />
              ) : (
                <span className="whitespace-nowrap">
                  <LogoMark className="mr-[0.28em] inline-block size-[0.66em] align-baseline" />
                  {site.name}
                </span>
              )}
              {progress !== null && (
                <span
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-clay transition-[width]"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED_IMAGES}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {logo ? (
              <ImageSquareIcon data-icon="inline-start" />
            ) : (
              <UploadSimpleIcon data-icon="inline-start" />
            )}
            {progress !== null
              ? `Uploading ${Math.round(progress * 100)}%`
              : save.isPending
                ? "Saving…"
                : logo
                  ? "Replace logo"
                  : "Upload logo"}
          </Button>
          {logo && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => save.mutate(null)}
            >
              <TrashIcon data-icon="inline-start" />
              Use built-in logo
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
