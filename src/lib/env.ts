import "server-only";
import { z } from "zod";

const booleanString = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
  AUTH_RATE_LIMIT_ENABLED: booleanString.optional(),
  DEFAULT_MARKET: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("SA"),
  APP_TIME_ZONE: z.string().min(1).default("Asia/Riyadh"),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default("./storage/uploads"),
  /** Hours a storefront order may wait for staff review before it is cancelled; 0 = never (ADR-025). */
  ORDER_REVIEW_HOURS: z.coerce.number().int().min(0).max(720).default(48),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Validation is lazy so that `next build` and
 * tooling can import modules without a fully configured environment; the
 * first request that needs configuration fails fast with a clear message.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
