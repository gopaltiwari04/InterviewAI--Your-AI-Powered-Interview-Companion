import { defineConfig } from "vitest/config";

// Optional real-provider tests; see test/live/gemini.live.test.ts.
export default defineConfig({
  test: { include: ["test/live/**/*.test.ts"], testTimeout: 120_000, fileParallelism: false },
});
