/**
 * Synchronise the permission catalogue and system roles defined in code with
 * the database. Run after every deploy that changes src/server/rbac/*.
 *
 *   npm run db:sync-rbac
 */
import { syncRbac } from "../src/server/rbac/sync";
import { createScriptClient } from "./lib/prisma";

const client = createScriptClient();

try {
  const report = await client.$transaction((tx) => syncRbac(tx));
  console.info("RBAC synchronised:", report);
} finally {
  await client.$disconnect();
}
