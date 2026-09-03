// Playwright 실행 래퍼.
//
// Playwright는 TS 트랜스폼 캐시를 os.tmpdir() 아래에 둔다. 이 개발 PC의 TEMP는
// 한글이 든 경로(C:\Users\<한글 이름>\AppData\Local\Temp)라, 그 경로로 캐시를
// 읽고 쓰는 순간 Node가 네이티브로 죽는다(종료 코드 0xC0000409, 출력 없음).
// PWTEST_CACHE_DIR로 저장소 안(ASCII 경로)을 가리켜 이를 피한다.
// node_modules/ 아래라 .gitignore에 이미 포함된다.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');

const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PWTEST_CACHE_DIR: process.env.PWTEST_CACHE_DIR ?? join(repoRoot, 'node_modules', '.cache', 'playwright-transform'),
  },
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
