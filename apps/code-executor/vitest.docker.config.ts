import { defineConfig } from "vitest/config";

// Requires a running Docker daemon. Run with: pnpm --filter code-executor test:docker
export default defineConfig({
  test: {
    include: ["test/docker/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
