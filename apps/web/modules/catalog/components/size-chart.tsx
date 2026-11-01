"use client";

import Image from "next/image";
import { RulerIcon } from "@phosphor-icons/react";
import sizeChart from "@/assets/size-chart/size-chart.jpg";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** "Size guide": opens the size chart (measurements per size) in a modal. */
export function SizeChart() {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center gap-2 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-current">
        <RulerIcon className="size-4" />
        Size guide
      </DialogTrigger>
      <DialogContent className="max-h-[92svh] gap-3 overflow-y-auto p-3 sm:max-w-xl sm:p-4">
        <div className="pr-10">
          <DialogTitle className="font-serif text-xl">Size guide</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Measurements in centimetres, ±1–2 cm.
          </DialogDescription>
        </div>
        <Image
          src={sizeChart}
          alt="Oversized T-shirt size chart. Chest ½, length, shoulder and sleeve in cm: S 48, 67, 46, 19; M 50, 68, 48, 19; L 52, 71, 50, 20; XL 54, 75, 52, 20; 2XL 56, 77, 54, 22."
          sizes="(min-width: 640px) 36rem, 100vw"
          placeholder="blur"
          className="h-auto w-full rounded-media"
        />
      </DialogContent>
    </Dialog>
  );
}
