"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        className: "!bg-surface !text-foreground !border-border",
      }}
    />
  );
}
