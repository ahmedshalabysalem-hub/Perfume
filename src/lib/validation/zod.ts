import { z } from "zod";

/**
 * Validation messages are locale-independent descriptors so the same schema
 * can run on the server and in the browser:
 *
 *   "validation.<key>"                     e.g. "validation.required"
 *   "validation.<key>|<json params>"       e.g. 'validation.tooLong|{"max":120}'
 *
 * The UI translates them with the active locale (see `translateMessage`).
 */
export function vmsg(key: string, params?: Record<string, string | number>): string {
  return params ? `validation.${key}|${JSON.stringify(params)}` : `validation.${key}`;
}

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return issue.input === undefined || issue.input === null || issue.input === ""
          ? vmsg("required")
          : vmsg("invalidType");
      case "too_small": {
        const min = Number(issue.minimum);
        if (issue.origin === "string") return min <= 1 ? vmsg("required") : vmsg("tooShort", { min });
        if (issue.origin === "array" || issue.origin === "set") {
          return min <= 1 ? vmsg("selectAtLeastOne") : vmsg("tooFewItems", { min });
        }
        return vmsg("tooSmall", { min });
      }
      case "too_big": {
        const max = Number(issue.maximum);
        if (issue.origin === "string") return vmsg("tooLong", { max });
        if (issue.origin === "array" || issue.origin === "set") return vmsg("tooManyItems", { max });
        return vmsg("tooBig", { max });
      }
      case "invalid_format":
        if (issue.format === "email") return vmsg("email");
        if (issue.format === "url") return vmsg("url");
        if (issue.format === "uuid" || issue.format === "guid") return vmsg("invalidReference");
        return vmsg("invalidFormat");
      case "invalid_value":
        return vmsg("invalidOption");
      case "invalid_union": {
        // Surface the most specific branch error (e.g. "invalidReference" for
        // a malformed id) instead of a generic message.
        const nested = (issue.errors ?? []).flat();
        const specific = nested.find(
          (inner) => inner.code !== "invalid_type" && inner.code !== "invalid_value" && inner.message.startsWith("validation."),
        );
        return specific?.message ?? vmsg("invalidFormat");
      }
      default:
        // Keep messages supplied explicitly by schemas (refinements etc.).
        return undefined;
    }
  },
});

export { z };

/** Split a message descriptor into an i18n key and its parameters. */
export function parseMessageDescriptor(message: string): {
  key: string;
  params?: Record<string, string | number>;
} {
  const separator = message.indexOf("|");
  if (separator === -1) return { key: message };
  const key = message.slice(0, separator);
  try {
    const params = JSON.parse(message.slice(separator + 1)) as Record<string, string | number>;
    return { key, params };
  } catch {
    return { key };
  }
}
