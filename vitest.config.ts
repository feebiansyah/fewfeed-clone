import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: "mysql://test:test@127.0.0.1:3306/fewfeed_test",
    },
  },
});
