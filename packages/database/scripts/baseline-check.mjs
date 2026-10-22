/**
 * Checks that an existing database (created with `prisma db push` before
 * migrations existed) matches migration 0_init exactly. Run it before
 * `baseline:resolve` so the upgrade migration starts from a known state.
 *
 *   $env:DATABASE_URL = "<direct, non-pooled connection string>"
 *   pnpm --filter @repo/database baseline:check
 */
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL (use the direct, non-pooled connection string) before running this check.");
  process.exit(2);
}
const result = spawnSync(
  "npx",
  ["prisma", "migrate", "diff", "--from-url", process.env.DATABASE_URL, "--to-schema-datamodel", "prisma/baseline/schema.prisma", "--script", "--exit-code"],
  { stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32", encoding: "utf8" },
);
if (result.status === 0) {
  console.log("OK: the database matches the 0_init baseline. Next: pnpm --filter @repo/database baseline:resolve, then migrate:deploy.");
} else if (result.status === 2) {
  console.error("The database differs from the 0_init baseline. SQL needed to reach the baseline:\n");
  console.error(result.stdout);
  console.error("Fix these differences (or ask for help) before marking 0_init as applied.");
} else {
  console.error("prisma migrate diff failed.");
}
process.exit(result.status ?? 1);
