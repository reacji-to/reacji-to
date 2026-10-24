import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['posthole.spec.js', 'quick-reaction.spec.js', 'raycast.spec.js', 'selection.spec.js', 'slack.spec.js', 'updates.spec.js'],
  timeout: 30000,
  use: { headless: true, viewport: { width: 1280, height: 900 } },
  workers: 2,
});
