import type { ReactNode } from "react";

// The real root layout (with <html lang dir>) is src/app/[locale]/layout.tsx.
// This pass-through exists because src/app/not-found.tsx needs a root layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
