import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

function flatten(object: Record<string, unknown>, prefix = ""): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") Object.assign(output, flatten(value as Record<string, unknown>, path));
    else output[path] = String(value);
  }
  return output;
}

const placeholders = (message: string) => [...message.matchAll(/\{(\w+)(?:,|\})/g)].map((match) => match[1]).sort();

describe("message catalogues", () => {
  const enFlat = flatten(en);
  const arFlat = flatten(ar);

  it("Arabic has exactly the same keys as English", () => {
    expect(Object.keys(arFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it("no message is empty", () => {
    for (const [key, value] of [...Object.entries(enFlat), ...Object.entries(arFlat)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of Object.keys(enFlat)) {
      expect(placeholders(arFlat[key] ?? ""), key).toEqual(placeholders(enFlat[key] ?? ""));
    }
  });
});

describe("labels for stored codes", () => {
  const enFlat = flatten(en);
  const arFlat = flatten(ar);

  it("every permission module has a name in both languages", async () => {
    const { PERMISSIONS } = await import("../../src/server/rbac/permissions");
    for (const name of new Set(PERMISSIONS.map((permission) => permission.module))) {
      expect(enFlat[`permissionModules.${name}`], name).toBeTruthy();
      expect(arFlat[`permissionModules.${name}`], name).toBeTruthy();
    }
  });

  it("every audit action written by the code has a label in both languages", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [],
      );
    const actions = new Set<string>();
    for (const file of [...files("src/server"), ...files("src/app"), "prisma/seed.ts"]) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!/\baction:/.test(line)) continue;
        for (const match of line.matchAll(/["`]([a-z_]+(?:\.(?:[a-z_]+|\$\{kind\}))+)/g)) {
          if (!match[1]!.endsWith("${kind}")) actions.add(match[1]!);
        }
        if (line.includes("${kind}.${isActive")) {
          for (const kind of ["family", "concentration", "note"]) {
            actions.add(`catalog.${kind}.activate`).add(`catalog.${kind}.deactivate`);
          }
        }
      }
    }
    const expanded = [...actions].flatMap((action) =>
      action.includes("${kind}")
        ? ["family", "concentration", "note"].map((kind) => action.replace("${kind}", kind))
        : [action],
    );
    expect(expanded).toContain("auth.login");
    for (const action of expanded) {
      expect(enFlat[`auditActions.${action}`], action).toBeTruthy();
      expect(arFlat[`auditActions.${action}`], action).toBeTruthy();
    }
  });
});
