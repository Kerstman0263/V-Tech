import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit-tests voor de pure kernlogica (rechten, factuurberekening, plannen,
// marketing). Bewust geen DB/Next nodig — snel en betrouwbaar.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
