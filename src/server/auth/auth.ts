import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { env, isProduction } from "@/lib/env";
import { db } from "@/server/db";

export const AUTH_COOKIE_PREFIX = "perfume";
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

function createAuth() {
  const config = env();
  return betterAuth({
    appName: "Perfume Commerce",
    baseURL: config.APP_URL,
    basePath: "/api/auth",
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      // Phase 1 has staff accounts only, provisioned by administrators.
      // Customer self-registration arrives with the storefront account module.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      // Sliding expiry: idle sessions expire after 12 hours; active ones are
      // extended at most once per hour. Sessions live in the database, so
      // deactivating a user or resetting a password revokes them immediately.
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      freshAge: 60 * 15,
      cookieCache: { enabled: false },
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    account: {
      accountLinking: { enabled: false },
    },
    rateLimit: {
      enabled: config.AUTH_RATE_LIMIT_ENABLED ?? isProduction(),
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: isProduction(),
      database: { generateId: "uuid" },
      // Better Auth silently disables origin/CSRF checks when NODE_ENV=test
      // (or TEST=true). Pin them on so a misconfigured environment can never
      // run without CSRF protection; tests exercise the real checks.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    databaseHooks: {
      session: {
        create: {
          // Only ACTIVE users may obtain a session (deactivated / suspended
          // accounts cannot sign in even with the correct password).
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (!user || user.status !== "ACTIVE") return false;
          },
          after: async (session) => {
            await db.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: session.userId },
                data: { lastLoginAt: new Date() },
              });
              await tx.auditLog.create({
                data: {
                  actorType: "USER",
                  actorUserId: session.userId,
                  action: "auth.login",
                  entityType: "user",
                  entityId: session.userId,
                  summary: "Signed in",
                  ipAddress: session.ipAddress?.slice(0, 64) ?? null,
                  userAgent: session.userAgent?.slice(0, 512) ?? null,
                },
              });
            });
          },
        },
      },
    },
    telemetry: { enabled: false },
    // nextCookies must stay last: it applies Set-Cookie headers from auth.api
    // calls made inside Server Actions.
    plugins: [nextCookies()],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __auth?: AuthInstance };

/** Lazily constructed so that importing this module never requires secrets. */
export function getAuth(): AuthInstance {
  if (!globalForAuth.__auth) {
    globalForAuth.__auth = createAuth();
  }
  return globalForAuth.__auth;
}
