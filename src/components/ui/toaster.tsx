"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster({ dir }: { dir: "rtl" | "ltr" }) {
  return (
    <Sonner
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      richColors
      closeButton
      toastOptions={{ className: "font-sans" }}
    />
  );
}
