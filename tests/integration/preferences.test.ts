import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { getPreferredLocale, setOwnPreferredLocale } from "@/server/modules/access/preferences.service";
import { auditEntries, seedFixture, type Fixture } from "./fixtures";

let f: Fixture;

beforeEach(async () => {
  f = await seedFixture();
});

const userId = (ctx: Fixture["cashier"]) => (ctx.actor.kind === "user" ? ctx.actor.userId : "");

describe("preferred UI language", () => {
  it("saves the signed-in user's own language with an audit entry, and nothing else", async () => {
    const id = userId(f.cashier);
    const before = await db.user.findUniqueOrThrow({ where: { id }, include: { roleAssignments: true } });

    await setOwnPreferredLocale(f.cashier, { locale: "en" });

    const after = await db.user.findUniqueOrThrow({ where: { id }, include: { roleAssignments: true } });
    expect(after.preferredLocale).toBe("en");
    expect(await getPreferredLocale(id)).toBe("en");
    // Language is not scope: role assignments (country, entity, store, warehouse) are untouched.
    expect(after.roleAssignments).toEqual(before.roleAssignments);
    const [entry] = await auditEntries("users.preferences.update");
    expect(entry?.entityId).toBe(id);
    expect(entry?.actorUserId).toBe(id);
    expect(entry?.before).toEqual({ preferredLocale: before.preferredLocale });
    expect(entry?.after).toEqual({ preferredLocale: "en" });
  });

  it("does not write or audit when the language is unchanged", async () => {
    await setOwnPreferredLocale(f.cashier, { locale: "ar" });
    await setOwnPreferredLocale(f.cashier, { locale: "ar" });
    expect(await auditEntries("users.preferences.update")).toHaveLength(1);
  });

  it("rejects languages the application does not offer", async () => {
    for (const locale of ["fr", "", "ar-SA", null]) {
      const error = await setOwnPreferredLocale(f.cashier, { locale }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION");
    }
    expect(await getPreferredLocale(userId(f.cashier))).toBeNull();
  });

  it("changes only the caller's own account", async () => {
    await setOwnPreferredLocale(f.viewer, { locale: "en" });
    expect(await getPreferredLocale(userId(f.viewer))).toBe("en");
    expect(await getPreferredLocale(userId(f.cashier))).toBeNull();
    expect(await getPreferredLocale(userId(f.superAdmin))).toBeNull();
  });
});
