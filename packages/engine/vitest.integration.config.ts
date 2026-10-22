import { defineConfig } from "vitest/config";

/**
 * Integration tests need PostgreSQL and Redis. Defaults match docker-compose.yml:
 *   docker compose up -d postgres redis
 *   $env:DATABASE_URL="postgresql://admin:password@localhost:5432/interview_ai_test"; pnpm --filter @repo/database migrate:deploy
 *   pnpm --filter @repo/engine test:integration
 * The suite refuses to run against a database whose name does not contain "test".
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://admin:password@localhost:5432/interview_ai_test",
      REDIS_URL: process.env.TEST_REDIS_URL || "redis://localhost:6379/5",
      REALTIME_JWT_SECRET: "integration-test-secret-integration-test-secret",
      AI_PROVIDER: "mock",
      EVALUATION_MODE: "inline",
    },
  },
});
