import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/env.ts",
        "lib/logger.ts",
        "lib/queue.ts",
        "lib/supabase/types.ts",
        "lib/supabase/admin.ts",
        "lib/supabase/server.ts",
        "lib/supabase/browser.ts",
        "lib/asaas/client.ts",
        "lib/jobs/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": `${rootDir}workers/stubs/server-only.ts`,
    },
  },
});
