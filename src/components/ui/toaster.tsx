"use client";

import { useTranslations } from "next-intl";
import { Toaster as Sonner } from "sonner";

export function Toaster({ dir }: { dir: "rtl" | "ltr" }) {
  const t = useTranslations("common");
  return (
    <Sonner
      containerAriaLabel={t("notifications")}
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      richColors
      closeButton
      toastOptions={{ className: "font-sans" }}
    />
  );
}
