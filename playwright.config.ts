import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1920, height: 1080 } },
  webServer: {
    // --host 127.0.0.1: 기본값 localhost는 Node에서 ::1(IPv6)로만 바인딩될 수 있어
    // baseURL의 127.0.0.1에 연결되지 않는다.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    // R43: 기본은 항상 새로 빌드·기동한다. 4173에 남은 preview가 낡은 dist/를
    // 내보내면 게이트가 헛통과하기 때문이다. 반복 실행 시에만 PW_REUSE_SERVER=1.
    reuseExistingServer: !!process.env.PW_REUSE_SERVER,
    timeout: 120_000,
  },
  reporter: [['list']],
});
