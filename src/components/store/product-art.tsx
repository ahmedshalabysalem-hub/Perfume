/**
 * Illustrated bottle shown when a product has no uploaded photo. The liquid
 * tone follows the fragrance family; the silhouette varies by product so a
 * grid of illustrations does not look repetitive. Pure SVG: no requests.
 */
const PALETTES: Record<string, [string, string]> = {
  OUD: ["#5b3418", "#a2632c"],
  AMBER: ["#b26d22", "#e7b25a"],
  FLORAL: ["#c97888", "#f1c6cf"],
  WOODY: ["#5f4e34", "#9e8659"],
  FRESH: ["#6fa9a1", "#cbe6df"],
  MUSK: ["#d9cfc0", "#f8f3ec"],
  GOURMAND: ["#9a5a31", "#dca36a"],
  AROMATIC: ["#6f8560", "#bccaa9"],
};

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}

export function ProductArt({
  seed,
  family,
  label,
  className,
}: {
  seed: string;
  family: string | null;
  label: string;
  className?: string;
}) {
  const [deep, light] = PALETTES[family ?? ""] ?? ["#b8975c", "#ecd9ae"];
  const shape = hash(seed) % 3;
  const id = `art-${seed.replace(/[^a-z0-9-]/gi, "")}`;
  const body =
    shape === 0
      ? "M70 92 h60 a14 14 0 0 1 14 14 v86 a18 18 0 0 1 -18 18 h-52 a18 18 0 0 1 -18 -18 v-86 a14 14 0 0 1 14 -14z"
      : shape === 1
        ? "M100 88 c32 0 44 22 44 52 v54 a16 16 0 0 1 -16 16 h-56 a16 16 0 0 1 -16 -16 v-54 c0 -30 12 -52 44 -52z"
        : "M78 90 h44 l26 30 v76 a14 14 0 0 1 -14 14 h-68 a14 14 0 0 1 -14 -14 v-76z";
  return (
    <svg viewBox="0 0 200 240" role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6efe4" />
          <stop offset="1" stopColor="#e9dfcf" />
        </linearGradient>
        <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a6a36" />
          <stop offset="0.5" stopColor="#e2c48a" />
          <stop offset="1" stopColor="#8a6a36" />
        </linearGradient>
      </defs>
      <rect width="200" height="240" fill={`url(#${id}-bg)`} />
      <ellipse cx="100" cy="214" rx="58" ry="7" fill="#1f1a17" opacity="0.08" />
      <rect x="84" y="46" width="32" height="30" rx="5" fill={`url(#${id}-cap)`} />
      <rect x="92" y="74" width="16" height="16" fill="#cdb48a" />
      <path d={body} fill={`url(#${id}-liquid)`} opacity="0.92" />
      <path d={body} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" />
      <path
        d="M74 112 q-4 40 2 78"
        stroke="#ffffff"
        strokeOpacity="0.45"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="80" y="146" width="40" height="22" rx="3" fill="#fbf8f3" fillOpacity="0.85" />
      <line x1="88" y1="154" x2="112" y2="154" stroke="#1f1a17" strokeOpacity="0.5" strokeWidth="1.5" />
      <line x1="92" y1="160" x2="108" y2="160" stroke="#1f1a17" strokeOpacity="0.3" strokeWidth="1.2" />
    </svg>
  );
}
