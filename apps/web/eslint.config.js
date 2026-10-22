import { nextJsConfig } from "@repo/eslint-config/next-js";
import { globalIgnores } from "eslint/config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // temp-app is an unrelated create-next-app scaffold left in the repo; playwright output is generated.
  globalIgnores(["temp-app/**", "playwright-report/**", "test-results/**", ".next/**"]),
];
