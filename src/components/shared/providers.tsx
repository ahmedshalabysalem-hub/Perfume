"use client";

import { Direction } from "radix-ui";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";

/** Client-side providers: reading direction for Radix primitives, toasts. */
export function Providers({ dir, children }: { dir: "rtl" | "ltr"; children: ReactNode }) {
  return (
    <Direction.Provider dir={dir}>
      {children}
      <Toaster dir={dir} />
    </Direction.Provider>
  );
}
