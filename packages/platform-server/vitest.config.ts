import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.{test,spec}.ts", "__e2e__/**/*.test.ts"],
    setupFiles: ["./__tests__/vitest.setup.ts"],
    env: {
      DOCKER_RUNNER_BASE_URL: "http://docker-runner:7071",
      DOCKER_RUNNER_ACCESS_KEY: "test-access-key",
      DOCKER_RUNNER_SHARED_SECRET: "test-shared-secret",
    },
    coverage: {
      enabled: false,
    },
  },
});
