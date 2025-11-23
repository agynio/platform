import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.{test,spec}.ts", "__e2e__/**/*.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
