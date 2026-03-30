// bundle.js 빌드 스크립트
// 개별 모듈 파일들을 하나의 IIFE 번들로 합침
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'js');

// 번들 순서 (의존성 순)
const files = [
  'data/models.js',
  'data/store.js',
  'utils/toast.js',
  'utils/roster-parser.js',
  'layouts/layout-engine.js',
  'layouts/exam-layout.js',
  'layouts/pair-layout.js',
  'layouts/ushape-layout.js',
  'layouts/custom-layout.js',
  'layouts/group-layout.js',
  'components/seat-grid.js',
  'components/student-roster.js',
  'components/fixed-seat-editor.js',
  'components/constraint-editor.js',
  'algorithm/seat-randomizer.js',
  'screens/teacher-screen.js',
  'screens/student-screen.js',
  'app.js'
];

let bundle = `// ============================================================
// 자리바꾸기 - 번들 (file:// 호환)
// 자동 생성됨 - 직접 수정하지 마세요
// ============================================================
(function() {
'use strict';

`;

for (const file of files) {
  const filePath = path.join(BASE, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${file} not found, skipping`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // import 문 제거
  content = content.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
  content = content.replace(/^import\s+['"].*?['"];?\s*$/gm, '');

  // export 키워드 제거
  content = content.replace(/^export\s+(function|const|let|var|class|async\s+function)/gm, '$1');
  content = content.replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  content = content.replace(/^export\s+default\s+/gm, '');

  // 빈 줄 정리
  content = content.replace(/\n{3,}/g, '\n\n');

  bundle += `// === ${file} ===\n`;
  bundle += content.trim();
  bundle += '\n\n';
}

bundle += '})();\n';

const outPath = path.join(BASE, 'bundle.js');
fs.writeFileSync(outPath, bundle, 'utf-8');
console.log(`Bundle written to ${outPath} (${bundle.length} bytes)`);
