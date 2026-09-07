import { spawn } from "node:child_process";
import { startTestDatabase } from "./test-database.mjs";

// Build with an empty local database, never with the user's administration.
const database = await startTestDatabase();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit", windowsHide: true,
  env: {
    ...process.env, NODE_ENV: "production", SALDOVA_TEST_INSTANCE: "0",
    DATABASE_URL: database.url, DIRECT_URL: database.url,
    AUTH_SECRET: "saldova-local-build-only-not-a-production-secret-123456789",
    ENCRYPTION_KEY: "a".repeat(64),
    NEXT_PUBLIC_APP_URL: "http://localhost:3100", AUTH_URL: "http://localhost:3100", NEXTAUTH_URL: "http://localhost:3100",
    RESEND_API_KEY: "", MOLLIE_API_KEY: "", MINDEE_API_KEY: "", INBOUND_WEBHOOK_SECRET: "",
    CRON_SECRET: "local-build-cron-disabled", NEXT_TELEMETRY_DISABLED: "1",
  },
});
const code = await new Promise((resolve) => child.on("exit", resolve));
await database.stop();
process.exit(code ?? 1);
