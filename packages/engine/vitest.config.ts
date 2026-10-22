import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    env: { DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused", AI_PROVIDER: "mock", NODE_ENV: "test" },
  },
});
