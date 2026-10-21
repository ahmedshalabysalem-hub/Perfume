import type messages from "../../messages/en.json";
import type { routing } from "./routing";

// Type-safe message keys: a key missing from messages/en.json fails `tsc`.
// messages/ar.json is checked for parity by tests/unit/messages.test.ts.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
