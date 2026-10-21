/** URL path under which uploaded catalogue images are served (see /api/files). */
export function publicFileUrl(key: string): string {
  return `/api/files/${key}`;
}
