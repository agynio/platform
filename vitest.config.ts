import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Look for tests anywhere under apps/* and packages/*
    include: ["**/__tests__/**/*.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
