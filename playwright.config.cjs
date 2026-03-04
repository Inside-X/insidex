// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e-browser',
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
  },
webServer: {
  command: 'node node_modules/prisma/build/index.js generate && npm run start',
  url: 'http://127.0.0.1:3000/checkout.html',
  reuseExistingServer: true,
  timeout: 120_000,
  env: {
    PORT: '3000',
    NODE_ENV: 'development',
  },
},
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});