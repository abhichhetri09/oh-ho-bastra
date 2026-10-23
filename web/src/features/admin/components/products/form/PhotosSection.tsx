import { useRef, useState, type DragEvent } from "react";

import { Panel } from "@/components/app-shell/Panel";
import { ChevronLeft, ChevronRight, Plus, Trash } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { uploadImage } from "@/features/admin/api";
import { cn } from "@/lib/utils";
import type { useProductForm } from "./useProductForm";

type Form = ReturnType<typeof useProductForm>;

const accept = "image/jpeg,image/png,image/webp,image/avif";
const iconButton =
  "flex size-7 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur hover:bg-background disabled:opacity-40";

/** Upload, order, caption and remove product photos. The first one is the cover. */
export function PhotosSection({ form }: { form: Form }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const photos = form.draft.images;

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((file) => accept.split(",").includes(file.type));
    if (list.length === 0) {
      setError("Choose JPEG, PNG, WebP or AVIF images.");
      return;
    }
    setError(null);
    setUploading((n) => n + list.length);
    // One at a time keeps the order the admin picked them in.
    for (const file of list) {
      try {
        form.addImages([await uploadImage(file)]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files);
  }

  return (
    <Panel title="Photos" description="The first photo is the cover. Drag files in, or add them below.">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn("grid grid-cols-2 gap-3 rounded-lg transition", dragging && "ring-2 ring-foreground ring-offset-4 ring-offset-background")}
      >
        {photos.map((photo, index) => (
          <div key={photo.url} className="space-y-1.5">
            <div className="group relative aspect-4/5 overflow-hidden rounded-lg bg-secondary">
              <img src={photo.url} alt={photo.alt} className="absolute inset-0 size-full object-cover" />
              {index === 0 ? (
                <span className="absolute top-2 left-2 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
                  Cover
                </span>
              ) : null}
              <div className="absolute inset-x-2 bottom-2 flex justify-between gap-1">
                <div className="flex gap-1">
                  <button type="button" className={iconButton} aria-label={`Move photo ${index + 1} left`} disabled={index === 0} onClick={() => form.moveImage(index, -1)}>
                    <ChevronLeft className="size-4" />
                  </button>
                  <button type="button" className={iconButton} aria-label={`Move photo ${index + 1} right`} disabled={index === photos.length - 1} onClick={() => form.moveImage(index, 1)}>
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <button type="button" className={iconButton} aria-label={`Remove photo ${index + 1}`} onClick={() => form.removeImage(index)}>
                  <Trash className="size-4" />
                </button>
              </div>
            </div>
            <Input
              aria-label={`Description of photo ${index + 1}`}
              placeholder="Describe the photo"
              value={photo.alt}
              onChange={(e) => form.updateImage(index, e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        ))}

        {Array.from({ length: uploading }, (_, i) => (
          <div key={`uploading-${i}`} className="flex aspect-4/5 animate-pulse items-center justify-center rounded-lg bg-secondary text-xs text-muted-foreground">
            Uploading…
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-4/5 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <Plus className="size-5" aria-hidden />
          Add photos
          <span className="text-xs">JPEG, PNG, WebP · 8 MB</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : photos.length === 0 && uploading === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No photos yet — the shop shows a plain cloth placeholder.</p>
      ) : null}
    </Panel>
  );
}
