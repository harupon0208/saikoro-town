import { defineConfig, devices } from '@playwright/test';

// 画面を実際に操作するテスト（e2e/）。ブラウザは PC に入っている Microsoft Edge を使う（ダウンロード不要）。
// 実行: npm run e2e
const PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/saikoro-town/`,
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], viewport: { width: 1280, height: 900 } } },
    {
      name: 'mobile',
      use: { channel: 'msedge', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/saikoro-town/`,
    reuseExistingServer: true,
  },
});
