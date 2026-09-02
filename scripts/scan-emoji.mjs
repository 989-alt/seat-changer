// G4 게이트: src/ 안의 이모지 문자와 이미지 파일 import를 찾는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Extended_Pictographic 중 텍스트 기호(✓ ✕ ★ → ①)는 제외. 변형 선택자(FE0F)는 이모지 표현 강제이므로 포함.
const EMOJI_RE = /\p{Extended_Pictographic}|\u{FE0F}|[\u{1F1E6}-\u{1F1FF}]/u;
const TEXT_SYMBOL_ALLOW = /^[\u2190-\u21FF\u2460-\u24FF\u2500-\u25FF\u2600-\u26FF\u2700-\u27BF]$/u;
const IMAGE_IMPORT_RE = /\bfrom\s+['"][^'"]+\.(png|jpe?g|gif|svg|webp)['"]|\bimport\s+['"][^'"]+\.(png|jpe?g|gif|svg|webp)['"]/;

function hasEmoji(line) {
  for (const ch of line) {
    if (EMOJI_RE.test(ch) && !TEXT_SYMBOL_ALLOW.test(ch)) return true;
  }
  return false;
}

export function findViolations(files) {
  const out = [];
  for (const { path, content } of files) {
    content.split('\n').forEach((line, i) => {
      if (hasEmoji(line)) out.push({ path, line: i + 1, kind: 'emoji' });
      if (IMAGE_IMPORT_RE.test(line)) out.push({ path, line: i + 1, kind: 'image-import' });
    });
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    // *.test.* 픽스처는 위반 패턴을 문자열로 담고 있어 CLI 스캔 대상에서 제외한다.
    else if (/\.(tsx?|css|html|mjs)$/.test(name) && !/\.test\.(tsx?|mjs)$/.test(name)) {
      acc.push({ path: p, content: readFileSync(p, 'utf8') });
    }
  }
  return acc;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const violations = findViolations(walk('src'));
  if (violations.length) {
    for (const v of violations) console.error(`${v.kind}: ${v.path}:${v.line}`);
    console.error(`이모지·이미지 import ${violations.length}건`);
    process.exit(1);
  }
  console.log('scan: 위반 없음');
}
