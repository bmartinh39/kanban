import { defineConfig, devices } from "@playwright/test";
import { basename, dirname } from "node:path";
import { createUiTestServer } from "./scripts/playwright-server";

const port = process.env.PLAYWRIGHT_PORT ?? "3210";
const baseURL = "http://localhost:" + port;
const webServer = createUiTestServer(port);
const runId = basename(dirname(webServer.env.DATABASE_PATH));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  outputDir: `test-results/ui/${runId}`,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `playwright-report/ui/${runId}` }],
    ["./scripts/playwright-cleanup.ts", { databaseDirectory: dirname(webServer.env.DATABASE_PATH) }],
  ],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer,
});
