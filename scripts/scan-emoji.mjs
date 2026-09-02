// G4 게이트: src/ 안의 이모지 문자와 이미지 파일 import를 찾는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 이모지 판정: 이모지 표시가 기본인 문자, 그림문자, 국기 지역표시, 변형선택자
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}|\u{FE0F}|[\u{1F1E6}-\u{1F1FF}]/u;
// 텍스트 기호로 쓰는 것만 명시적으로 허용 (범위 허용 금지)
const TEXT_SYMBOL_ALLOW = new Set([...'✓✕✗★☆→←↑↓①②③④⑤⑥⑦⑧⑨⑩']);
const IMAGE_IMPORT_RE = /\bfrom\s+['"][^'"]+\.(png|jpe?g|gif|svg|webp)['"]|\bimport\s+['"][^'"]+\.(png|jpe?g|gif|svg|webp)['"]|\bimport\(\s*['"][^'"]+\.(png|jpe?g|gif|svg|webp)['"]/i;

function hasEmoji(line) {
  for (const ch of line) {
    if (TEXT_SYMBOL_ALLOW.has(ch)) continue;
    if (EMOJI_RE.test(ch)) return true;
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
    else if (/\.(tsx?|css|html|mjs)$/.test(name)) acc.push({ path: p, content: readFileSync(p, 'utf8') });
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
