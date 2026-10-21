import "./globals.css";

// Requests outside any locale (rare: the proxy redirects to /ar or /en).
export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="flex min-h-dvh items-center justify-center p-6">
        <main className="max-w-md text-center">
          <p className="font-display text-6xl">404</p>
          <h1 className="mt-4 text-xl font-semibold">Page not found · الصفحة غير موجودة</h1>
          <p className="mt-6 flex justify-center gap-4 text-sm">
            <a className="underline" href="/ar">
              العربية
            </a>
            <a className="underline" href="/en">
              English
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
