"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon weight="fill" className="size-4 text-success" />
        ),
        info: <InfoIcon className="size-4" />,
        warning: <WarningIcon weight="fill" className="size-4 text-clay" />,
        error: (
          <XCircleIcon weight="fill" className="size-4 text-destructive" />
        ),
        loading: <SpinnerIcon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !gap-3 !rounded-panel !px-4 !py-3.5 !font-sans !text-[0.8125rem] !shadow-[0_18px_40px_-18px_oklch(0.2_0.012_60/0.35)]",
          description: "!text-muted-foreground",
          actionButton:
            "!rounded-control !bg-primary !px-3 !text-xs !font-medium !text-primary-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
