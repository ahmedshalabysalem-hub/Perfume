import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Pick the localised field (`nameAr` / `nameEn`), falling back to the other language. */
export function localized(
  locale: string,
  ar: string | null | undefined,
  en: string | null | undefined,
): string {
  const primary = locale === "ar" ? ar : en;
  const fallback = locale === "ar" ? en : ar;
  return (primary && primary.trim()) || (fallback && fallback.trim()) || "";
}
