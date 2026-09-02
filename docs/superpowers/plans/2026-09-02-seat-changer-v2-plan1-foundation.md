# 자리바꾸기 v2 구현 계획 1/3 — 기반·core·스토어 (Phase 0~2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vite + React + TS 프로젝트를 세우고, 코르크보드 디자인 시스템의 프리미티브 컴포넌트와, v1 알고리즘·배치 계산·저장소를 순수 TS `core/`로 이식하며, 기존 localStorage 데이터를 그대로 읽는 Zustand 스토어까지 완성한다.

**Architecture:** 레거시 앱은 `legacy/`로 옮겨 그대로 보존하고(골든 테스트의 비교 기준), 새 앱은 `src/`에서 자란다. `src/core/`는 React·DOM 의존이 없는 순수 TS이며 ESLint로 강제한다. 스토어는 Zustand persist가 v1과 같은 localStorage 키를 읽고 쓰고, zundo가 배치·규칙 편집의 Undo/Redo를 담당한다. 모든 Task는 `npm run gate`(typecheck → lint → test → 이모지·이미지 스캔)를 통과해야 커밋한다.

**Tech Stack:** Node 24, Vite 7, React 19, TypeScript 5.9, Tailwind CSS 4(@tailwindcss/vite), Zustand 5 + zundo 2, zod 4, lucide-react, Vitest 3 + @testing-library/react 16 + jsdom, Playwright 1.56, ESLint 9(flat config).

**Spec:** `docs/superpowers/specs/2026-09-02-seat-changer-v2-design.md` (이 계획은 스펙 1·2·3·4·8·9장을 구현한다. 5·6·7장은 계획 2·3에서.)

## Global Constraints

- 작업 경로는 반드시 `C:\Users\Public\seat-changer`, 브랜치 `v2`. 한글 홈 경로에서는 vite build가 크래시한다.
- `src/` 어디에도 이모지 문자를 쓰지 않는다(UI 문구·주석·테스트 포함). 아이콘은 `lucide-react`만.
- `src/`에서 `.png/.jpg/.gif/.svg` 파일 import 금지. 질감은 CSS로 그린다.
- `src/core/**`는 `react`, `react-dom`, `zustand`, `window`, `document`, `localStorage`를 import·참조하지 않는다.
- localStorage 키는 v1과 동일: `seat-changer-classes`, `seat-changer-active`, `seat-changer-data-<반이름>`. 새 키 추가 금지(효과음 설정 `seat-changer-sound`는 계획 2에서).
- 다반 최대 15개, 학생 최대 100명, 이름 50자, 배치 행·열 1~12.
- 커밋 메시지는 한국어, 아래 두 줄로 끝낸다.
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GarXkHEdarqdnbpiCDuibK
  ```
- 각 Task 완료 시 `docs/superpowers/gates/<task-id>.md`에 게이트 결과(통과 시각, 루프 횟수, 마지막 지적)를 남긴다. 파일 템플릿은 Task 2에서 만든다.
- 커밋 전에 항상 `npm run gate`가 초록이어야 한다.

## 파일 구조 (이 계획이 만드는 것)

```
legacy/                       # v1 전체 (index.html, css/, js/, build.js, test-logic.mjs). 수정 금지
index.html                    # Vite 진입
vercel.json                   # SPA rewrites
package.json, vite.config.ts, tsconfig.json, tsconfig.node.json
eslint.config.js, playwright.config.ts, vitest.setup.ts
scripts/scan-emoji.mjs        # G4 게이트
docs/superpowers/gates/       # 게이트 기록
docs/superpowers/checklists/ui.md
src/
  main.tsx                    # 루트 렌더
  App.tsx                     # pathname 분기: / , /present , /dev/cork
  styles/globals.css          # Tailwind @theme 토큰, 글꼴, 코르크 질감 유틸리티
  pages/TeacherPage.tsx       # P3에서 채움. 지금은 자리표시 제목만
  pages/PresentPage.tsx       # P4에서 채움
  pages/DevCorkPage.tsx       # cork 컴포넌트 갤러리 (G7 스크린샷 대상)
  components/cork/
    PushPin.tsx  Tape.tsx  PaperCard.tsx  WoodButton.tsx  ChalkBoard.tsx  NoteSeat.tsx
    *.test.tsx
  core/
    model/types.ts  defaults.ts  schema.ts  migrate.ts  (+ *.test.ts)
    layouts/types.ts distance.ts exam.ts pair.ts ushape.ts custom.ts group.ts index.ts (+ *.test.ts)
    randomizer/rng.ts lookup.ts gender.ts constraints.ts assign.ts index.ts verify.ts (+ *.test.ts, golden.test.ts)
    storage/adapter.ts memoryAdapter.ts localStorageAdapter.ts classes.ts json.ts (+ *.test.ts)
  store/useAppStore.ts  selectors.ts  (+ *.test.ts)
  test/fixtures/v1-*.json     # 익명화된 v1 데이터 3종
e2e/dev-cork.spec.ts          # G7·G8
```

각 파일의 책임은 하나다. `core/randomizer/index.ts`가 300줄을 넘기면 `assign.ts`(백트래킹)와 분리한 상태를 유지한다.

---

## Phase 0 — 스캐폴드·게이트·디자인 시스템

### Task 1: 레거시 격리와 Vite 스캐폴드

**Files:**
- Move: `index.html css/ js/ build.js test-logic.mjs 업데이트_안내.txt 인디스쿨_홍보문.txt` → `legacy/`
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `vercel.json`, `vitest.setup.ts`, `src/main.tsx`, `src/App.tsx`, `src/pages/TeacherPage.tsx`, `src/pages/PresentPage.tsx`, `src/pages/DevCorkPage.tsx`, `src/styles/globals.css`(빈 껍데기, Task 3에서 채움)
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `App` 컴포넌트가 `window.location.pathname`에 따라 `TeacherPage | PresentPage | DevCorkPage`를 렌더. 각 페이지는 `<main data-page="teacher|present|dev-cork">`를 루트로 가진다.

- [ ] **Step 1: 레거시 이동**

```bash
cd /c/Users/Public/seat-changer
git checkout v2
mkdir legacy
git mv index.html css js build.js test-logic.mjs 업데이트_안내.txt 인디스쿨_홍보문.txt legacy/
git commit -m "chore: v1 앱을 legacy/로 이동 (v2 골든 테스트 기준으로 보존)"
```

- [ ] **Step 2: package.json 작성**

```json
{
  "name": "seat-changer",
  "version": "2.0.0-alpha.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "e2e": "playwright test",
    "scan": "node scripts/scan-emoji.mjs",
    "gate": "npm run typecheck && npm run lint && npm run test && npm run scan"
  },
  "dependencies": {
    "lucide-react": "0.545.0",
    "react": "19.1.1",
    "react-dom": "19.1.1",
    "zod": "4.1.11",
    "zundo": "2.3.0",
    "zustand": "5.0.8"
  },
  "devDependencies": {
    "@eslint/js": "9.37.0",
    "@playwright/test": "1.56.1",
    "@tailwindcss/vite": "4.1.14",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.0",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "24.7.0",
    "@types/react": "19.1.16",
    "@types/react-dom": "19.1.9",
    "@vitejs/plugin-react": "5.0.4",
    "@vitest/coverage-v8": "3.2.4",
    "eslint": "9.37.0",
    "eslint-plugin-react-hooks": "6.1.1",
    "jsdom": "27.0.0",
    "tailwindcss": "4.1.14",
    "typescript": "5.9.3",
    "typescript-eslint": "8.46.0",
    "vite": "7.1.9",
    "vitest": "3.2.4"
  }
}
```

버전이 npm에 없다고 나오면 같은 메이저의 최신 안정 버전으로 바꾸고 `docs/superpowers/gates/task-01.md`에 적는다.

- [ ] **Step 3: 설정 파일 작성**

`vite.config.ts`
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      exclude: ['src/core/**/*.test.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
```

`vitest.setup.ts`
```ts
import '@testing-library/jest-dom/vitest';
```

`tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "vitest.setup.ts", "e2e", "scripts"]
}
```

`tsconfig.node.json`
```json
{
  "compilerOptions": { "composite": true, "module": "ESNext", "moduleResolution": "bundler", "strict": true, "types": ["node"] },
  "include": ["vite.config.ts", "playwright.config.ts"]
}
```

`index.html`
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>자리바꾸기</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vercel.json`
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

`src/main.tsx`
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`
```tsx
import { TeacherPage } from './pages/TeacherPage';
import { PresentPage } from './pages/PresentPage';
import { DevCorkPage } from './pages/DevCorkPage';

export type Route = 'teacher' | 'present' | 'dev-cork';

export function resolveRoute(pathname: string): Route {
  if (pathname.startsWith('/present')) return 'present';
  if (pathname.startsWith('/dev/cork')) return 'dev-cork';
  return 'teacher';
}

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  const route = resolveRoute(pathname);
  if (route === 'present') return <PresentPage />;
  if (route === 'dev-cork') return <DevCorkPage />;
  return <TeacherPage />;
}
```

`src/pages/TeacherPage.tsx`
```tsx
export function TeacherPage() {
  return (
    <main data-page="teacher" className="min-h-screen bg-cork p-8">
      <h1 className="font-hand text-4xl text-paper">자리바꾸기</h1>
    </main>
  );
}
```

`src/pages/PresentPage.tsx`
```tsx
export function PresentPage() {
  return (
    <main data-page="present" className="min-h-screen bg-cork p-8">
      <h1 className="font-hand text-4xl text-paper">자리 뽑기</h1>
    </main>
  );
}
```

`src/pages/DevCorkPage.tsx` (Task 7에서 채움. 지금은 껍데기)
```tsx
export function DevCorkPage() {
  return (
    <main data-page="dev-cork" className="min-h-screen bg-cork p-8">
      <h1 className="font-hand text-4xl text-paper">코르크 컴포넌트</h1>
    </main>
  );
}
```

`src/styles/globals.css` (임시. Task 3에서 토큰으로 교체)
```css
@import "tailwindcss";
```

- [ ] **Step 4: 실패하는 라우팅 테스트 작성**

`src/App.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import { App, resolveRoute } from './App';

describe('resolveRoute', () => {
  it('루트는 교사 화면', () => expect(resolveRoute('/')).toBe('teacher'));
  it('/present는 발표 화면', () => expect(resolveRoute('/present')).toBe('present'));
  it('/dev/cork는 갤러리', () => expect(resolveRoute('/dev/cork')).toBe('dev-cork'));
  it('모르는 경로는 교사 화면', () => expect(resolveRoute('/foo')).toBe('teacher'));
});

describe('App', () => {
  it('pathname에 맞는 페이지를 렌더한다', () => {
    render(<App pathname="/present" />);
    expect(screen.getByRole('main')).toHaveAttribute('data-page', 'present');
  });
});
```

- [ ] **Step 5: 설치 후 테스트 실행 → 실패 확인**

```bash
npm install
npx vitest run src/App.test.tsx
```
Expected: 아직 `App.tsx`가 없으면 import 실패, 있으면 PASS. (Step 3에서 파일을 이미 만들었으므로 PASS면 정상. 이 Task는 스캐폴드라 예외적으로 테스트가 먼저 실패하지 않아도 된다.)

- [ ] **Step 6: dev 서버·빌드 확인**

```bash
npm run typecheck
npm run build
```
Expected: `dist/index.html` 생성. 한글 경로 크래시가 나면 작업 경로가 Public인지 확인.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: Vite + React + TS 스캐폴드와 경로 분기 (/, /present, /dev/cork)"
```

---

### Task 2: 게이트 스크립트와 기록 템플릿

**Files:**
- Create: `eslint.config.js`, `scripts/scan-emoji.mjs`, `scripts/scan-emoji.test.ts`(vitest는 `src/**`만 보므로 `src/test/scan-emoji.test.ts`에 둔다), `docs/superpowers/gates/README.md`, `docs/superpowers/gates/_template.md`, `docs/superpowers/checklists/ui.md`
- Modify: `package.json`(이미 `gate` 스크립트 있음)

**Interfaces:**
- Produces: `npm run gate` = typecheck → lint → test → scan. `scripts/scan-emoji.mjs`는 `export function findViolations(files: {path, content}[]): {path, line, kind: 'emoji'|'image-import'}[]`를 export하고, CLI로 실행하면 `src/`를 훑어 위반이 있으면 exit 1.

- [ ] **Step 1: 실패하는 스캔 테스트 작성**

`src/test/scan-emoji.test.ts`
```ts
import { findViolations } from '../../scripts/scan-emoji.mjs';

describe('scan-emoji', () => {
  it('이모지 코드포인트를 잡는다', () => {
    const v = findViolations([{ path: 'a.tsx', content: 'const x = "완료 \u{1F389}";' }]);
    expect(v).toEqual([{ path: 'a.tsx', line: 1, kind: 'emoji' }]);
  });
  it('한글·기호·화살표는 통과한다', () => {
    const v = findViolations([{ path: 'a.tsx', content: '되살리기 → ✓ ✕ ★ ①' }]);
    expect(v).toEqual([]);
  });
  it('이미지 import를 잡는다', () => {
    const v = findViolations([{ path: 'b.tsx', content: "import bg from './cork.png';" }]);
    expect(v).toEqual([{ path: 'b.tsx', line: 1, kind: 'image-import' }]);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/test/scan-emoji.test.ts
```
Expected: FAIL, `Cannot find module '../../scripts/scan-emoji.mjs'`

- [ ] **Step 3: 스캔 스크립트 구현**

`scripts/scan-emoji.mjs`
```js
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
```

`✓ ✕ ★ →` 같은 기호는 U+2600 블록 일부와 겹치므로 허용 목록으로 통과시킨다. `\u{1F389}`(폭죽)은 U+1F300 이상이라 잡힌다.

- [ ] **Step 4: 실행 → 통과 확인**

```bash
npx vitest run src/test/scan-emoji.test.ts
npm run scan
```
Expected: 3 passed, `scan: 위반 없음`

- [ ] **Step 5: ESLint flat config 작성**

`eslint.config.js`
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'legacy', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // core/는 UI·브라우저 의존 금지
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['react', 'react-dom', 'zustand', 'zundo'], patterns: ['@/components/*', '@/store/*', '@/pages/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
    },
  },
);
```

- [ ] **Step 6: lint 실행 → 통과 확인**

```bash
npm run lint
```
Expected: 0 error. 경고가 있으면 고친다.

- [ ] **Step 7: 게이트 기록 템플릿과 UI 체크리스트**

`docs/superpowers/gates/README.md`
```markdown
# 게이트 기록

Task마다 `task-NN.md`를 `_template.md`로 만들어 채운다. 스펙 9장 기준.
```

`docs/superpowers/gates/_template.md`
```markdown
# Task NN — <제목>

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과/반려 | | 실패 커밋 해시 |
| G2 정적 검사 | | | |
| G3 단위 테스트 | | | n passed |
| G4 스캔 | | | |
| G5 스펙 리뷰 | | | 루프 n회, 마지막 지적: |
| G6 품질 리뷰 | | | 루프 n회, 마지막 지적: |
| G7 시각 체크 | 해당 없음/통과 | | 스크린샷 경로 |
| G8 E2E | 해당 없음/통과 | | |

에스컬레이션: 없음 / <내용>
```

`docs/superpowers/checklists/ui.md`
```markdown
# UI 시각 체크리스트 (G7)

스크린샷은 1920×1080, `npx playwright test e2e/<page>.spec.ts`가 `test-results/`에 남긴다.

- [ ] 이모지가 한 글자도 없다 (아이콘은 lucide 선 아이콘)
- [ ] 발표 화면 이름표 글자 28px 이상, 칠판 글자 32px 이상
- [ ] 글자·배경 대비비 4.5:1 이상 (paper 위 ink, chalk 위 chalk-text)
- [ ] 텍스트 잘림·겹침 없음 (이름 5자 "황보아리랑" 기준)
- [ ] 코르크 질감·종이 줄·테이프·압정이 CSS로만 그려졌다 (네트워크 탭에 이미지 요청 없음)
- [ ] 포커스 링이 보인다 (Tab 이동)
- [ ] prefers-reduced-motion에서 동작이 깨지지 않는다
```

- [ ] **Step 8: 게이트 전체 실행 후 커밋**

```bash
npm run gate
cp docs/superpowers/gates/_template.md docs/superpowers/gates/task-01.md   # Task 1 기록도 지금 채운다
cp docs/superpowers/gates/_template.md docs/superpowers/gates/task-02.md
git add -A
git commit -m "chore: 게이트 파이프라인(typecheck·lint·test·이모지 스캔)과 기록 템플릿"
```

---

### Task 3: 디자인 토큰·글꼴·코르크 질감 유틸리티

**Files:**
- Modify: `src/styles/globals.css`
- Test: `src/styles/tokens.test.ts`

**Interfaces:**
- Produces: Tailwind 유틸리티 `bg-cork bg-cork-dark bg-paper bg-paper-2 bg-paper-3 bg-chalk text-chalk-text text-ink text-mute bg-apple bg-gold`, 글꼴 `font-hand`(Gaegu) `font-body`(Noto Sans KR), 질감 클래스 `.texture-cork .texture-paper-lines .texture-wood`, 그리고 CSS 변수 `--color-cork` 등.

- [ ] **Step 1: 실패하는 토큰 테스트 작성**

`src/styles/tokens.test.ts`
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8');

describe('디자인 토큰', () => {
  it.each([
    ['--color-cork', '#c8955a'],
    ['--color-cork-dark', '#7b5130'],
    ['--color-paper', '#fffbf0'],
    ['--color-paper-2', '#fde6b8'],
    ['--color-paper-3', '#e8f1d9'],
    ['--color-chalk', '#2e5a4e'],
    ['--color-chalk-text', '#f3f0e6'],
    ['--color-ink', '#2a211b'],
    ['--color-mute', '#7a6a5c'],
    ['--color-apple', '#d2553d'],
    ['--color-gold', '#e4b04a'],
  ])('%s = %s', (name, value) => {
    expect(css.toLowerCase()).toContain(`${name}: ${value}`);
  });
  it('글꼴 토큰', () => {
    expect(css).toMatch(/--font-hand:\s*"Gaegu"/);
    expect(css).toMatch(/--font-body:\s*"Noto Sans KR"/);
  });
  it('질감 클래스', () => {
    for (const cls of ['.texture-cork', '.texture-paper-lines', '.texture-wood']) expect(css).toContain(cls);
  });
  it('이미지 url()이 없다', () => {
    expect(css).not.toMatch(/url\(["']?[^)]*\.(png|jpe?g|gif|svg|webp)/);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/styles/tokens.test.ts
```
Expected: FAIL (토큰 없음)

- [ ] **Step 3: globals.css 작성**

```css
@import "tailwindcss";

@theme {
  --color-cork: #C8955A;
  --color-cork-dark: #7B5130;
  --color-paper: #FFFBF0;
  --color-paper-2: #FDE6B8;
  --color-paper-3: #E8F1D9;
  --color-chalk: #2E5A4E;
  --color-chalk-text: #F3F0E6;
  --color-ink: #2A211B;
  --color-mute: #7A6A5C;
  --color-apple: #D2553D;
  --color-gold: #E4B04A;

  --font-hand: "Gaegu", "Noto Sans KR", cursive;
  --font-body: "Noto Sans KR", system-ui, sans-serif;

  --radius-note: 3px;
  --shadow-note: 0 4px 8px rgba(0, 0, 0, 0.30);
  --shadow-card: 0 6px 14px rgba(0, 0, 0, 0.28);
}

@layer base {
  html { font-family: var(--font-body); color: var(--color-ink); }
  body { margin: 0; background: var(--color-cork); }
  :focus-visible { outline: 3px solid var(--color-gold); outline-offset: 2px; }
}

@layer utilities {
  /* 코르크판: 세 겹의 점 그라디언트 */
  .texture-cork {
    background-color: var(--color-cork);
    background-image:
      radial-gradient(circle at 20% 30%, rgba(255,255,255,0.08) 0, transparent 3px),
      radial-gradient(circle at 70% 60%, rgba(0,0,0,0.08) 0, transparent 3px),
      radial-gradient(circle at 40% 80%, rgba(255,255,255,0.06) 0, transparent 2px);
    background-size: 23px 23px, 31px 31px, 17px 17px;
  }
  /* 줄 노트 */
  .texture-paper-lines {
    background-color: var(--color-paper);
    background-image: repeating-linear-gradient(transparent 0 26px, rgba(46,90,78,0.14) 26px 27px);
  }
  /* 나무 프레임 */
  .texture-wood {
    background-image: linear-gradient(#B8813F, #8B5A2B);
    border-color: #5E3A1B;
  }
  .tilt-l { transform: rotate(-1deg); }
  .tilt-r { transform: rotate(0.8deg); }
  .tilt-note-a { transform: rotate(-1.5deg); }
  .tilt-note-b { transform: rotate(1.2deg); }
  .tilt-note-c { transform: rotate(-0.6deg); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/styles/tokens.test.ts
npm run gate
git add -A
git commit -m "feat: 코르크보드 디자인 토큰·글꼴·질감 유틸리티"
```

---

### Task 4: PushPin과 Tape 프리미티브

**Files:**
- Create: `src/components/cork/PushPin.tsx`, `src/components/cork/Tape.tsx`, `src/components/cork/PushPin.test.tsx`, `src/components/cork/Tape.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function PushPin(props: { color?: 'apple' | 'chalk' | 'gold'; className?: string }): JSX.Element
  export function Tape(props: { side?: 'top' | 'left' | 'right'; className?: string }): JSX.Element
  ```
  둘 다 `aria-hidden="true"` 장식 요소. `data-cork="pushpin" | "tape"` 속성을 가진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/cork/PushPin.test.tsx`
```tsx
import { render } from '@testing-library/react';
import { PushPin } from './PushPin';

describe('PushPin', () => {
  it('장식 요소로 렌더된다', () => {
    const { container } = render(<PushPin />);
    const el = container.querySelector('[data-cork="pushpin"]')!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.className).toContain('pin-apple');
  });
  it('색을 바꿀 수 있다', () => {
    const { container } = render(<PushPin color="gold" />);
    expect(container.querySelector('[data-cork="pushpin"]')!.className).toContain('pin-gold');
  });
});
```

`src/components/cork/Tape.test.tsx`
```tsx
import { render } from '@testing-library/react';
import { Tape } from './Tape';

describe('Tape', () => {
  it('기본은 위쪽 테이프', () => {
    const { container } = render(<Tape />);
    const el = container.querySelector('[data-cork="tape"]')!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('data-side', 'top');
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/components/cork
```
Expected: FAIL, 모듈 없음

- [ ] **Step 3: 구현**

`src/components/cork/PushPin.tsx`
```tsx
const COLORS = {
  apple: 'pin-apple bg-[radial-gradient(circle_at_35%_35%,#ff8f7a,#c9372b_60%,#8e2318)]',
  chalk: 'pin-chalk bg-[radial-gradient(circle_at_35%_35%,#7fb8a5,#2e5a4e_60%,#1c3a32)]',
  gold: 'pin-gold bg-[radial-gradient(circle_at_35%_35%,#ffe08a,#e4b04a_60%,#9c7422)]',
} as const;

export function PushPin({ color = 'apple', className = '' }: { color?: keyof typeof COLORS; className?: string }) {
  return (
    <span
      data-cork="pushpin"
      aria-hidden="true"
      className={`absolute -top-2 left-1/2 h-[18px] w-[18px] -translate-x-1/2 rounded-full shadow-[0_3px_4px_rgba(0,0,0,0.4)] ${COLORS[color]} ${className}`}
    />
  );
}
```

`src/components/cork/Tape.tsx`
```tsx
const SIDE = {
  top: 'top-[-6px] left-1/2 -translate-x-1/2 -rotate-3 w-[34px] h-[11px]',
  left: 'top-1/2 left-[-8px] -translate-y-1/2 rotate-90 w-[34px] h-[11px]',
  right: 'top-1/2 right-[-8px] -translate-y-1/2 -rotate-90 w-[34px] h-[11px]',
} as const;

export function Tape({ side = 'top', className = '' }: { side?: keyof typeof SIDE; className?: string }) {
  return (
    <span
      data-cork="tape"
      data-side={side}
      aria-hidden="true"
      className={`absolute border border-black/10 bg-white/55 ${SIDE[side]} ${className}`}
    />
  );
}
```

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/components/cork
npm run gate
git add -A
git commit -m "feat(cork): PushPin·Tape 장식 프리미티브"
```

---

### Task 5: PaperCard와 WoodButton

**Files:**
- Create: `src/components/cork/PaperCard.tsx`, `src/components/cork/WoodButton.tsx`, 각 `.test.tsx`

**Interfaces:**
- Consumes: `PushPin`
- Produces:
  ```ts
  export function PaperCard(props: {
    title: string;            // 손글씨 제목
    badge?: string;           // 제목 옆 작은 글자 (예: "22명")
    tilt?: 'l' | 'r' | 'none';// 기울기. 기본 'none'
    pin?: boolean;            // 압정 표시. 기본 true
    children: React.ReactNode;
    className?: string;
  }): JSX.Element            // <section data-cork="paper-card" aria-labelledby=...>
  export function WoodButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger'; // primary=chalk, secondary=paper, danger=apple
    size?: 'md' | 'lg';                             // lg는 발표 화면용(글자 22px)
    icon?: React.ReactNode;                         // lucide 아이콘
  }): JSX.Element
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/cork/PaperCard.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import { PaperCard } from './PaperCard';

describe('PaperCard', () => {
  it('제목이 section의 접근 가능한 이름이 된다', () => {
    render(<PaperCard title="학생 명단" badge="22명"><p>본문</p></PaperCard>);
    const sec = screen.getByRole('region', { name: /학생 명단/ });
    expect(sec).toHaveAttribute('data-cork', 'paper-card');
    expect(screen.getByText('22명')).toBeInTheDocument();
    expect(sec.querySelector('[data-cork="pushpin"]')).not.toBeNull();
  });
  it('pin=false면 압정이 없다', () => {
    render(<PaperCard title="자리 배치" pin={false}><p /></PaperCard>);
    expect(screen.getByRole('region').querySelector('[data-cork="pushpin"]')).toBeNull();
  });
  it('tilt 클래스', () => {
    render(<PaperCard title="규칙" tilt="r"><p /></PaperCard>);
    expect(screen.getByRole('region').className).toContain('tilt-r');
  });
});
```

`src/components/cork/WoodButton.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WoodButton } from './WoodButton';

describe('WoodButton', () => {
  it('클릭이 전달된다', async () => {
    const onClick = vi.fn();
    render(<WoodButton onClick={onClick}>규칙 검사</WoodButton>);
    await userEvent.click(screen.getByRole('button', { name: '규칙 검사' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('variant·size 클래스', () => {
    render(<WoodButton variant="danger" size="lg">자리 뽑기</WoodButton>);
    const b = screen.getByRole('button');
    expect(b).toHaveAttribute('data-variant', 'danger');
    expect(b).toHaveAttribute('data-size', 'lg');
  });
  it('disabled면 aria-disabled', () => {
    render(<WoodButton disabled>저장</WoodButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/components/cork/PaperCard.test.tsx src/components/cork/WoodButton.test.tsx
```
Expected: FAIL

- [ ] **Step 3: 구현**

`src/components/cork/PaperCard.tsx`
```tsx
import { useId, type ReactNode } from 'react';
import { PushPin } from './PushPin';

const TILT = { l: 'tilt-l', r: 'tilt-r', none: '' } as const;

export function PaperCard({
  title, badge, tilt = 'none', pin = true, children, className = '',
}: { title: string; badge?: string; tilt?: keyof typeof TILT; pin?: boolean; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section
      data-cork="paper-card"
      aria-labelledby={id}
      className={`relative rounded-note texture-paper-lines p-4 pt-5 shadow-card ${TILT[tilt]} ${className}`}
    >
      {pin && <PushPin />}
      <h2 id={id} className="font-hand text-[21px] font-bold leading-none text-ink">
        {title}
        {badge && <span className="ml-2 font-body text-xs font-bold text-mute">{badge}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
```

`src/components/cork/WoodButton.tsx`
```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const VARIANT = {
  primary: 'bg-chalk text-chalk-text border-[#1c3a32]',
  secondary: 'bg-paper-2 text-ink border-cork-dark',
  danger: 'texture-wood text-[#FFF3D6] border-[#5E3A1B] [text-shadow:0_1px_0_rgba(0,0,0,0.4)]',
} as const;
const SIZE = { md: 'px-4 py-2 text-[15px]', lg: 'px-10 py-4 text-[22px] rounded-[10px] border-4' } as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT; size?: keyof typeof SIZE; icon?: ReactNode;
};

export function WoodButton({ variant = 'primary', size = 'md', icon, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      data-cork="wood-button"
      data-variant={variant}
      data-size={size}
      className={`inline-flex items-center gap-2 rounded-[6px] border-2 font-hand font-bold shadow-note transition-transform active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
```

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/components/cork
npm run gate
git add -A
git commit -m "feat(cork): PaperCard·WoodButton"
```

---

### Task 6: ChalkBoard와 NoteSeat

**Files:**
- Create: `src/components/cork/ChalkBoard.tsx`, `src/components/cork/NoteSeat.tsx`, 각 `.test.tsx`

**Interfaces:**
- Consumes: `Tape`, `PushPin`
- Produces:
  ```ts
  export function ChalkBoard(props: { kind?: 'board' | 'podium'; label?: string; className?: string }): JSX.Element
    // kind='board' → "칠 판", 'podium' → "교 탁". label로 덮어쓸 수 있다.
  export type NoteSeatState = 'empty' | 'assigned' | 'fixed' | 'disabled';
  export function NoteSeat(props: {
    index: number;              // 0-based. 화면에는 index+1
    name?: string;              // assigned·fixed일 때
    state: NoteSeatState;
    size?: 'sm' | 'lg';         // sm=교사 미리보기(14px), lg=발표(28px)
    variant?: 0 | 1 | 2;        // 종이색·기울기 변주
    onClick?: () => void;       // empty·assigned·fixed 클릭
    onRestore?: () => void;     // disabled 클릭 = 되살리기
    highlight?: boolean;
  }): JSX.Element
    // 루트 <button data-cork="note-seat" data-seat={index} data-state={state} aria-label=...>
  ```
  aria-label 규칙: assigned/fixed `"{n}번 자리: {name}"`, fixed는 뒤에 `" (고정)"`, empty `"{n}번 자리 (비어있음)"`, disabled `"{n}번 자리 되살리기"`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/cork/ChalkBoard.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import { ChalkBoard } from './ChalkBoard';

describe('ChalkBoard', () => {
  it('기본은 칠판', () => {
    render(<ChalkBoard />);
    expect(screen.getByText('칠 판')).toHaveAttribute('data-kind', 'board');
  });
  it('교탁', () => {
    render(<ChalkBoard kind="podium" />);
    expect(screen.getByText('교 탁')).toHaveAttribute('data-kind', 'podium');
  });
});
```

`src/components/cork/NoteSeat.test.tsx`
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteSeat } from './NoteSeat';

describe('NoteSeat', () => {
  it('배정된 자리', () => {
    render(<NoteSeat index={2} name="김하람" state="assigned" />);
    const b = screen.getByRole('button', { name: '3번 자리: 김하람' });
    expect(b).toHaveAttribute('data-state', 'assigned');
    expect(b.querySelector('[data-cork="tape"]')).not.toBeNull();
  });
  it('고정 자리는 압정과 (고정) 라벨', () => {
    render(<NoteSeat index={0} name="이도윤" state="fixed" />);
    const b = screen.getByRole('button', { name: '1번 자리: 이도윤 (고정)' });
    expect(b.querySelector('[data-cork="pushpin"]')).not.toBeNull();
  });
  it('빈 자리', () => {
    render(<NoteSeat index={14} state="empty" />);
    expect(screen.getByRole('button', { name: '15번 자리 (비어있음)' })).toHaveTextContent('빈 자리');
  });
  it('삭제된 자리는 되살리기', async () => {
    const onRestore = vi.fn();
    render(<NoteSeat index={9} state="disabled" onRestore={onRestore} />);
    const b = screen.getByRole('button', { name: '10번 자리 되살리기' });
    expect(b).toHaveTextContent('되살리기');
    await userEvent.click(b);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
  it('일반 클릭', async () => {
    const onClick = vi.fn();
    render(<NoteSeat index={1} state="empty" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('발표 크기는 28px 이상', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" size="lg" />);
    expect(screen.getByRole('button').className).toContain('text-[28px]');
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/components/cork/ChalkBoard.test.tsx src/components/cork/NoteSeat.test.tsx
```
Expected: FAIL

- [ ] **Step 3: 구현**

`src/components/cork/ChalkBoard.tsx`
```tsx
export function ChalkBoard({ kind = 'board', label, className = '' }: { kind?: 'board' | 'podium'; label?: string; className?: string }) {
  const text = label ?? (kind === 'board' ? '칠 판' : '교 탁');
  return (
    <div
      data-cork="chalkboard"
      data-kind={kind}
      className={`w-full rounded-[4px] border-[6px] border-cork-dark bg-[#26443C] py-2 text-center font-hand text-[32px] tracking-[0.4em] text-chalk-text shadow-card ${className}`}
    >
      {text}
    </div>
  );
}
```

`src/components/cork/NoteSeat.tsx`
```tsx
import { Tape } from './Tape';
import { PushPin } from './PushPin';

export type NoteSeatState = 'empty' | 'assigned' | 'fixed' | 'disabled';

const VARIANT = ['bg-paper tilt-note-a', 'bg-paper-2 tilt-note-b', 'bg-paper-3 tilt-note-c'] as const;
const SIZE = { sm: 'h-14 text-[14px]', lg: 'h-24 text-[28px]' } as const;

type Props = {
  index: number; name?: string; state: NoteSeatState; size?: keyof typeof SIZE;
  variant?: 0 | 1 | 2; onClick?: () => void; onRestore?: () => void; highlight?: boolean;
};

export function seatLabel(index: number, state: NoteSeatState, name?: string): string {
  const n = index + 1;
  if (state === 'disabled') return `${n}번 자리 되살리기`;
  if (state === 'empty' || !name) return `${n}번 자리 (비어있음)`;
  return `${n}번 자리: ${name}${state === 'fixed' ? ' (고정)' : ''}`;
}

export function NoteSeat({ index, name, state, size = 'sm', variant = 0, onClick, onRestore, highlight = false }: Props) {
  const disabled = state === 'disabled';
  const base = 'relative flex w-full flex-col items-center justify-center rounded-note font-hand font-bold leading-tight';
  const look = disabled
    ? 'border-2 border-dashed border-paper/80 bg-transparent text-paper'
    : `${VARIANT[variant]} text-ink shadow-note`;
  const ring = highlight ? 'ring-4 ring-gold' : '';
  return (
    <button
      type="button"
      data-cork="note-seat"
      data-seat={index}
      data-state={state}
      aria-label={seatLabel(index, state, name)}
      onClick={disabled ? onRestore : onClick}
      className={`${base} ${look} ${ring} ${SIZE[size]}`}
    >
      {!disabled && <Tape />}
      {state === 'fixed' && <PushPin color="gold" />}
      <span className="font-body text-[10px] font-normal text-mute">{index + 1}</span>
      {disabled ? <span>되살리기</span> : name ? <span>{name}</span> : <span className="opacity-50">빈 자리</span>}
    </button>
  );
}
```

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/components/cork
npm run gate
git add -A
git commit -m "feat(cork): ChalkBoard·NoteSeat (empty/assigned/fixed/disabled)"
```

---

### Task 7: /dev/cork 갤러리와 Playwright 시각 게이트 (Phase 0 게이트)

**Files:**
- Modify: `src/pages/DevCorkPage.tsx`
- Create: `playwright.config.ts`, `e2e/dev-cork.spec.ts`
- Modify: `.gitignore`(playwright 산출물), `docs/superpowers/gates/task-07.md`

**Interfaces:**
- Consumes: Task 4~6의 모든 컴포넌트
- Produces: `/dev/cork`에 컴포넌트 전 상태가 한 화면에. Playwright가 1920×1080 스크린샷을 `test-results/dev-cork.png`로 남긴다.

- [ ] **Step 1: 갤러리 페이지 작성**

`src/pages/DevCorkPage.tsx`
```tsx
import { Check, Undo2, Dices } from 'lucide-react';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { ChalkBoard } from '@/components/cork/ChalkBoard';
import { NoteSeat } from '@/components/cork/NoteSeat';

const NAMES = ['김하람', '이도윤', '박서아', '최준우', '정지안', '한시우', '오유나', '강민재', '윤채원', '임서준', '황보아리랑', '조은우', '배아인', '신태오'];

export function DevCorkPage() {
  return (
    <main data-page="dev-cork" className="min-h-screen texture-cork p-8">
      <h1 className="mb-6 font-hand text-4xl text-paper">코르크 컴포넌트</h1>
      <div className="grid grid-cols-[360px_1fr] gap-8">
        <div className="flex flex-col gap-5">
          <PaperCard title="학생 명단" badge="22명" tilt="l">
            <ul className="grid grid-cols-3 gap-1 font-hand text-[15px]">
              {NAMES.slice(0, 9).map((n) => <li key={n}>{n}</li>)}
            </ul>
          </PaperCard>
          <PaperCard title="자리 배치" tilt="r">
            <div className="flex flex-wrap gap-2">
              <WoodButton icon={<Check size={16} />}>규칙 검사</WoodButton>
              <WoodButton variant="secondary" icon={<Undo2 size={16} />}>되돌리기</WoodButton>
              <WoodButton variant="danger" size="lg" icon={<Dices size={24} />}>자리 뽑기</WoodButton>
              <WoodButton disabled>비활성</WoodButton>
            </div>
          </PaperCard>
        </div>
        <div className="flex flex-col items-center gap-4">
          <ChalkBoard />
          <div className="grid w-full max-w-[720px] grid-cols-5 gap-3">
            {Array.from({ length: 15 }, (_, i) => {
              if (i === 2) return <NoteSeat key={i} index={i} name="이도윤" state="fixed" variant={(i % 3) as 0 | 1 | 2} />;
              if (i === 9) return <NoteSeat key={i} index={i} state="disabled" />;
              if (i === 14) return <NoteSeat key={i} index={i} state="empty" />;
              return <NoteSeat key={i} index={i} name={NAMES[i % NAMES.length]} state="assigned" variant={(i % 3) as 0 | 1 | 2} />;
            })}
          </div>
          <div className="grid w-full max-w-[720px] grid-cols-4 gap-3">
            <NoteSeat index={0} name="황보아리랑" state="assigned" size="lg" />
            <NoteSeat index={1} name="이도윤" state="fixed" size="lg" />
            <NoteSeat index={2} state="empty" size="lg" />
            <NoteSeat index={3} state="disabled" size="lg" />
          </div>
          <ChalkBoard kind="podium" />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Playwright 설정과 스펙 작성**

`playwright.config.ts`
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1920, height: 1080 } },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
  reporter: [['list']],
});
```

`e2e/dev-cork.spec.ts`
```ts
import { test, expect } from '@playwright/test';

test('코르크 갤러리: 전 상태 렌더, 이미지 요청 없음, 스크린샷', async ({ page }) => {
  const imageRequests: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'image') imageRequests.push(r.url()); });

  await page.goto('/dev/cork');
  await expect(page.locator('[data-page="dev-cork"]')).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="assigned"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="fixed"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="empty"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="disabled"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="chalkboard"][data-kind="board"]')).toBeVisible();
  await expect(page.locator('[data-cork="chalkboard"][data-kind="podium"]')).toBeVisible();

  // 이름 5자가 lg 이름표에서 잘리지 않는다
  const big = page.locator('[data-cork="note-seat"][data-size], [data-cork="note-seat"]').filter({ hasText: '황보아리랑' }).last();
  const box = await big.boundingBox();
  expect(box && box.width).toBeGreaterThan(120);

  expect(imageRequests).toEqual([]);
  await page.screenshot({ path: 'test-results/dev-cork.png', fullPage: true });
});
```

- [ ] **Step 3: 실행**

```bash
npx playwright install chromium
npm run e2e
```
Expected: 1 passed, `test-results/dev-cork.png` 생성. `.gitignore`에 `test-results/`, `playwright-report/`, `dist/` 추가.

- [ ] **Step 4: G7 시각 체크(리뷰 subagent에게 스크린샷 경로와 `docs/superpowers/checklists/ui.md`를 주고 판정받는다). 지적이 있으면 컴포넌트를 고치고 Step 3 재실행(최대 3회).**

- [ ] **Step 5: Phase 0 게이트 기록 후 커밋**

`docs/superpowers/gates/task-07.md`에 G7 결과와 스크린샷 경로, 루프 횟수를 적는다.

```bash
npm run gate
git add -A
git commit -m "feat: /dev/cork 컴포넌트 갤러리와 Playwright 시각 게이트 (Phase 0 완료)"
```

---

## Phase 1 — core 이식

### Task 8: 모델 타입·기본값·zod 스키마

**Files:**
- Create: `src/core/model/types.ts`, `src/core/model/defaults.ts`, `src/core/model/schema.ts`, `src/core/model/schema.test.ts`
- 참고: `legacy/js/data/models.js`, `legacy/js/data/store.js:170-215`(importJSON의 필드별 상한)

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type LayoutType = 'exam' | 'pair' | 'ushape' | 'custom' | 'group';
  export type GenderRule = 'none' | 'same' | 'mixed' | 'mixedFirst';
  export type Gender = 'M' | 'F';
  export type Assignment = Record<number, string>;            // seatIndex → 학생 이름
  export interface Desk { x: number; y: number }
  export interface GroupPosition { groupIndex: number; x: number; y: number }
  export interface LayoutSettings {
    columns: number; rows: number; customDesks: Desk[]; groupSize: number; groupCount: number;
    groupSizes: number[]; groupLayoutMode: 'auto' | 'manual'; groupDesks: Desk[];
    groupPositions?: GroupPosition[]; disabledSeats: number[];
  }
  export interface FixedSeat { studentName: string; seatIndex: number }
  export interface SeparationRule { studentA: string; studentB: string; minDistance: number }
  export interface AssignmentRecord { mapping: Assignment; timestamp: number; date?: string }
  export interface GroupRecord { groups: string[][]; timestamp: number; date?: string }
  export interface ClassData {
    schemaVersion: 2;
    students: string[]; classSize: number; layoutType: LayoutType; layoutSettings: LayoutSettings;
    fixedSeats: FixedSeat[]; separationRules: SeparationRule[]; lastAssignment: AssignmentRecord | null;
    studentGenders: Record<string, Gender>; genderRule: GenderRule;
    assignmentHistory: AssignmentRecord[]; historyExcludeCount: 1 | 2 | 3; useHistoryExclusion: boolean;
    viewPerspective: 'student' | 'teacher';
    groupHistory: GroupRecord[]; useGroupExclusion: boolean; groupExcludeCount: 1 | 2 | 3;
  }
  // defaults.ts
  export function createDefaultData(): ClassData;
  export const LIMITS = { MAX_CLASSES: 15, MAX_STUDENTS: 100, MAX_NAME: 50, MIN_GRID: 1, MAX_GRID: 12, MAX_HISTORY: 5 } as const;
  // schema.ts
  export const ClassDataSchema: z.ZodType<ClassData>;
  export function sanitizeStudents(input: unknown): string[];   // legacy validateStudents와 동일 규칙
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/core/model/schema.test.ts`
```ts
import { ClassDataSchema, sanitizeStudents } from './schema';
import { createDefaultData } from './defaults';

describe('createDefaultData', () => {
  it('v1 기본값과 같은 필드를 가진다', () => {
    const d = createDefaultData();
    expect(d.schemaVersion).toBe(2);
    expect(d.layoutType).toBe('exam');
    expect(d.layoutSettings).toMatchObject({ columns: 6, rows: 5, groupSize: 4, groupCount: 0, groupLayoutMode: 'auto', disabledSeats: [] });
    expect(d.historyExcludeCount).toBe(1);
    expect(d.useHistoryExclusion).toBe(true);
    expect(d.viewPerspective).toBe('student');
  });
});

describe('sanitizeStudents', () => {
  it('공백 제거, 특수문자 제거, 50자 제한, 100명 제한', () => {
    expect(sanitizeStudents([' 김하람 ', '<b>이도윤</b>', '', 42, 'a'.repeat(60)])).toEqual(['김하람', 'b이도윤/b', 'a'.repeat(50)]);
    expect(sanitizeStudents(Array.from({ length: 120 }, (_, i) => `s${i}`))).toHaveLength(100);
  });
  it('배열이 아니면 빈 배열', () => expect(sanitizeStudents(null)).toEqual([]));
});

describe('ClassDataSchema', () => {
  it('기본값은 통과', () => expect(ClassDataSchema.safeParse(createDefaultData()).success).toBe(true));
  it('행·열 범위 밖은 실패', () => {
    const d = createDefaultData();
    d.layoutSettings.columns = 13;
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });
  it('성별 값은 M/F만', () => {
    const d = createDefaultData();
    (d.studentGenders as Record<string, string>)['김하람'] = 'male';
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });
  it('schemaVersion이 없으면 실패(마이그레이션 대상)', () => {
    const { schemaVersion: _v, ...rest } = createDefaultData();
    expect(ClassDataSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/core/model
```
Expected: FAIL

- [ ] **Step 3: 구현**

`src/core/model/types.ts` — 위 Interfaces 블록 그대로.

`src/core/model/defaults.ts`
```ts
import type { ClassData } from './types';

export const LIMITS = { MAX_CLASSES: 15, MAX_STUDENTS: 100, MAX_NAME: 50, MIN_GRID: 1, MAX_GRID: 12, MAX_HISTORY: 5 } as const;

export function createDefaultData(): ClassData {
  return {
    schemaVersion: 2,
    students: [],
    classSize: 0,
    layoutType: 'exam',
    layoutSettings: {
      columns: 6, rows: 5, customDesks: [], groupSize: 4, groupCount: 0, groupSizes: [],
      groupLayoutMode: 'auto', groupDesks: [], disabledSeats: [],
    },
    fixedSeats: [],
    separationRules: [],
    lastAssignment: null,
    studentGenders: {},
    genderRule: 'none',
    assignmentHistory: [],
    historyExcludeCount: 1,
    useHistoryExclusion: true,
    viewPerspective: 'student',
    groupHistory: [],
    useGroupExclusion: true,
    groupExcludeCount: 1,
  };
}
```

`src/core/model/schema.ts`
```ts
import { z } from 'zod';
import type { ClassData } from './types';
import { LIMITS } from './defaults';

export function sanitizeStudents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().replace(/[<>"'&]/g, '').slice(0, LIMITS.MAX_NAME))
    .filter((s) => s.length > 0)
    .slice(0, LIMITS.MAX_STUDENTS);
}

const grid = z.number().int().min(LIMITS.MIN_GRID).max(LIMITS.MAX_GRID);
const Desk = z.object({ x: z.number(), y: z.number() });
const Assignment = z.record(z.string(), z.string()).transform((r) => {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(r)) if (Number.isInteger(Number(k))) out[Number(k)] = v;
  return out;
});
const AssignmentRecord = z.object({ mapping: Assignment, timestamp: z.number(), date: z.string().optional() });
const count123 = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const ClassDataSchema = z.object({
  schemaVersion: z.literal(2),
  students: z.array(z.string().min(1).max(LIMITS.MAX_NAME)).max(LIMITS.MAX_STUDENTS),
  classSize: z.number().int().min(0),
  layoutType: z.enum(['exam', 'pair', 'ushape', 'custom', 'group']),
  layoutSettings: z.object({
    columns: grid, rows: grid,
    customDesks: z.array(Desk).max(200),
    groupSize: z.number().int().min(2).max(8),
    groupCount: z.number().int().min(0).max(20),
    groupSizes: z.array(z.number().int().min(1).max(8)).max(20),
    groupLayoutMode: z.enum(['auto', 'manual']),
    groupDesks: z.array(Desk).max(200),
    groupPositions: z.array(z.object({ groupIndex: z.number().int(), x: z.number(), y: z.number() })).max(50).optional(),
    disabledSeats: z.array(z.number().int().min(0).max(999)).max(200),
  }),
  fixedSeats: z.array(z.object({ studentName: z.string(), seatIndex: z.number().int().min(0) })).max(100),
  separationRules: z.array(z.object({ studentA: z.string(), studentB: z.string(), minDistance: z.number().int().min(1).max(5) })).max(50),
  lastAssignment: AssignmentRecord.nullable(),
  studentGenders: z.record(z.string(), z.enum(['M', 'F'])),
  genderRule: z.enum(['none', 'same', 'mixed', 'mixedFirst']),
  assignmentHistory: z.array(AssignmentRecord).max(10),
  historyExcludeCount: count123,
  useHistoryExclusion: z.boolean(),
  viewPerspective: z.enum(['student', 'teacher']),
  groupHistory: z.array(z.object({ groups: z.array(z.array(z.string())), timestamp: z.number(), date: z.string().optional() })).max(10),
  useGroupExclusion: z.boolean(),
  groupExcludeCount: count123,
}) as unknown as z.ZodType<ClassData>;
```

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/core/model
npm run gate
git add -A
git commit -m "feat(core): ClassData 타입·기본값·zod 스키마"
```

---

### Task 9: 거리 함수와 exam·pair·ushape 배치

**Files:**
- Create: `src/core/layouts/types.ts`, `src/core/layouts/distance.ts`, `src/core/layouts/exam.ts`, `src/core/layouts/pair.ts`, `src/core/layouts/ushape.ts`, `src/core/layouts/grid.test.ts`
- 참고: `legacy/js/layouts/layout-engine.js`, `exam-layout.js:1-24`, `pair-layout.js:1-36`, `ushape-layout.js:1-45`

**Interfaces:**
- Produces:
  ```ts
  export interface SeatPosition { index: number; row: number; col: number; pairCol?: number; arcPos?: number; px?: number; py?: number; group?: number }
  export interface SeatLayout {
    type: LayoutType;
    getSeatPositions(settings: LayoutSettings): SeatPosition[];
    getSeatCount(settings: LayoutSettings): number;
    distance(a: SeatPosition, b: SeatPosition): number;
  }
  export function manhattanDistance(a, b): number; export function chebyshevDistance(a, b): number;
  export const examLayout: SeatLayout; export const pairLayout: SeatLayout; export const ushapeLayout: SeatLayout;
  ```

- [ ] **Step 1: 실패하는 테스트 작성 (레거시와 좌표·거리 동일성)**

`src/core/layouts/grid.test.ts`
```ts
import { examLayout } from './exam';
import { pairLayout } from './pair';
import { ushapeLayout } from './ushape';
import { chebyshevDistance, manhattanDistance } from './distance';
import { createDefaultData } from '../model/defaults';
// 레거시 비교 기준
import { examLayout as legacyExam } from '../../../legacy/js/layouts/exam-layout.js';
import { pairLayout as legacyPair } from '../../../legacy/js/layouts/pair-layout.js';
import { ushapeLayout as legacyUshape } from '../../../legacy/js/layouts/ushape-layout.js';

const settings = { ...createDefaultData().layoutSettings, columns: 6, rows: 5 };

describe('distance', () => {
  it('manhattan/chebyshev', () => {
    const a = { index: 0, row: 0, col: 0 }, b = { index: 0, row: 2, col: 3 };
    expect(manhattanDistance(a, b)).toBe(5);
    expect(chebyshevDistance(a, b)).toBe(3);
  });
});

describe.each([
  ['exam', examLayout, legacyExam],
  ['pair', pairLayout, legacyPair],
  ['ushape', ushapeLayout, legacyUshape],
] as const)('%s 배치 = 레거시', (_name, mine, legacy) => {
  it('좌석 수', () => expect(mine.getSeatCount(settings)).toBe(legacy.getSeatCount(settings)));
  it('좌표', () => expect(mine.getSeatPositions(settings)).toEqual(legacy.getSeatPositions(settings)));
  it('모든 쌍의 거리', () => {
    const ps = mine.getSeatPositions(settings);
    for (const a of ps) for (const b of ps) expect(mine.distance(a, b)).toBe(legacy.distance(a, b));
  });
});

describe('pair 거리 규칙', () => {
  it('짝꿍은 1, 옆 짝 그룹은 2', () => {
    const ps = pairLayout.getSeatPositions(settings);
    expect(pairLayout.distance(ps[0]!, ps[1]!)).toBe(1);
    expect(pairLayout.distance(ps[0]!, ps[2]!)).toBe(2);
  });
});

describe('ushape', () => {
  it('좌석 수 = columns + rows*2', () => expect(ushapeLayout.getSeatCount(settings)).toBe(16));
});
```

레거시 모듈은 `escapeHTML`만 import하고 DOM은 `render()` 호출 때만 쓰므로 jsdom 없이도 import된다. tsconfig `allowJs`가 필요하면 `"allowJs": true`를 추가한다.

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/core/layouts
```
Expected: FAIL

- [ ] **Step 3: 구현**

`src/core/layouts/types.ts`
```ts
import type { LayoutSettings, LayoutType } from '../model/types';

export interface SeatPosition {
  index: number; row: number; col: number;
  pairCol?: number; arcPos?: number; px?: number; py?: number; group?: number;
}
export interface SeatLayout {
  type: LayoutType;
  getSeatPositions(settings: LayoutSettings): SeatPosition[];
  getSeatCount(settings: LayoutSettings): number;
  distance(a: SeatPosition, b: SeatPosition): number;
}
```

`src/core/layouts/distance.ts`
```ts
import type { SeatPosition } from './types';
export const manhattanDistance = (a: SeatPosition, b: SeatPosition) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
export const chebyshevDistance = (a: SeatPosition, b: SeatPosition) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
```

`src/core/layouts/exam.ts`
```ts
import type { SeatLayout, SeatPosition } from './types';
import { chebyshevDistance } from './distance';

export function gridPositions(columns: number, rows: number): SeatPosition[] {
  const out: SeatPosition[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) out.push({ index: r * columns + c, row: r, col: c });
  return out;
}

export const examLayout: SeatLayout = {
  type: 'exam',
  getSeatPositions: (s) => gridPositions(s.columns, s.rows),
  getSeatCount: (s) => s.columns * s.rows,
  distance: chebyshevDistance,
};
```

`src/core/layouts/pair.ts` — `legacy/js/layouts/pair-layout.js:4-36`의 `getSeatPositions`(pairCol 포함)·`getSeatCount`·`distance`를 그대로 옮긴다. distance 본문은 레거시 23-35행을 한 줄도 바꾸지 않고 TS 타입만 붙인다.

`src/core/layouts/ushape.ts` — `legacy/js/layouts/ushape-layout.js:4-45`를 같은 방식으로 옮긴다(arcPos 포함).

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/core/layouts
npm run gate
git add -A
git commit -m "feat(core): 거리 함수와 시험·짝·ㄷ자 배치 이식 (레거시 동일성 테스트)"
```

---

### Task 10: custom·group 배치와 레지스트리

**Files:**
- Create: `src/core/layouts/custom.ts`, `src/core/layouts/group.ts`, `src/core/layouts/index.ts`, `src/core/layouts/custom-group.test.ts`
- 참고: `legacy/js/layouts/custom-layout.js:1-12, 201-228`, `legacy/js/layouts/group-layout.js:1-130`

**Interfaces:**
- Produces:
  ```ts
  export const customLayout: SeatLayout;   // CELL_PX_W=80, CELL_PX_H=60
  export const groupLayout: SeatLayout & {
    getGroupSizes(settings: LayoutSettings): number[];
    getGroupStartIndex(groupIndex: number, sizes: number[]): number;
    calcAutoPositions(sizes: number[]): GroupPosition[];
  };
  export const layouts: Record<LayoutType, SeatLayout>;
  export function getLayout(type: LayoutType): SeatLayout;
  export function getTotalSeats(data: ClassData): number;   // legacy models.getTotalSeats와 동일 (disabledSeats 차감, custom은 차감 없음)
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/core/layouts/custom-group.test.ts`
```ts
import { customLayout } from './custom';
import { groupLayout } from './group';
import { getLayout, getTotalSeats } from './index';
import { createDefaultData } from '../model/defaults';
import { customLayout as legacyCustom } from '../../../legacy/js/layouts/custom-layout.js';
import { groupLayout as legacyGroup } from '../../../legacy/js/layouts/group-layout.js';
import { getTotalSeats as legacyTotal } from '../../../legacy/js/data/models.js';

const base = createDefaultData().layoutSettings;

describe('custom = 레거시', () => {
  const settings = { ...base, customDesks: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 200, y: 130 }, { x: 45, y: 300 }] };
  it('좌표(px 보존, row/col 양자화)', () => expect(customLayout.getSeatPositions(settings)).toEqual(legacyCustom.getSeatPositions(settings)));
  it('거리', () => {
    const ps = customLayout.getSeatPositions(settings);
    for (const a of ps) for (const b of ps) expect(customLayout.distance(a, b)).toBe(legacyCustom.distance(a, b));
  });
});

describe('group = 레거시', () => {
  const cases = [
    { ...base, groupSizes: [4, 4, 3, 5] },
    { ...base, groupCount: 6, groupSize: 4 },
    { ...base, groupSizes: [], groupCount: 0, groupSize: 5 },           // cols*rows 폴백
    { ...base, groupSizes: [4, 4], groupPositions: [{ groupIndex: 1, x: 300, y: 40 }] },
  ];
  it.each(cases.map((c, i) => [i, c]))('case %i 좌표·수·거리', (_i, settings) => {
    expect(groupLayout.getGroupSizes(settings)).toEqual(legacyGroup.getGroupSizes(settings));
    expect(groupLayout.getSeatCount(settings)).toBe(legacyGroup.getSeatCount(settings));
    const mine = groupLayout.getSeatPositions(settings), theirs = legacyGroup.getSeatPositions(settings);
    expect(mine).toEqual(theirs);
    for (const a of mine) for (const b of mine) expect(groupLayout.distance(a, b)).toBe(legacyGroup.distance(a, b));
  });
});

describe('registry', () => {
  it('getLayout', () => expect(getLayout('ushape').type).toBe('ushape'));
  it('getTotalSeats = 레거시 (disabledSeats 차감)', () => {
    const d = createDefaultData();
    d.layoutSettings.disabledSeats = [0, 7];
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
    d.layoutType = 'custom'; d.layoutSettings.customDesks = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
    d.layoutType = 'group'; d.layoutSettings.groupSizes = [3, 3];
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/core/layouts/custom-group.test.ts
```

- [ ] **Step 3: 구현**

`src/core/layouts/custom.ts` — 레거시 `custom-layout.js` 상단 상수(`DESK_W`, `DESK_H`, `GRID_SIZE`, `CELL_PX_W=80`, `CELL_PX_H=60`)와 201-228행의 세 메서드만 옮긴다. DOM 편집기(`_desks`, 드래그, undo, render)는 옮기지 않는다(계획 2에서 React 컴포넌트로 다시 만든다).

`src/core/layouts/group.ts` — 레거시 1-63행의 `getClusterDims`, `getGroupSizes`, `getGroupStartIndex`, `calcAutoPositions`와 65-130행의 `getSeatPositions`, `distance`, `getSeatCount`, `getGroupSizes`를 옮긴다. `SEAT_PX_W=68`, `SEAT_PX_H=52` 유지. `render`·`enableGroupDrag`는 옮기지 않는다.

`src/core/layouts/index.ts`
```ts
import type { ClassData, LayoutType } from '../model/types';
import type { SeatLayout } from './types';
import { examLayout } from './exam';
import { pairLayout } from './pair';
import { ushapeLayout } from './ushape';
import { customLayout } from './custom';
import { groupLayout } from './group';

export const layouts: Record<LayoutType, SeatLayout> = { exam: examLayout, pair: pairLayout, ushape: ushapeLayout, custom: customLayout, group: groupLayout };
export const getLayout = (type: LayoutType): SeatLayout => layouts[type] ?? examLayout;

export function getTotalSeats(data: ClassData): number {
  const raw = getLayout(data.layoutType).getSeatCount(data.layoutSettings);
  if (data.layoutType === 'custom') return raw;
  return Math.max(0, raw - (data.layoutSettings.disabledSeats ?? []).length);
}
export type { SeatLayout, SeatPosition } from './types';
```

주의: 레거시 `getTotalSeats`(models.js:62-86)는 group을 자체 계산하지만 결과는 `groupLayout.getSeatCount`와 같다. 테스트가 이를 증명한다. 다르면 레거시를 따르고 게이트 기록에 남긴다.

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/core/layouts
npm run gate
git add -A
git commit -m "feat(core): 자유·모둠 배치 이식과 배치 레지스트리, getTotalSeats"
```

---

### Task 11: 랜덤화 보조 모듈 (rng·룩업·인접·성별)

**Files:**
- Create: `src/core/randomizer/rng.ts`, `src/core/randomizer/lookup.ts`, `src/core/randomizer/gender.ts`, `src/core/randomizer/helpers.test.ts`
- 참고: `legacy/js/algorithm/seat-randomizer.js:25-75, 132-375`

**Interfaces:**
- Produces:
  ```ts
  // rng.ts
  export type Rng = () => number;                      // [0,1)
  export function shuffle<T>(arr: T[], rng: Rng): T[]; // in-place Fisher-Yates, legacy shuffle과 동일 순서
  export function mulberry32(seed: number): Rng;       // 테스트용 시드 난수
  // lookup.ts
  export type RuleLookup = Record<string, { other: string; minDistance: number }[]>;
  export function buildRuleLookup(rules: SeparationRule[]): RuleLookup;
  export function buildNameToSeatMap(assignment: Assignment): Record<string, number>;
  export type PosMap = Record<number, SeatPosition>;
  export type AdjacencyMap = Record<number, number[]>;
  export function buildAdjacencyMap(positions: SeatPosition[], posMap: PosMap, data: ClassData): AdjacencyMap;
  // gender.ts
  export type GenderSeatSets = Record<string, Set<number>> | null;
  export function precomputeGenderSeats(students: string[], availableSeats: Set<number>, posMap: PosMap, data: ClassData): GenderSeatSets;
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/core/randomizer/helpers.test.ts`
```ts
import { shuffle, mulberry32 } from './rng';
import { buildRuleLookup, buildNameToSeatMap, buildAdjacencyMap } from './lookup';
import { precomputeGenderSeats } from './gender';
import { createDefaultData } from '../model/defaults';
import { getLayout } from '../layouts';

describe('rng', () => {
  it('시드가 같으면 같은 순서', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], mulberry32(7));
    const b = shuffle([1, 2, 3, 4, 5, 6], mulberry32(7));
    expect(a).toEqual(b);
    expect(a).not.toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('Math.random을 흉내낸 rng와 레거시 shuffle 순서가 같다', () => {
    // 레거시 shuffle은 j = floor(random * (i+1)); 같은 난수열이면 같은 결과여야 한다
    const seq = [0.1, 0.9, 0.5, 0.3, 0.7];
    let k = 0; const rng = () => seq[k++ % seq.length]!;
    expect(shuffle(['a', 'b', 'c', 'd', 'e', 'f'], rng)).toEqual(['f', 'a', 'd', 'b', 'e', 'c']);
  });
});

describe('lookup', () => {
  it('규칙 역방향 맵', () => {
    const m = buildRuleLookup([{ studentA: 'A', studentB: 'B', minDistance: 2 }]);
    expect(m).toEqual({ A: [{ other: 'B', minDistance: 2 }], B: [{ other: 'A', minDistance: 2 }] });
  });
  it('이름→좌석', () => expect(buildNameToSeatMap({ 3: 'A', 5: 'B' })).toEqual({ A: 3, B: 5 }));
  it('인접 맵: 시험 대형 6x5의 0번 좌석은 1, 6, 7번과 인접', () => {
    const d = createDefaultData();
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const posMap = Object.fromEntries(ps.map((p) => [p.index, p]));
    const adj = buildAdjacencyMap(ps, posMap, d);
    expect([...adj[0]!].sort((a, b) => a - b)).toEqual([1, 6, 7]);
  });
});

describe('precomputeGenderSeats', () => {
  it('genderRule none이면 null', () => {
    const d = createDefaultData();
    expect(precomputeGenderSeats(['A'], new Set([0]), {}, d)).toBeNull();
  });
});
```

두 번째 rng 테스트의 기대값은 구현 후 레거시 `shuffle`을 같은 난수열로 돌려 얻은 값으로 맞춘다(테스트 파일에서 `legacy` shuffle을 직접 import할 수 없으니 `legacy/js/algorithm/seat-randomizer.js`의 31-37행을 그대로 복사한 로컬 함수로 계산해 상수를 확정한다). 인접 맵 기대값은 `legacy` `buildAdjacencyMap`(132-165행)의 정의를 읽고 exam 6x5에서 손으로 확인한다. 정의가 상하좌우만이면 `[1, 6]`으로 바꾼다.

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/core/randomizer
```

- [ ] **Step 3: 구현**

`src/core/randomizer/rng.ts`
```ts
export type Rng = () => number;

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`src/core/randomizer/lookup.ts` — 레거시 50-73행(`buildRuleLookup`, `buildNameToSeatMap`)과 132-165행(`buildAdjacencyMap`)을 옮긴다. `buildAdjacencyMap`은 `data.layoutType`과 `getLayout(...).distance`를 쓰므로 `../layouts`에서 import한다.

`src/core/randomizer/gender.ts` — 레거시 166-375행(`precomputeGenderSeats`와 그 안의 보조 함수)을 옮긴다. 반환 타입은 레거시가 `null` 또는 `{학생: Set}` 형태이므로 `GenderSeatSets`.

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/core/randomizer
npm run gate
git add -A
git commit -m "feat(core): 난수 주입·규칙 룩업·인접 맵·성별 좌석 사전 계산 이식"
```

---

### Task 12: 제약 검사·백트래킹·randomizeSeats·verifyAssignment

**Files:**
- Create: `src/core/randomizer/constraints.ts`, `src/core/randomizer/assign.ts`, `src/core/randomizer/index.ts`, `src/core/randomizer/verify.ts`, `src/core/randomizer/randomizer.test.ts`
- 참고: `legacy/js/algorithm/seat-randomizer.js:76-131, 376-616`, `legacy/js/screens/teacher-screen.js`에서 `verifyAssignment` 정의 위치(`grep -n "function verifyAssignment" legacy/js -r`)

**Interfaces:**
- Consumes: Task 8~11 전부
- Produces:
  ```ts
  export type RandomizeFailure = 'no-layout' | 'no-students' | 'capacity' | 'constraints';
  export type RandomizeResult =
    | { ok: true; mapping: Assignment; historyFallback: boolean }
    | { ok: false; reason: RandomizeFailure; detail: string };
  export interface RandomizeOptions { rng?: Rng; timeoutMs?: number; maxAttempts?: number; yieldToUI?: () => Promise<void> }
  export function randomizeSeats(data: ClassData, options?: RandomizeOptions): Promise<RandomizeResult>;
  export interface Violation { kind: 'fixed' | 'separation' | 'gender' | 'capacity'; message: string }
  export function verifyAssignment(mapping: Assignment, data: ClassData): Violation[];   // 위반 없으면 []
  ```
  기본값: `rng = Math.random`, `timeoutMs = 2000`, `maxAttempts = 15`, `yieldToUI = () => new Promise(r => setTimeout(r, 0))`. 시드 rng와 `yieldToUI: async () => {}`를 주면 완전 결정적이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/core/randomizer/randomizer.test.ts`
```ts
import { randomizeSeats } from './index';
import { verifyAssignment } from './verify';
import { mulberry32 } from './rng';
import { createDefaultData } from '../model/defaults';
import type { ClassData } from '../model/types';

const noYield = async () => {};
function cls(over: Partial<ClassData> = {}): ClassData {
  const d = createDefaultData();
  d.students = Array.from({ length: 20 }, (_, i) => `학생${i + 1}`);
  d.classSize = 20;
  return { ...d, ...over };
}

describe('randomizeSeats', () => {
  it('학생 없음', async () => {
    const r = await randomizeSeats(cls({ students: [] }), { yieldToUI: noYield });
    expect(r).toEqual({ ok: false, reason: 'no-students', detail: expect.any(String) });
  });
  it('좌석 부족', async () => {
    const d = cls(); d.layoutSettings.columns = 3; d.layoutSettings.rows = 3;
    const r = await randomizeSeats(d, { yieldToUI: noYield });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('capacity');
  });
  it('시드가 같으면 결과가 같다', async () => {
    const a = await randomizeSeats(cls(), { rng: mulberry32(1), yieldToUI: noYield });
    const b = await randomizeSeats(cls(), { rng: mulberry32(1), yieldToUI: noYield });
    expect(a).toEqual(b);
  });
  it('모든 학생이 한 번씩, 삭제 좌석은 비운다', async () => {
    const d = cls(); d.layoutSettings.disabledSeats = [0, 1, 2];
    const r = await randomizeSeats(d, { rng: mulberry32(2), yieldToUI: noYield });
    expect(r.ok).toBe(true); if (!r.ok) return;
    const names = Object.values(r.mapping).sort();
    expect(names).toEqual([...d.students].sort());
    expect(Object.keys(r.mapping).map(Number).some((i) => [0, 1, 2].includes(i))).toBe(false);
  });
  it('고정 자리와 분리 규칙을 지킨다', async () => {
    const d = cls();
    d.fixedSeats = [{ studentName: '학생1', seatIndex: 5 }];
    d.separationRules = [{ studentA: '학생2', studentB: '학생3', minDistance: 3 }];
    const r = await randomizeSeats(d, { rng: mulberry32(3), yieldToUI: noYield });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.mapping[5]).toBe('학생1');
    expect(verifyAssignment(r.mapping, d)).toEqual([]);
  });
  it('이력 배제 불가 시 historyFallback', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2; d.layoutSettings.rows = 1;
    d.assignmentHistory = [{ mapping: { 0: 'A', 1: 'B' }, timestamp: 1 }, { mapping: { 0: 'B', 1: 'A' }, timestamp: 2 }];
    d.historyExcludeCount = 2;
    const r = await randomizeSeats(d, { rng: mulberry32(4), yieldToUI: noYield });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.historyFallback).toBe(true);
  });
  it('충돌하는 분리 규칙은 constraints 실패', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2; d.layoutSettings.rows = 1;
    d.separationRules = [{ studentA: 'A', studentB: 'B', minDistance: 5 }];
    const r = await randomizeSeats(d, { rng: mulberry32(5), yieldToUI: noYield, timeoutMs: 200 });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('constraints');
  });
});

describe('verifyAssignment', () => {
  it('고정 자리 위반을 찾는다', () => {
    const d = cls(); d.fixedSeats = [{ studentName: '학생1', seatIndex: 0 }];
    const v = verifyAssignment({ 0: '학생2', 1: '학생1' }, d);
    expect(v.some((x) => x.kind === 'fixed')).toBe(true);
  });
  it('분리 거리 위반을 찾는다', () => {
    const d = cls(); d.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 2 }];
    expect(verifyAssignment({ 0: '학생1', 1: '학생2' }, d).some((x) => x.kind === 'separation')).toBe(true);
    expect(verifyAssignment({ 0: '학생1', 12: '학생2' }, d)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/core/randomizer/randomizer.test.ts
```

- [ ] **Step 3: 구현**

`constraints.ts` — 레거시 493-616행(`checkConstraints`, `checkGenderConstraintFast`, `checkHistoryConstraint`, `checkGroupConstraint`)을 옮긴다. 시그니처는 레거시와 같고 타입만 붙인다.

`assign.ts` — 레거시 376-492행(`tryAssignment`, `backtrack`)을 옮긴다. `shuffle` 호출부에 `rng`를 넘기도록 파라미터를 하나 추가한다(`tryAssignment(..., rng)` → 내부 `shuffle(x, rng)`).

`index.ts`
```ts
import type { ClassData } from '../model/types';
import type { Assignment } from '../model/types';
import { getLayout } from '../layouts';
import { buildAdjacencyMap, buildRuleLookup, type PosMap } from './lookup';
import { tryAssignment } from './assign';
import type { Rng } from './rng';

export type RandomizeFailure = 'no-layout' | 'no-students' | 'capacity' | 'constraints';
export type RandomizeResult =
  | { ok: true; mapping: Assignment; historyFallback: boolean }
  | { ok: false; reason: RandomizeFailure; detail: string };
export interface RandomizeOptions { rng?: Rng; timeoutMs?: number; maxAttempts?: number; yieldToUI?: () => Promise<void> }

const defaultYield = () => new Promise<void>((r) => setTimeout(r, 0));

export async function randomizeSeats(data: ClassData, options: RandomizeOptions = {}): Promise<RandomizeResult> {
  const { rng = Math.random, timeoutMs = 2000, maxAttempts = 15, yieldToUI = defaultYield } = options;
  const { students, layoutType, layoutSettings, fixedSeats, separationRules } = data;
  const layout = getLayout(layoutType);
  if (!layout) return { ok: false, reason: 'no-layout', detail: `알 수 없는 배치: ${layoutType}` };

  const positions = layout.getSeatPositions(layoutSettings);
  const totalSeats = positions.length;
  if (students.length === 0) return { ok: false, reason: 'no-students', detail: '학생 명단이 비어 있습니다.' };
  const usable = totalSeats - (layoutSettings.disabledSeats ?? []).filter((i) => i < totalSeats).length;
  if (students.length > usable) return { ok: false, reason: 'capacity', detail: `학생 ${students.length}명, 좌석 ${usable}석` };

  const posMap: PosMap = {};
  for (const p of positions) posMap[p.index] = p;
  const adjacencyMap = buildAdjacencyMap(positions, posMap, data);
  const ruleLookup = buildRuleLookup(separationRules);

  const run = async (d: ClassData): Promise<Assignment | null> => {
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() > deadline) break;
      if (attempt > 0 && (attempt & 3) === 0) await yieldToUI();
      const r = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, d, adjacencyMap, deadline, ruleLookup, rng);
      if (r) return r;
    }
    return null;
  };

  const first = await run(data);
  if (first) return { ok: true, mapping: first, historyFallback: false };

  if (data.useHistoryExclusion !== false && (data.assignmentHistory ?? []).length > 0) {
    await yieldToUI();
    const second = await run({ ...data, useHistoryExclusion: false });
    if (second) return { ok: true, mapping: second, historyFallback: true };
  }
  return { ok: false, reason: 'constraints', detail: '분리 규칙·성별 규칙·고정 자리를 동시에 만족하는 배치를 찾지 못했습니다.' };
}
```

레거시와 다른 점은 두 가지뿐이다: (1) `capacity` 검사가 `disabledSeats`를 차감한다(레거시는 `students.length > totalSeats`만 보고 삭제 좌석은 `tryAssignment`에서 걸러져 실패로 떨어졌다. 골든 테스트에서 이 경우는 제외한다). (2) 실패 이유를 돌려준다.

`verify.ts` — 레거시에서 `verifyAssignment`를 찾아(`grep -rn "function verifyAssignment" legacy/js`) 같은 검사 항목(고정 자리, 분리 거리, 성별 규칙)을 `Violation[]`로 돌려주도록 옮긴다. 메시지는 레거시 문구 유지.

- [ ] **Step 4: 실행 → 통과, 커버리지 확인, 게이트, 커밋**

```bash
npx vitest run src/core/randomizer
npm run test:cov
npm run gate
git add -A
git commit -m "feat(core): randomizeSeats 이식 (rng 주입·실패 이유 반환)과 verifyAssignment"
```

---

### Task 13: 레거시 골든 테스트 (Phase 1 게이트)

**Files:**
- Create: `src/core/randomizer/golden.test.ts`, `docs/superpowers/gates/task-13.md`

**Interfaces:**
- Consumes: `randomizeSeats`(v2), `legacy/js/algorithm/seat-randomizer.js`의 `randomizeSeats`(v1)

- [ ] **Step 1: 골든 테스트 작성**

```ts
import { randomizeSeats } from './index';
import { mulberry32 } from './rng';
import { createDefaultData } from '../model/defaults';
import type { ClassData, LayoutType } from '../model/types';
import { randomizeSeats as legacyRandomize } from '../../../legacy/js/algorithm/seat-randomizer.js';

// v1은 Math.random을 직접 쓴다. 같은 시드 난수열을 Math.random에 꽂아 비교한다.
async function both(data: ClassData, seed: number) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  const timers = vi.useFakeTimers({ toFake: ['setTimeout'] });
  const p1 = legacyRandomize(structuredClone(data));
  await timers.runAllTimersAsync();
  const v1 = await p1;
  vi.useRealTimers();
  Math.random = orig;
  const v2 = await randomizeSeats(structuredClone(data), { rng: mulberry32(seed), yieldToUI: async () => {} });
  return { v1, v2 };
}

function scenario(layoutType: LayoutType, n: number, extra: (d: ClassData) => void = () => {}): ClassData {
  const d = createDefaultData();
  d.layoutType = layoutType;
  d.students = Array.from({ length: n }, (_, i) => `학생${i + 1}`);
  d.classSize = n;
  if (layoutType === 'custom') d.layoutSettings.customDesks = Array.from({ length: n + 2 }, (_, i) => ({ x: (i % 6) * 80, y: Math.floor(i / 6) * 60 }));
  if (layoutType === 'group') d.layoutSettings.groupSizes = [4, 4, 4, 4, 4, 4];
  if (layoutType === 'ushape') { d.layoutSettings.columns = 8; d.layoutSettings.rows = 8; }
  extra(d);
  return d;
}

const scenarios: [string, ClassData][] = [
  ['exam 기본', scenario('exam', 24)],
  ['pair 성별 mixed', scenario('pair', 24, (d) => { d.genderRule = 'mixed'; d.students.forEach((s, i) => { d.studentGenders[s] = i % 2 ? 'F' : 'M'; }); })],
  ['ushape 분리규칙', scenario('ushape', 20, (d) => { d.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 3 }]; })],
  ['custom 고정', scenario('custom', 18, (d) => { d.fixedSeats = [{ studentName: '학생3', seatIndex: 0 }]; })],
  ['group 이력 배제', scenario('group', 22, (d) => { d.assignmentHistory = [{ mapping: Object.fromEntries(d.students.map((s, i) => [i, s])), timestamp: 1 }]; })],
  ['exam 삭제 좌석', scenario('exam', 25, (d) => { d.layoutSettings.disabledSeats = [3, 4]; })],
];

describe('골든: v2 = v1 (시드 고정)', () => {
  it.each(scenarios)('%s', async (_name, data) => {
    for (const seed of [1, 2, 3]) {
      const { v1, v2 } = await both(data, seed);
      if (v1 === null) { expect(v2.ok).toBe(false); continue; }
      const { _historyFallback, ...v1map } = v1 as Record<string, unknown> & { _historyFallback?: boolean };
      expect(v2.ok).toBe(true); if (!v2.ok) return;
      expect(v2.mapping).toEqual(v1map);
      expect(v2.historyFallback).toBe(Boolean(_historyFallback));
    }
  });
});
```

`Date.now()` 마감 때문에 결과가 흔들리면 `vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })`로 시간을 함께 고정한다.

- [ ] **Step 2: 실행**

```bash
npx vitest run src/core/randomizer/golden.test.ts
```
Expected: 6 passed. 불일치가 나면 v2 이식이 레거시와 다른 것이다. 원인을 찾아 v2를 고친다(레거시는 절대 고치지 않는다). 세 시나리오 이상에서 계속 불일치면 에스컬레이션.

- [ ] **Step 3: 커버리지 게이트**

```bash
npm run test:cov
```
Expected: `src/core` lines ≥ 90%. 미달이면 미달 파일의 분기에 테스트를 추가한다.

- [ ] **Step 4: Phase 1 게이트 기록 후 커밋**

```bash
npm run gate
git add -A
git commit -m "test(core): 레거시 골든 테스트 6 시나리오 x 3 시드 (Phase 1 완료)"
```

---

## Phase 2 — 스토어·마이그레이션

### Task 14: 저장소 어댑터와 반 관리

**Files:**
- Create: `src/core/storage/adapter.ts`, `src/core/storage/memoryAdapter.ts`, `src/core/storage/localStorageAdapter.ts`, `src/core/storage/classes.ts`, `src/core/storage/classes.test.ts`
- 참고: `legacy/js/data/store.js:1-131`

**Interfaces:**
- Produces:
  ```ts
  export interface StorageAdapter { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
  export function createMemoryAdapter(initial?: Record<string, string>): StorageAdapter;
  export function createLocalStorageAdapter(storage: Storage): StorageAdapter;  // 인자로 받으므로 core가 window를 참조하지 않음
  export const KEYS = { CLASSES: 'seat-changer-classes', ACTIVE: 'seat-changer-active', DATA_PREFIX: 'seat-changer-data' } as const;
  export const dataKey = (className: string) => `${KEYS.DATA_PREFIX}-${className}`;
  export function createClassRegistry(adapter: StorageAdapter): {
    migrateIfNeeded(): void;                 // v1 store.js:33-46과 동일
    list(): string[]; active(): string;
    add(name: string): boolean; rename(oldName: string, newName: string): boolean;
    remove(name: string): boolean; switchTo(name: string): boolean; duplicate(src: string, newName: string): boolean;
    readRaw(name: string): string | null; writeRaw(name: string, json: string): void;
  }
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/core/storage/classes.test.ts`
```ts
import { createMemoryAdapter } from './memoryAdapter';
import { createClassRegistry, KEYS, dataKey } from './classes';

describe('createClassRegistry', () => {
  it('첫 실행: 1반 생성, 옛 단일 키를 1반으로 이전', () => {
    const a = createMemoryAdapter({ [KEYS.DATA_PREFIX]: '{"students":["A"]}' });
    const r = createClassRegistry(a);
    r.migrateIfNeeded();
    expect(r.list()).toEqual(['1반']);
    expect(r.active()).toBe('1반');
    expect(a.get(dataKey('1반'))).toBe('{"students":["A"]}');
  });
  it('추가·중복·상한 15', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.add('2반')).toBe(true);
    expect(r.add('2반')).toBe(false);
    expect(r.add('  ')).toBe(false);
    for (let i = 3; i <= 15; i++) r.add(`${i}반`);
    expect(r.add('16반')).toBe(false);
    expect(r.list()).toHaveLength(15);
  });
  it('이름 변경은 데이터 키를 옮기고 활성 반도 따라간다', () => {
    const a = createMemoryAdapter(); const r = createClassRegistry(a); r.migrateIfNeeded();
    a.set(dataKey('1반'), '{"x":1}');
    expect(r.rename('1반', '6학년 7반')).toBe(true);
    expect(a.get(dataKey('1반'))).toBeNull();
    expect(a.get(dataKey('6학년 7반'))).toBe('{"x":1}');
    expect(r.active()).toBe('6학년 7반');
  });
  it('마지막 반은 삭제 불가, 삭제 시 활성 반 이동', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.remove('1반')).toBe(false);
    r.add('2반'); r.switchTo('2반');
    expect(r.remove('2반')).toBe(true);
    expect(r.active()).toBe('1반');
  });
  it('복제', () => {
    const a = createMemoryAdapter(); const r = createClassRegistry(a); r.migrateIfNeeded();
    a.set(dataKey('1반'), '{"students":["A"]}');
    expect(r.duplicate('1반', '복사본')).toBe(true);
    expect(a.get(dataKey('복사본'))).toBe('{"students":["A"]}');
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/core/storage
```

- [ ] **Step 3: 구현**

`adapter.ts`
```ts
export interface StorageAdapter { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
```

`memoryAdapter.ts`
```ts
import type { StorageAdapter } from './adapter';
export function createMemoryAdapter(initial: Record<string, string> = {}): StorageAdapter {
  const m = new Map(Object.entries(initial));
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); }, remove: (k) => { m.delete(k); } };
}
```

`localStorageAdapter.ts`
```ts
import type { StorageAdapter } from './adapter';
export function createLocalStorageAdapter(storage: Storage): StorageAdapter {
  return {
    get: (k) => { try { return storage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { storage.setItem(k, v); } catch { /* 용량 초과 등: 호출자가 토스트 */ } },
    remove: (k) => { try { storage.removeItem(k); } catch { /* noop */ } },
  };
}
```

`classes.ts` — 레거시 `store.js:33-131`의 `migrateIfNeeded, getClassList, getActiveClass, addClass, renameClass, removeClass, switchClass, duplicateClass`를 `adapter` 위에서 동작하도록 옮긴다. `_cache` 무효화는 스토어(Task 16)가 담당하므로 여기서는 제거. `add`는 새 반에 `createDefaultData()`를 JSON으로 써 준다(레거시와 동일).

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/core/storage
npm run gate
git add -A
git commit -m "feat(core): 저장소 어댑터와 반 관리 레지스트리 (v1 키 유지)"
```

---

### Task 15: v1→v2 마이그레이션과 JSON 가져오기·내보내기

**Files:**
- Create: `src/core/model/migrate.ts`, `src/core/storage/json.ts`, `src/core/model/migrate.test.ts`, `src/test/fixtures/v1-basic.json`, `src/test/fixtures/v1-group-history.json`, `src/test/fixtures/v1-custom-disabled.json`
- 참고: `legacy/js/data/store.js:12-27`(sanitizeObj), `170-215`(importJSON)

**Interfaces:**
- Produces:
  ```ts
  // migrate.ts
  export function stripDangerousKeys<T>(obj: T): T;               // __proto__, constructor, prototype 재귀 제거
  export function migrateToV2(input: unknown): ClassData;          // v1 또는 v2 객체 → v2. 필드 상한·기본값은 legacy importJSON과 동일. 항상 유효한 ClassData 반환
  export type LoadResult = { ok: true; data: ClassData; migrated: boolean } | { ok: false; data: ClassData; error: string };
  export function loadClassData(raw: string | null): LoadResult; // null/파싱 실패 → ok:false + 기본값
  // json.ts
  export function exportClassJSON(data: ClassData): string;        // JSON.stringify(data, null, 2)
  export function importClassJSON(json: string): { ok: true; data: ClassData } | { ok: false; error: string };  // lastAssignment은 null로 (legacy와 동일)
  ```

- [ ] **Step 1: 픽스처 작성**

`src/test/fixtures/v1-basic.json` — `schemaVersion` 없음, students 22명(가명), exam 6x4, fixedSeats 1건, separationRules 1건, studentGenders 몇 명, `lastAssignment` 있음.
`src/test/fixtures/v1-group-history.json` — layoutType group, groupSizes [4,4,4,4,4,2], groupHistory 2건, assignmentHistory 3건.
`src/test/fixtures/v1-custom-disabled.json` — layoutType custom, customDesks 20개, disabledSeats [1,2](custom에선 무시되지만 존재), viewPerspective 'teacher', `__proto__` 키 하나 삽입.

세 파일 모두 실제 v1 앱이 저장하는 형태(`legacy/js/data/models.js`의 createDefaultData 필드)를 따르되 이름은 가명을 쓴다.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/core/model/migrate.test.ts`
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateToV2, loadClassData, stripDangerousKeys } from './migrate';
import { ClassDataSchema } from './schema';
import { exportClassJSON, importClassJSON } from '../storage/json';

const fx = (n: string) => readFileSync(resolve(__dirname, '../../test/fixtures', n), 'utf8');

describe('stripDangerousKeys', () => {
  it('__proto__ 제거', () => {
    const o = JSON.parse('{"a":1,"__proto__":{"polluted":true},"n":{"constructor":1}}');
    const s = stripDangerousKeys(o) as Record<string, unknown>;
    expect(Object.keys(s)).toEqual(['a', 'n']);
    expect(Object.keys(s.n as object)).toEqual([]);
  });
});

describe('migrateToV2', () => {
  it.each(['v1-basic.json', 'v1-group-history.json', 'v1-custom-disabled.json'])('%s → 유효한 v2', (f) => {
    const out = migrateToV2(JSON.parse(fx(f)));
    expect(out.schemaVersion).toBe(2);
    expect(ClassDataSchema.safeParse(out).success).toBe(true);
  });
  it('학생·규칙·이력이 보존된다', () => {
    const src = JSON.parse(fx('v1-basic.json'));
    const out = migrateToV2(src);
    expect(out.students).toEqual(src.students);
    expect(out.fixedSeats).toEqual(src.fixedSeats);
    expect(out.separationRules).toEqual(src.separationRules);
    expect(out.lastAssignment?.mapping).toEqual(src.lastAssignment.mapping);
  });
  it('범위 밖 값은 기본값·상한으로', () => {
    const out = migrateToV2({ layoutSettings: { columns: 99, rows: -1, disabledSeats: [1, 'x', 5000] }, historyExcludeCount: 9 });
    expect(out.layoutSettings.columns).toBe(12);
    expect(out.layoutSettings.rows).toBe(5);
    expect(out.layoutSettings.disabledSeats).toEqual([1]);
    expect(out.historyExcludeCount).toBe(1);
  });
  it('이미 v2면 그대로', () => {
    const v2 = migrateToV2(JSON.parse(fx('v1-basic.json')));
    expect(migrateToV2(v2)).toEqual(v2);
  });
});

describe('loadClassData', () => {
  it('null → 기본값, ok:false', () => expect(loadClassData(null)).toMatchObject({ ok: false }));
  it('깨진 JSON → 기본값, ok:false', () => expect(loadClassData('{oops')).toMatchObject({ ok: false }));
  it('v1 → ok, migrated:true', () => expect(loadClassData(fx('v1-basic.json'))).toMatchObject({ ok: true, migrated: true }));
});

describe('json', () => {
  it('내보내기 → 가져오기 왕복 (lastAssignment은 null)', () => {
    const d = migrateToV2(JSON.parse(fx('v1-basic.json')));
    const back = importClassJSON(exportClassJSON(d));
    expect(back.ok).toBe(true); if (!back.ok) return;
    expect(back.data).toEqual({ ...d, lastAssignment: null });
  });
  it('v1 백업 파일도 가져온다', () => expect(importClassJSON(fx('v1-group-history.json')).ok).toBe(true));
  it('배열·문자열은 거부', () => {
    expect(importClassJSON('[1]').ok).toBe(false);
    expect(importClassJSON('"x"').ok).toBe(false);
  });
});
```

- [ ] **Step 3: 실행 → 실패 확인**

```bash
npx vitest run src/core/model/migrate.test.ts
```

- [ ] **Step 4: 구현**

`migrate.ts` — `stripDangerousKeys`는 레거시 `sanitizeObj`(store.js:12-22)와 동일. `migrateToV2`는 레거시 `importJSON`(170-215행)의 필드별 정규화를 그대로 함수로 옮기되 `lastAssignment`은 보존한다(가져오기에서만 null로 바꾼다). `schemaVersion: 2`를 붙이고 `classSize = students.length`. 마지막에 `ClassDataSchema.parse`로 자기 검증(실패하면 버그이므로 throw).

```ts
export function loadClassData(raw: string | null): LoadResult {
  if (raw === null) return { ok: false, data: createDefaultData(), error: '저장된 데이터가 없습니다.' };
  try {
    const parsed = stripDangerousKeys(JSON.parse(raw));
    const migrated = !(typeof parsed === 'object' && parsed !== null && (parsed as { schemaVersion?: number }).schemaVersion === 2);
    return { ok: true, data: migrateToV2(parsed), migrated };
  } catch (e) {
    return { ok: false, data: createDefaultData(), error: e instanceof Error ? e.message : String(e) };
  }
}
```

`json.ts`
```ts
import type { ClassData } from '../model/types';
import { migrateToV2, stripDangerousKeys } from '../model/migrate';

export const exportClassJSON = (data: ClassData) => JSON.stringify(data, null, 2);

export function importClassJSON(json: string): { ok: true; data: ClassData } | { ok: false; error: string } {
  try {
    const parsed = stripDangerousKeys(JSON.parse(json));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: '자리바꾸기 설정 파일이 아닙니다.' };
    return { ok: true, data: { ...migrateToV2(parsed), lastAssignment: null } };
  } catch {
    return { ok: false, error: '파일을 읽지 못했습니다. JSON 형식을 확인하세요.' };
  }
}
```

- [ ] **Step 5: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/core
npm run gate
git add -A
git commit -m "feat(core): v1→v2 마이그레이션, 로드 결과 타입, JSON 가져오기·내보내기"
```

---

### Task 16: Zustand 스토어 (persist + Undo/Redo)

**Files:**
- Create: `src/store/useAppStore.ts`, `src/store/selectors.ts`, `src/store/useAppStore.test.ts`

**Interfaces:**
- Consumes: `createClassRegistry`, `loadClassData`, `exportClassJSON`, `importClassJSON`, `getTotalSeats`
- Produces:
  ```ts
  export interface AppState {
    classes: string[]; activeClass: string; data: ClassData;
    loadNotice: string | null;                 // 로드 실패·마이그레이션 안내. UI가 토스트 후 clearNotice()
    // 반
    addClass(name: string): boolean; renameClass(o: string, n: string): boolean; removeClass(name: string): boolean; switchClass(name: string): void; duplicateClass(src: string, n: string): boolean;
    // 데이터
    update(partial: Partial<ClassData>): void;                                   // 얕은 병합 후 저장
    updateLayoutSettings(partial: Partial<LayoutSettings>): void;
    setStudents(names: string[]): void;                                          // sanitize + classSize 갱신 + 명단에 없는 고정/규칙/성별 정리
    deleteSeat(seatIndex: number): void;  restoreSeat(seatIndex: number): void;  restoreAllSeats(): void;
    setGridSize(columns: number, rows: number): { clearedDisabled: number };     // 행·열 변경 시 disabledSeats 비움
    recordAssignment(mapping: Assignment, historyFallback: boolean): void;       // legacy student-screen 526-568행 로직(assignmentHistory·groupHistory push, 최대 5)
    exportJSON(): string; importJSON(json: string): { ok: boolean; error?: string };
    clearNotice(): void;
  }
  export const createAppStore: (adapter: StorageAdapter) => UseBoundStore<StoreApi<AppState>>;   // 테스트용
  export const useAppStore: ReturnType<typeof createAppStore>;                                    // createLocalStorageAdapter(window.localStorage)
  export const useTemporal: () => { undo(): void; redo(): void; pastStates: unknown[]; futureStates: unknown[] };
  ```
  Undo 대상(zundo `partialize`): `data.layoutType`, `data.layoutSettings`, `data.fixedSeats`, `data.separationRules`, `data.genderRule`, `data.studentGenders`. 스택 50.
  저장(persist)은 zustand `persist`를 쓰지 않고 `subscribe`로 직접 어댑터에 쓴다(반별 키가 동적이라 persist가 맞지 않음). 상태 변경마다 `adapter.set(dataKey(activeClass), JSON.stringify(data))`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/store/useAppStore.test.ts`
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAppStore } from './useAppStore';
import { createMemoryAdapter } from '@/core/storage/memoryAdapter';
import { dataKey, KEYS } from '@/core/storage/classes';

const v1 = readFileSync(resolve(__dirname, '../test/fixtures/v1-basic.json'), 'utf8');

function boot(initial: Record<string, string> = {}) {
  const adapter = createMemoryAdapter(initial);
  const store = createAppStore(adapter);
  return { adapter, store, s: () => store.getState() };
}

describe('부팅', () => {
  it('빈 저장소 → 1반 기본값', () => {
    const { s } = boot();
    expect(s().classes).toEqual(['1반']);
    expect(s().data.students).toEqual([]);
    expect(s().loadNotice).toBeNull();
  });
  it('v1 데이터를 읽고 마이그레이션 안내를 남긴다', () => {
    const { s } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반', [dataKey('1반')]: v1 });
    expect(s().data.students.length).toBeGreaterThan(0);
    expect(s().data.schemaVersion).toBe(2);
    expect(s().loadNotice).toMatch(/새 버전/);
  });
  it('깨진 데이터 → 기본값 + 안내', () => {
    const { s } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반', [dataKey('1반')]: '{broken' });
    expect(s().loadNotice).toMatch(/읽지 못해/);
  });
});

describe('저장', () => {
  it('update는 같은 키에 v2 JSON을 쓴다', () => {
    const { adapter, s } = boot();
    s().update({ genderRule: 'same' });
    const saved = JSON.parse(adapter.get(dataKey('1반'))!);
    expect(saved.genderRule).toBe('same');
    expect(saved.schemaVersion).toBe(2);
  });
  it('반 전환은 그 반의 데이터를 로드한다', () => {
    const { s } = boot();
    s().addClass('2반'); s().switchClass('2반'); s().setStudents(['A', 'B']);
    s().switchClass('1반');
    expect(s().data.students).toEqual([]);
    s().switchClass('2반');
    expect(s().data.students).toEqual(['A', 'B']);
  });
});

describe('좌석 삭제·복구·Undo', () => {
  it('deleteSeat → restoreSeat → restoreAllSeats', () => {
    const { s } = boot();
    s().update({ fixedSeats: [{ studentName: 'A', seatIndex: 4 }], students: ['A'], classSize: 1 });
    s().deleteSeat(4); s().deleteSeat(7);
    expect(s().data.layoutSettings.disabledSeats).toEqual([4, 7]);
    expect(s().data.fixedSeats).toEqual([]);                 // 삭제된 좌석의 고정은 해제
    s().restoreSeat(4);
    expect(s().data.layoutSettings.disabledSeats).toEqual([7]);
    s().restoreAllSeats();
    expect(s().data.layoutSettings.disabledSeats).toEqual([]);
  });
  it('setGridSize는 삭제 목록을 비우고 개수를 돌려준다', () => {
    const { s } = boot();
    s().deleteSeat(1); s().deleteSeat(2);
    expect(s().setGridSize(5, 5)).toEqual({ clearedDisabled: 2 });
    expect(s().data.layoutSettings).toMatchObject({ columns: 5, rows: 5, disabledSeats: [] });
  });
  it('Undo가 좌석 삭제를 되돌린다', () => {
    const { store, s } = boot();
    s().deleteSeat(3);
    store.temporal.getState().undo();
    expect(s().data.layoutSettings.disabledSeats).toEqual([]);
    store.temporal.getState().redo();
    expect(s().data.layoutSettings.disabledSeats).toEqual([3]);
  });
  it('명단 변경은 Undo 대상이 아니다', () => {
    const { store, s } = boot();
    const before = store.temporal.getState().pastStates.length;
    s().setStudents(['A']);
    expect(store.temporal.getState().pastStates.length).toBe(before);
  });
});

describe('recordAssignment', () => {
  it('이전 결과를 이력으로 밀고 최대 5개', () => {
    const { s } = boot();
    for (let i = 0; i < 7; i++) s().recordAssignment({ 0: `학생${i}` }, false);
    expect(s().data.lastAssignment?.mapping).toEqual({ 0: '학생6' });
    expect(s().data.assignmentHistory).toHaveLength(5);
    expect(s().data.assignmentHistory[4]?.mapping).toEqual({ 0: '학생5' });
  });
  it('모둠 배치면 groupHistory도 쌓는다', () => {
    const { s } = boot();
    s().update({ layoutType: 'group', students: ['A', 'B', 'C', 'D'], classSize: 4 });
    s().updateLayoutSettings({ groupSizes: [2, 2] });
    s().recordAssignment({ 0: 'A', 1: 'B', 2: 'C', 3: 'D' }, false);
    expect(s().data.groupHistory[0]?.groups).toEqual([['A', 'B'], ['C', 'D']]);
  });
});

describe('JSON', () => {
  it('내보내기·가져오기', () => {
    const { s } = boot();
    s().setStudents(['A', 'B']);
    const json = s().exportJSON();
    s().setStudents([]);
    expect(s().importJSON(json).ok).toBe(true);
    expect(s().data.students).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

```bash
npx vitest run src/store
```

- [ ] **Step 3: 구현**

`src/store/useAppStore.ts` — 골격:

```ts
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import type { Assignment, ClassData, LayoutSettings } from '@/core/model/types';
import { createDefaultData, LIMITS } from '@/core/model/defaults';
import { sanitizeStudents } from '@/core/model/schema';
import { loadClassData } from '@/core/model/migrate';
import type { StorageAdapter } from '@/core/storage/adapter';
import { createClassRegistry, dataKey } from '@/core/storage/classes';
import { createLocalStorageAdapter } from '@/core/storage/localStorageAdapter';
import { exportClassJSON, importClassJSON } from '@/core/storage/json';
import { groupLayout } from '@/core/layouts/group';

export interface AppState { /* Interfaces 블록 그대로 */ }

function load(registry: ReturnType<typeof createClassRegistry>, name: string) {
  const r = loadClassData(registry.readRaw(name));
  const notice = !r.ok
    ? (registry.readRaw(name) === null ? null : '저장 데이터를 읽지 못해 초기화했습니다. 백업 JSON이 있으면 불러오세요.')
    : r.migrated ? '새 버전으로 데이터를 옮겼습니다. 이전과 똑같이 쓰실 수 있습니다.' : null;
  return { data: r.data, notice };
}

export function createAppStore(adapter: StorageAdapter) {
  const registry = createClassRegistry(adapter);
  registry.migrateIfNeeded();
  const active = registry.active();
  const first = load(registry, active);

  const store = create<AppState>()(
    temporal(
      (set, get) => ({
        classes: registry.list(), activeClass: active, data: first.data, loadNotice: first.notice,
        // ... 각 액션. 모든 데이터 액션은 set(state => ({ data: {...} })) 형태로 새 객체를 만든다.
        deleteSeat: (i) => { const d = get().data; const disabled = Array.from(new Set([...d.layoutSettings.disabledSeats, i])).sort((a, b) => a - b);
          set({ data: { ...d, layoutSettings: { ...d.layoutSettings, disabledSeats: disabled }, fixedSeats: d.fixedSeats.filter((f) => f.seatIndex !== i) } }); },
        restoreSeat: (i) => { const d = get().data; set({ data: { ...d, layoutSettings: { ...d.layoutSettings, disabledSeats: d.layoutSettings.disabledSeats.filter((x) => x !== i) } } }); },
        restoreAllSeats: () => { const d = get().data; set({ data: { ...d, layoutSettings: { ...d.layoutSettings, disabledSeats: [] } } }); },
        setGridSize: (columns, rows) => { const d = get().data; const cleared = d.layoutSettings.disabledSeats.length;
          set({ data: { ...d, layoutSettings: { ...d.layoutSettings, columns, rows, disabledSeats: [] } } }); return { clearedDisabled: cleared }; },
        // recordAssignment: legacy student-screen.js 526-568행을 그대로. groupLayout.getGroupSizes 사용.
        // setStudents: sanitizeStudents → classSize → fixedSeats/separationRules/studentGenders에서 명단에 없는 이름 제거
        // switchClass: registry.switchTo → load → set({activeClass, data, loadNotice}) → temporal.clear()
        // exportJSON/importJSON: json.ts 사용
        // clearNotice: set({ loadNotice: null })
      }),
      {
        limit: 50,
        partialize: (s) => ({ data: { layoutType: s.data.layoutType, layoutSettings: s.data.layoutSettings, fixedSeats: s.data.fixedSeats, separationRules: s.data.separationRules, genderRule: s.data.genderRule, studentGenders: s.data.studentGenders } }),
        equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      },
    ),
  );

  // 저장: data가 바뀔 때마다 활성 반 키에 쓴다
  store.subscribe((state, prev) => {
    if (state.data !== prev.data) adapter.set(dataKey(state.activeClass), JSON.stringify(state.data));
  });
  return store;
}

export const useAppStore = createAppStore(createLocalStorageAdapter(window.localStorage));
export const useTemporal = () => useAppStore.temporal.getState() as TemporalState<Partial<AppState>>;
```

zundo `partialize`가 부분 상태만 스냅샷하므로 undo 시 `data`의 나머지 필드(students 등)는 현재 값이 유지되도록 zundo의 `handleSet`/merge 동작을 확인한다. 부분 스냅샷 복원이 `data`를 통째로 덮어쓰면(students가 사라지면) `partialize` 대신 `equality`만 쓰고 액션 안에서 `temporal.pause()/resume()`으로 명단 변경을 Undo에서 제외하는 방식으로 바꾼다. 어느 쪽이든 테스트 "명단 변경은 Undo 대상이 아니다"와 "Undo가 좌석 삭제를 되돌린다"가 둘 다 통과해야 한다.

`src/store/selectors.ts`
```ts
import type { AppState } from './useAppStore';
import { getTotalSeats } from '@/core/layouts';
export const selectTotalSeats = (s: AppState) => getTotalSeats(s.data);
export const selectDisabledCount = (s: AppState) => s.data.layoutSettings.disabledSeats.length;
export const selectSeatWarning = (s: AppState): string | null => {
  const total = getTotalSeats(s.data), n = s.data.students.length;
  if (n === 0 || total === 0) return null;
  if (n > total) return `학생 수(${n}명)가 좌석 수(${total}석)보다 많습니다. 좌석을 추가하거나 명단을 조정하세요.`;
  if (total - n > total * 0.5) return `좌석(${total}석)이 학생 수(${n}명)보다 많이 남습니다. 행·열 수를 조정해 보세요.`;
  return null;
};
```

`useAppStore`의 모듈 최상단 `window.localStorage` 접근은 테스트(jsdom)에서도 동작한다. `createAppStore`만 테스트하므로 문제없다.

- [ ] **Step 4: 실행 → 통과, 게이트, 커밋**

```bash
npx vitest run src/store
npm run gate
git add -A
git commit -m "feat(store): Zustand 스토어 (v1 키 저장·마이그레이션 안내·좌석 삭제/복구·Undo/Redo·이력 기록)"
```

---

### Task 17: Phase 2 게이트 — 실데이터 로드 확인과 태그

**Files:**
- Modify: `src/pages/TeacherPage.tsx`(임시 진단 표시), `docs/superpowers/gates/task-17.md`
- Create: `e2e/v1-data-load.spec.ts`

- [ ] **Step 1: TeacherPage에 임시 진단 블록**

`TeacherPage`가 `useAppStore`에서 `classes, activeClass, data.students.length, loadNotice`를 읽어 `<pre data-testid="diag">`로 보여 준다. (계획 2에서 실제 화면으로 교체된다.)

- [ ] **Step 2: E2E — v1 데이터를 localStorage에 심고 접속**

`e2e/v1-data-load.spec.ts`
```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const v1 = readFileSync('src/test/fixtures/v1-basic.json', 'utf8');

test('v1 localStorage 데이터가 v2에서 읽힌다', async ({ page }) => {
  await page.addInitScript((raw) => {
    localStorage.setItem('seat-changer-classes', '["1반","6-7"]');
    localStorage.setItem('seat-changer-active', '6-7');
    localStorage.setItem('seat-changer-data-6-7', raw);
  }, v1);
  await page.goto('/');
  const diag = page.getByTestId('diag');
  await expect(diag).toContainText('"activeClass": "6-7"');
  await expect(diag).toContainText('"students": 22');
  await expect(diag).toContainText('새 버전');
  // 저장 키가 v2로 덮어써졌는지
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(saved.schemaVersion).toBe(2);
  expect(saved.students).toHaveLength(22);
});
```

(픽스처 학생 수가 22가 아니면 그 수로 맞춘다.)

- [ ] **Step 3: 실행**

```bash
npm run e2e
```
Expected: 2 passed (dev-cork 포함)

- [ ] **Step 4: 이 PC의 실제 데이터로 수동 확인**

브라우저에서 `https://seat-changer-two.vercel.app` 콘솔로 `localStorage` 세 키를 복사해(학생 이름은 개인정보이므로 파일로 저장하지 않는다) `npm run dev` 화면의 localStorage에 붙여 넣고 진단 블록이 반·학생 수·안내를 정확히 보여 주는지 본다. 결과를 `task-17.md`에 적는다(이름은 적지 않는다).

- [ ] **Step 5: Phase 2 게이트 기록, 태그, 커밋**

```bash
npm run gate
git add -A
git commit -m "test: v1 데이터 로드 E2E와 임시 진단 화면 (Phase 2 완료)"
git tag v2-phase2
```

---

## 계획 1 완료 조건

- `npm run gate` 초록, `npm run e2e` 2 passed, `npm run test:cov`에서 `src/core` 90% 이상.
- `docs/superpowers/gates/task-01.md` ~ `task-17.md` 전부 존재.
- 태그 `v2-phase2`.
- 다음: 계획 2(`2026-09-XX-seat-changer-v2-plan2-screens.md`, 스펙 5·6장 + 4장의 화면 적용)를 이 시점의 코드 위에서 작성한다.

## 자체 검토 결과

- 스펙 1장(구조) → Task 1, 2. 2장(상태·호환) → Task 14, 15, 16. 3장(알고리즘) → Task 9~13. 4장(디자인 시스템) → Task 3~7. 8장(테스트·경로·브랜치) → Task 1, 2, 7, 13, 17. 9장(게이트·루프) → Task 2 템플릿 + 각 Task의 gate 단계 + Task 7·13·17의 Phase 게이트. 5·6·7장은 계획 2·3.
- 이름 일관성: `NoteSeatState`, `RandomizeResult`, `createAppStore`, `createClassRegistry`, `loadClassData`, `migrateToV2`, `getTotalSeats`, `dataKey`, `KEYS`는 정의한 Task 이후에만 같은 이름으로 쓰인다.
- 레거시 참조 행 번호는 `legacy/`로 옮긴 뒤에도 파일 내부 행은 그대로다.
