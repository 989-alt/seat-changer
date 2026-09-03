// Playwright 실행 래퍼.
//
// Playwright는 TS 트랜스폼 캐시를 os.tmpdir() 아래에 둔다. 이 개발 PC의 TEMP는
// 한글이 든 경로(C:\Users\<한글 이름>\AppData\Local\Temp)라, 그 경로로 캐시를
// 읽고 쓰는 순간 Node가 네이티브로 죽는다(종료 코드 0xC0000409, 출력 없음).
// PWTEST_CACHE_DIR로 저장소 안(ASCII 경로)을 가리켜 이를 피한다.
// node_modules/ 아래라 .gitignore에 이미 포함된다.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');

// R47: 빈 문자열은 "설정되지 않음"으로 본다(||). Playwright 쪽 기본값 판정과도 같다.
// R48: 상대경로는 cwd(한글일 수 있다)에 붙어 그대로 크래시를 재현하므로,
// 먼저 절대경로로 풀어낸 뒤에 ASCII를 검사하고, 그 절대경로를 자식에게 넘긴다.
const cacheDir = resolve(
  repoRoot,
  process.env.PWTEST_CACHE_DIR || join('node_modules', '.cache', 'playwright-transform'),
);

const isAscii = (s) => [...s].every((c) => c.codePointAt(0) < 128);
if (process.platform === 'win32' && !isAscii(cacheDir)) {
  console.error(
    `PWTEST_CACHE_DIR이 가리키는 경로에 비 ASCII 문자가 있어 Playwright가 네이티브로 죽는다: ${cacheDir}\n` +
      'ASCII 절대경로를 직접 지정해라. 예: set PWTEST_CACHE_DIR=C:\\pw-cache',
  );
  process.exit(1);
}

const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, PWTEST_CACHE_DIR: cacheDir },
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
