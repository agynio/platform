import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      "@prisma/client": path.resolve(__dirname, "__tests__/__mocks__/prisma.client.ts"),
    },
  },
});
