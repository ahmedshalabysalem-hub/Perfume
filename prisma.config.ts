import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env automatically and no longer reads the
// connection URL from schema.prisma. `process.env` is used (instead of the
// throwing `env()` helper) so that `prisma generate` works in environments
// without a database URL, such as `npm install` in CI.
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
