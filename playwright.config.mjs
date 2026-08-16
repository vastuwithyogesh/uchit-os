import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3011",
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    extraHTTPHeaders: { "x-uchit-demo-role": "SUPER_ADMIN" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
