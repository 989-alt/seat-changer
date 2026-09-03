import { defineConfig } from '@playwright/test';
import { shouldReuseServer } from './scripts/e2e-env.mjs';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1920, height: 1080 } },
  webServer: {
    // --host 127.0.0.1: 기본값 localhost는 Node에서 ::1(IPv6)로만 바인딩될 수 있어
    // baseURL의 127.0.0.1에 연결되지 않는다.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    // R43/R48: 재사용은 PW_REUSE_SERVER=1 센티널로만 켠다(scripts/e2e-env.mjs).
    reuseExistingServer: shouldReuseServer(process.env),
    timeout: 120_000,
  },
  reporter: [['list']],
});
