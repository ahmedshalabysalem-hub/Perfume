"use client";

import "./globals.css";

// Last-resort boundary for errors in the root layout itself. Deliberately
// dependency-free (no i18n provider is available at this level).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" dir="ltr">
      <body className="flex min-h-dvh items-center justify-center p-6">
        <main className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Something went wrong · حدث خطأ غير متوقع</h1>
          <button type="button" onClick={() => reset()} className="mt-6 rounded-md border px-4 py-2 text-sm">
            Try again · حاول مرة أخرى
          </button>
        </main>
      </body>
    </html>
  );
}
