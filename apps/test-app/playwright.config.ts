import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4303",
    headless: true
  },
  webServer: [
    {
      command: "cd ../.. && pnpm --filter @pinpatch/test-app exec vite --host 0.0.0.0 --port 3100",
      port: 3100,
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command:
        "cd ../.. && pnpm --filter @pinpatch/ui build && pnpm --filter @pinpatch/overlay build && PINPATCH_PROVIDER_FIXTURE=1 pnpm --filter pinpatch exec tsx src/index.ts dev --target 3100 --proxy-port 4303 --bridge-port 7339 --debug",
      port: 4303,
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
