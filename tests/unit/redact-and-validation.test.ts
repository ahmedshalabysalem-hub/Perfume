import { describe, expect, it } from "vitest";
import { diffForAudit, redactForAudit } from "@/server/audit/redact";
import { parseMessageDescriptor, vmsg, z } from "@/lib/validation/zod";

describe("redactForAudit", () => {
  it("removes secrets and serialises special values", () => {
    const decimalLike = { toFixed: () => "12.50", isFinite: () => true, toString: () => "12.50" };
    const result = redactForAudit({
      name: "Staff",
      password: "hunter2",
      nested: { sessionToken: "abc", amount: decimalLike, at: new Date("2026-01-01T00:00:00Z") },
      count: 3n,
    });
    expect(result).toEqual({
      name: "Staff",
      password: "[redacted]",
      nested: { sessionToken: "[redacted]", amount: "12.50", at: "2026-01-01T00:00:00.000Z" },
      count: "3",
    });
  });

  it("keeps only changed keys in diffs", () => {
    expect(diffForAudit({ a: 1, b: "x", c: true }, { a: 1, b: "y", c: true })).toEqual({
      before: { b: "x" },
      after: { b: "y" },
    });
  });
});

describe("validation message descriptors", () => {
  it("maps built-in checks to locale-independent keys", () => {
    const schema = z.object({ name: z.string().trim().min(1).max(5), email: z.email() });
    const result = schema.safeParse({ name: "", email: "nope" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => issue.message);
    expect(messages).toContain("validation.required");
    expect(messages).toContain("validation.email");

    const tooLong = schema.safeParse({ name: "abcdefgh", email: "a@b.co" });
    expect(tooLong.error!.issues[0]!.message).toBe(vmsg("tooLong", { max: 5 }));
  });

  it("keeps explicit schema messages", () => {
    const schema = z.string().regex(/^[A-Z]+$/, { error: vmsg("skuFormat") });
    expect(schema.safeParse("abc").error!.issues[0]!.message).toBe("validation.skuFormat");
  });

  it("parses descriptors with parameters", () => {
    expect(parseMessageDescriptor('validation.tooLong|{"max":120}')).toEqual({
      key: "validation.tooLong",
      params: { max: 120 },
    });
    expect(parseMessageDescriptor("validation.required")).toEqual({ key: "validation.required" });
  });
});
