import { hashPassword } from "better-auth/crypto";
import type { DbClient } from "@/server/db";

// No "server-only" import: used by the seed script as well as the app.

export const CREDENTIAL_PROVIDER_ID = "credential";
export const PASSWORD_POLICY = { minLength: 12, maxLength: 128 } as const;

const COMMON_PASSWORDS = new Set([
  "password1234",
  "password12345",
  "123456789012",
  "qwertyuiopas",
  "changeme1234",
  "administrator",
  "welcome12345",
  "letmein12345",
]);

/**
 * Password policy (NIST SP 800-63B style): length 12–128, not a common
 * password, and not built from the account's own e-mail or name. No forced
 * composition rules; long passphrases are encouraged.
 * Returns i18n message descriptors (empty array when acceptable).
 */
export function checkPasswordPolicy(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_POLICY.minLength) {
    problems.push(`validation.passwordTooShort|${JSON.stringify({ min: PASSWORD_POLICY.minLength })}`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    problems.push(`validation.tooLong|${JSON.stringify({ max: PASSWORD_POLICY.maxLength })}`);
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) {
    problems.push("validation.passwordTooCommon");
  }
  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    problems.push("validation.passwordContainsIdentity");
  }
  return problems;
}

/** Create or replace the e-mail/password credential of a user (scrypt via Better Auth). */
export async function setCredentialPassword(client: DbClient, userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await client.account.upsert({
    where: { providerId_accountId: { providerId: CREDENTIAL_PROVIDER_ID, accountId: userId } },
    update: { password: hash },
    create: { userId, providerId: CREDENTIAL_PROVIDER_ID, accountId: userId, password: hash },
  });
}

/** Revoke every session of a user (forces sign-out everywhere). */
export async function revokeAllSessions(client: DbClient, userId: string): Promise<number> {
  const result = await client.session.deleteMany({ where: { userId } });
  return result.count;
}
