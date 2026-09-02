// G4 게이트: src/ 안의 이모지 문자, 이미지 경로 참조, 이미지 파일 자체를 찾는다.
// 보장 범위: 정적 텍스트 기준 검사이며 문자열 결합·보간으로 만든 경로는 잡지 못한다.
// 런타임 이미지 요청은 G7(Playwright 네트워크 탭)이 검사한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 이모지 판정: 이모지 표시가 기본인 문자, 그림문자, 국기 지역표시, 변형선택자
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}|\u{FE0F}|[\u{1F1E6}-\u{1F1FF}]/u;
// 텍스트 기호로 쓰는 것만 명시적으로 허용 (범위 허용 금지)
const TEXT_SYMBOL_ALLOW = new Set([...'✓✕✗★☆→←↑↓①②③④⑤⑥⑦⑧⑨⑩']);
// 정적/동적 import, new URL(...), ?url·#hash 접미사, CSS url() 등 이미지 경로 텍스트를 모두 잡는다.
const IMAGE_IMPORT_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)(?=['"`)?#\s]|$)/i;
// src/ 안에 이미지 파일 자체가 존재해서는 안 된다.
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i;

function decodeEscapes(line) {
  return line.replace(/(\\+)u(?:\{([0-9a-fA-F]{1,6})\}|([0-9a-fA-F]{4}))/g, (m, slashes, braced, plain) =>
    slashes.length % 2 === 0 ? m : slashes.slice(0, -1) + String.fromCodePoint(parseInt(braced ?? plain, 16)),
  );
}

function hasEmoji(line) {
  const decoded = decodeEscapes(line);
  for (const ch of decoded) {
    if (TEXT_SYMBOL_ALLOW.has(ch)) continue;
    if (EMOJI_RE.test(ch)) return true;
  }
  return false;
}

export function isImageFile(name) {
  return IMAGE_FILE_RE.test(name);
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

function walk(dir, files = [], imageFiles = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, files, imageFiles);
    } else if (isImageFile(name)) {
      imageFiles.push({ path: p, line: 0, kind: 'image-file' });
    } else if (/\.(tsx?|jsx?|cjs|css|html|mjs)$/.test(name)) {
      files.push({ path: p, content: readFileSync(p, 'utf8') });
    }
  }
  return { files, imageFiles };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files, imageFiles } = walk('src');
  const violations = [...findViolations(files), ...imageFiles];
  if (violations.length) {
    for (const v of violations) console.error(`${v.kind}: ${v.path}:${v.line}`);
    console.error(`이모지·이미지 참조·이미지 파일 ${violations.length}건`);
    process.exit(1);
  }
  console.log('scan: 위반 없음');
}
