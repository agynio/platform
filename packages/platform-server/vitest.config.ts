import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.{test,spec}.ts", "__e2e__/**/*.test.ts"],
    setupFiles: ["./__tests__/vitest.setup.ts"],
    env: {
      DOCKER_RUNNER_GRPC_HOST: "docker-runner",
      DOCKER_RUNNER_GRPC_PORT: "50051",
      DOCKER_RUNNER_SHARED_SECRET: "test-shared-secret",
    },
    fileParallelism: false,
    coverage: {
      enabled: false,
    },
  },
});
