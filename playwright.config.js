import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', timeout: 30000, use: { headless: true, viewport: { width: 1280, height: 900 } }, workers: 2 });
