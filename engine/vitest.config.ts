import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // This package is the single source of every dollar figure shown to
      // users; every exported function must stay tested, and untested lines
      // need a very good excuse.
      thresholds: {
        functions: 100,
        statements: 95,
        branches: 95,
        lines: 95,
      },
    },
  },
});
