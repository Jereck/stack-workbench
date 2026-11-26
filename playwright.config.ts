import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = isCI ? 3100 : 3000;
const hostname = isCI ? "127.0.0.1" : "localhost";
const baseURL = `http://${hostname}:${port}`;
const developmentURL = isCI ? "http://127.0.0.1:3101" : baseURL;
const developmentTests = /@development/;
const releaseTests = /@release/;
const releaseBrowsers = process.env.STACK_WORKBENCH_RELEASE_BROWSERS === "1";

const defaultServer = {
  command: `pnpm ${isCI ? "start" : "dev"} --hostname ${hostname} --port ${port}`,
  url: baseURL,
  reuseExistingServer: !isCI,
  timeout: 120_000,
  env: { NEXT_TELEMETRY_DISABLED: "1" },
};

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: isCI,
  reporter: isCI ? "github" : "list",
  use: { baseURL },
  projects: [
    {
      name: "chromium",
      grepInvert: developmentTests,
      use: devices["Desktop Chrome"],
    },
    ...(releaseBrowsers
      ? [
          {
            name: "firefox",
            grep: releaseTests,
            use: devices["Desktop Firefox"],
          },
          {
            name: "webkit",
            grep: releaseTests,
            use: devices["Desktop Safari"],
          },
        ]
      : [
          {
            name: "chromium-development",
            grep: developmentTests,
            use: { ...devices["Desktop Chrome"], baseURL: developmentURL },
          },
        ]),
  ],
  webServer:
    isCI && !releaseBrowsers
      ? [
          defaultServer,
          {
            ...defaultServer,
            command: "pnpm dev --hostname 127.0.0.1 --port 3101",
            url: developmentURL,
          },
        ]
      : defaultServer,
});
