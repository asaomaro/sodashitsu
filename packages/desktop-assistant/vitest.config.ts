import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "@sodashitsu/desktop-assistant",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
