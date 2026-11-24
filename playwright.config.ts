import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = isCI ? 3100 : 3000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: isCI,
  reporter: isCI ? "github" : "list",
  use: { baseURL },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: `pnpm ${isCI ? "start" : "dev"} --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
