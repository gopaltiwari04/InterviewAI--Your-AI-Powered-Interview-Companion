/**
 * Fails if anything server-only ended up in the browser bundle of apps/web:
 * hidden test data, reference solutions, rubric key points or secret-looking
 * environment values. Run after `pnpm --filter web build`.
 *
 *   node scripts/check-client-bundle.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(root, "apps/web/.next/static");
const dataset = JSON.parse(readFileSync(path.join(root, "packages/problem-bank/generated/dataset.json"), "utf8"));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

let bundle;
try {
  bundle = files(staticDir)
    .filter((f) => /\.(js|css|json|txt|html)$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
} catch {
  console.error(`No client bundle at ${staticDir}. Run: pnpm --filter web build`);
  process.exit(2);
}

const needles = [];
for (const [slug, problem] of Object.entries(dataset.problems)) {
  for (const t of problem.tests.filter((t) => !t.visible)) {
    // Long hidden inputs are distinctive; short ones like "5\n" would match anything.
    if (t.input.length >= 40) needles.push({ what: `hidden test input (${slug}/${t.id})`, text: t.input.slice(0, 120) });
  }
}
// Distinctive lines from reference solutions and rubric content.
needles.push({ what: "reference solution marker", text: "return sorted([order[lo], order[hi]])" });
needles.push({ what: "reference solution marker", text: "const seen = new Map([[0, 1]]);" });
needles.push({ what: "rubric key point", text: "Collisions are handled by chaining or open addressing" });
needles.push({ what: "dataset generator", text: "packages/problem-bank/scripts/build-dataset.ts" });

const secretPatterns = [
  { what: "Google API key", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { what: "connection string with credentials", re: /(postgres(ql)?|rediss?):\/\/[^\s"'/]+:[^\s"'@]+@/ },
  { what: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const found = needles.filter((n) => bundle.includes(n.text)).map((n) => n.what);
for (const p of secretPatterns) if (p.re.test(bundle)) found.push(p.what);

if (found.length) {
  console.error(`Server-only data found in the client bundle:\n - ${[...new Set(found)].join("\n - ")}`);
  process.exit(1);
}
console.log(`OK: checked ${needles.length} hidden-data markers and ${secretPatterns.length} secret patterns; none are in the client bundle.`);
