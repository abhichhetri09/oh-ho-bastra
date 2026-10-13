"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImageSquareIcon,
  PlusIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { UploadSignature } from "@repo/types";
import { adminSignUpload } from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGES,
  move,
  rejectImage,
  uploadImage,
  type StoredImage,
} from "../lib/upload";

type Upload = { id: string; name: string; preview: string; progress: number };

/**
 * An ordered set of images (the first is the cover): upload by picking or
 * dropping files, reorder with the arrows, remove. Files go straight to
 * Cloudinary with a signature from the API. `library` offers images that
 * already exist (a product's, for its variants) to add without uploading.
 */
export function ImageManager({
  images,
  onChange,
  max = 5,
  library = [],
  invalid,
  onUploadingChange,
  label = "Images",
}: {
  images: StoredImage[];
  onChange: React.Dispatch<React.SetStateAction<StoredImage[]>>;
  max?: number;
  library?: StoredImage[];
  invalid?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  label?: string;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = uploads.length > 0;
  useEffect(
    () => onUploadingChange?.(uploading),
    [uploading, onUploadingChange],
  );
  const free = max - images.length - uploads.length;
  // Files accepted but not yet stored, counted at once: a second drop
  // during the first one's signature request must not pass the limit too.
  const inFlight = useRef(0);
  const unused = library.filter(
    (img) => !images.some((i) => i.url === img.url),
  );

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const accepted: File[] = [];
    for (const file of files) {
      const reason = rejectImage(file);
      if (reason) toast.error(reason);
      else accepted.push(file);
    }
    const room = max - images.length - inFlight.current;
    if (accepted.length > room) {
      toast.error(
        room <= 0
          ? `${max} images at most: remove one first`
          : `Only ${room} more ${room === 1 ? "image fits" : "images fit"}`,
      );
      accepted.length = Math.max(room, 0);
    }
    if (accepted.length === 0) return;
    inFlight.current += accepted.length;

    let signature: UploadSignature;
    try {
      const { data } = await adminSignUpload({ throwOnError: true });
      signature = data.data;
    } catch (error) {
      inFlight.current -= accepted.length;
      toast.error(
        getApiError(error)?.message ?? "Uploads aren't available right now.",
      );
      return;
    }

    const batch = accepted.map((file) => ({
      file,
      upload: {
        id: crypto.randomUUID(),
        name: file.name,
        preview: URL.createObjectURL(file),
        progress: 0,
      },
    }));
    setUploads((u) => [...u, ...batch.map((b) => b.upload)]);

    await Promise.all(
      batch.map(async ({ file, upload }) => {
        try {
          const image = await uploadImage(file, signature, (progress) =>
            setUploads((u) =>
              u.map((x) => (x.id === upload.id ? { ...x, progress } : x)),
            ),
          );
          onChange((current) => [...current, image].slice(0, max));
        } catch (error) {
          toast.error(
            `${file.name}: ${error instanceof Error ? error.message : "the upload failed"}`,
          );
        } finally {
          inFlight.current -= 1;
          URL.revokeObjectURL(upload.preview);
          setUploads((u) => u.filter((x) => x.id !== upload.id));
        }
      }),
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid grid-cols-3 gap-3 sm:grid-cols-5",
          invalid &&
            "rounded-media ring-1 ring-destructive/40 ring-offset-4 ring-offset-background",
        )}
      >
        {images.map((image, i) => (
          <figure
            key={image.url}
            className="group relative aspect-[4/5] overflow-hidden rounded-media bg-surface"
          >
            <Image
              src={image.url}
              alt={`${label} ${i + 1}`}
              fill
              sizes="(min-width: 640px) 160px, 30vw"
              // the cover is near the top of the editor
              loading={i === 0 ? "eager" : "lazy"}
              className="object-cover"
            />
            {i === 0 && (
              <span className="absolute top-2 left-2 bg-background/90 px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.14em] uppercase">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                onChange((c) => c.filter((x) => x.url !== image.url))
              }
              className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center bg-background/90 text-foreground opacity-100 transition-opacity hover:bg-background sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
              aria-label={`Remove image ${i + 1}`}
            >
              <XIcon className="size-3.5" />
            </button>
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => onChange((c) => move(c, i, i - 1))}
                className="flex size-7 items-center justify-center bg-background/90 hover:bg-background disabled:invisible"
                aria-label={`Move image ${i + 1} earlier`}
              >
                <ArrowLeftIcon className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={i === images.length - 1}
                onClick={() => onChange((c) => move(c, i, i + 1))}
                className="flex size-7 items-center justify-center bg-background/90 hover:bg-background disabled:invisible"
                aria-label={`Move image ${i + 1} later`}
              >
                <ArrowRightIcon className="size-3.5" />
              </button>
            </div>
          </figure>
        ))}

        {uploads.map((upload) => (
          <figure
            key={upload.id}
            className="relative aspect-[4/5] overflow-hidden rounded-media bg-surface"
            aria-label={`Uploading ${upload.name}`}
          >
            {/* A local blob preview: next/image can't load object URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={upload.preview}
              alt=""
              className="size-full object-cover opacity-50"
            />
            <div className="absolute inset-x-2 bottom-2 h-1 bg-background/70">
              <div
                className="h-full bg-foreground transition-[width] duration-200"
                style={{ width: `${Math.round(upload.progress * 100)}%` }}
              />
            </div>
            <span className="sr-only" aria-live="polite">
              {Math.round(upload.progress * 100)}%
            </span>
          </figure>
        ))}

        {free > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles([...e.dataTransfer.files]);
            }}
            className={cn(
              "flex aspect-[4/5] flex-col rounded-media items-center justify-center gap-2 border border-dashed border-input p-2 text-center text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
              dragging && "border-foreground bg-muted text-foreground",
            )}
          >
            <UploadSimpleIcon className="size-5" weight="light" />
            <span>
              {images.length === 0 ? "Add images" : "Add more"}
              <span className="block text-[0.625rem] text-muted-foreground">
                or drop here
              </span>
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGES}
        multiple
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {unused.length > 0 && free > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageSquareIcon className="size-3.5" />
            From the product
          </p>
          <div className="flex flex-wrap gap-2">
            {unused.map((image) => (
              <button
                key={image.url}
                type="button"
                onClick={() =>
                  onChange((c) =>
                    c.length + inFlight.current < max &&
                    !c.some((x) => x.url === image.url)
                      ? [...c, image]
                      : c,
                  )
                }
                className="group relative h-16 w-13 overflow-hidden bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Add this product image"
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="52px"
                  className="object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <PlusIcon className="size-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Up to {max} images, JPEG, PNG, WebP or AVIF, 10 MB each. The first is
        the cover.
      </p>
    </div>
  );
}
