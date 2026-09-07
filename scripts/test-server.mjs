import { spawn } from "node:child_process";
import { startTestDatabase } from "./test-database.mjs";

const database = await startTestDatabase();
const production = process.env.SALDOVA_E2E_PRODUCTION === "1";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", production ? "start" : "dev", "--hostname", "localhost", "--port", "3100"], {
  stdio: "inherit", windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: production ? "production" : "development", SALDOVA_TEST_INSTANCE: production ? "0" : "1", DATABASE_URL: database.url, DIRECT_URL: database.url,
    AUTH_SECRET: "saldova-local-e2e-only-not-a-production-secret-123456789",
    ENCRYPTION_KEY: "a".repeat(64),
    NEXT_PUBLIC_APP_URL: "http://localhost:3100", AUTH_URL: "http://localhost:3100", NEXTAUTH_URL: "http://localhost:3100",
    RESEND_API_KEY: "", MOLLIE_API_KEY: "", MINDEE_API_KEY: "", INBOUND_WEBHOOK_SECRET: "",
    CRON_SECRET: "local-e2e-cron-disabled", NEXT_TELEMETRY_DISABLED: "1",
  },
});
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill(); await database.stop(); process.exit(code);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
child.on("exit", (code) => void stop(code ?? 0));
