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
