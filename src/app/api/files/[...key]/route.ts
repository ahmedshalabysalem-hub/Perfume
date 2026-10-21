import { db } from "@/server/db";
import { getStorage, STORAGE_KEY_PATTERN } from "@/server/storage/storage";

/**
 * Serves product images from file storage. Only keys registered in
 * product_images are served, so files that merely exist in the storage
 * directory (or future private documents) are never exposed by this route.
 */
export async function GET(_request: Request, context: RouteContext<"/api/files/[...key]">) {
  const { key: segments } = await context.params;
  const key = segments.join("/");
  if (!STORAGE_KEY_PATTERN.test(key) || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  const image = await db.productImage.findUnique({ where: { storageKey: key }, select: { mimeType: true } });
  if (!image) return new Response("Not found", { status: 404 });
  const body = await getStorage().get(key);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": image.mimeType,
      // Keys are random and never reused, so the content is immutable.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
