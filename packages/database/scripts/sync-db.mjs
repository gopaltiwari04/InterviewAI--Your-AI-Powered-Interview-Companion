import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");

if (!process.env.DATABASE_URL) {
  console.log("[sync-db] DATABASE_URL is not set; skipping database synchronization.");
  process.exit(0);
}

console.log("[sync-db] Synchronizing database schema...");

try {
  execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[sync-db] Prisma migrations applied successfully.");
} catch (migErr) {
  console.warn("[sync-db] migrate deploy did not complete cleanly, attempting db push fallback...", migErr?.message ?? "");
  try {
    execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
      stdio: "inherit",
      env: process.env,
    });
    console.log("[sync-db] prisma db push synchronized all tables successfully.");
  } catch (pushErr) {
    console.error("[sync-db] Database push warning:", pushErr?.message ?? pushErr);
  }
}
