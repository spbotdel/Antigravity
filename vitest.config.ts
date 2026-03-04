import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./lib/test/setup.ts"]
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname
    }
  }
});
