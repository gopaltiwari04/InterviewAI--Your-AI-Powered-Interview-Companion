/**
 * Bundles a Node service (ws-server, code-executor, worker) into dist/index.js.
 *
 * Workspace packages (@repo/*) are TypeScript sources, so they are bundled in;
 * the service's own npm dependencies stay external and are installed normally.
 *
 *   node ../../scripts/bundle.mjs src/index.ts dist/index.js
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const [entry = "src/index.ts", outfile = "dist/index.js"] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).filter((name) => !name.startsWith("@repo/"));

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  external: [...external, "@prisma/client", ".prisma/client"],
  logLevel: "info",
  legalComments: "none",
});
