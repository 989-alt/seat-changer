# TV 가독성·가로 배치·자리 바꾸기·고정 표시 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 발표 화면 배치도가 TV 가로 화면을 꽉 채우고, 인쇄가 용지 방향에 맞춰 꽉 차며, 지난 배치를 불러와 이력 오염 없이 자리를 바꿀 수 있고, 학생이 보는 곳에서 고정 표시가 사라지게 한다.

**Architecture:** 공용 배치도(`SeatBoard`/`NoteSeat`)의 발표용 `lg` 이름표를 200x100 가로형으로 통일하고 U자를 row/col 격자로 그린다. 발표 화면은 기존 `transform: scale` 자동 맞춤을 그대로 두고 화면 틀(제목 칠판·큰 막대)을 줄인다. 새 순수 함수(지난 배치 검사·인쇄 맞춤)와 새 스토어 동작(`replaceLastAssignment`)을 발표 화면에서 잇는다.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS 4, Zustand 5(+zundo), Vitest 3 + Testing Library, Playwright 1.56.

**Spec:** `docs/superpowers/specs/2026-09-28-tv-landscape-swap-design.md`

## Global Constraints

- 저장소 `C:\Users\Public\seat-changer`(ASCII 경로), 브랜치 `feat/tv-landscape-swap`. master에 직접 커밋하지 않는다.
- 이모지 금지(소스·테스트·주석 모두). 허용 기호는 `✓✕✗★☆→←↑↓①②③④⑤⑥⑦⑧⑨⑩`뿐. `↔`, `▶`, `✅` 등은 금지(`scripts/scan-emoji.mjs`). 가운뎃점 `·`(U+00B7)은 허용.
- 소스·테스트에 "점 + 이미지 확장자"가 따옴표·괄호 앞에 오는 문자열 금지(예: 따옴표 안의 `.png`). `image/png` 같은 MIME 문자열은 괜찮다.
- Tailwind 임의값 클래스(`text-[48px]` 등)는 문자열 보간으로 만들지 않는다. 리터럴로 쓴다.
- 대비 규칙: cork 배경 위 글자는 `text-ink`. `opacity-*`로 위계를 만들지 않는다. 좌석 번호는 `text-ink`. 장식 요소(`aria-hidden`)는 `pointer-events-none`.
- 사용자에게 보이는 문구는 아래를 글자 그대로 쓴다.
  - 지난 배치를 못 불러옴: `명단이나 배치가 바뀌어 지난 배치는 불러오지 않았습니다.`
  - 상태 칸 기본: `두 자리를 차례로 누르면 서로 바뀝니다`
  - 상태 칸 선택 중: `${n}번 자리를 골랐습니다. 바꿀 자리를 누르세요 (같은 자리를 다시 누르면 취소)` (`n` = 좌석 번호 + 1)
  - 전체 화면 버튼: `전체 화면` / `전체 화면 끝내기`
  - 인쇄 제목: `[ ${반 이름} · 학생 시선 ]`, `[ ${반 이름} · 선생님 시선 ]`
- 커밋: 자기 Task의 파일만 경로를 지정해 `git add <경로...>`(`git add -A`, `git add .` 금지). 커밋 메시지 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. 같은 작업 트리에서 다른 에이전트가 병렬로 커밋하므로 `index.lock` 오류가 나면 5초 뒤 다시 시도한다.
- 병렬 작업 중 테스트: 개발 중에는 자기 테스트 파일만 돌린다(`npx vitest run <경로>`). Task 끝에 `npm run gate`(typecheck·lint·test·scan)를 돌린다. 자기 소유가 아닌 파일에서 실패하면 1분 뒤 한 번 더 돌리고, 그래도 실패하면 고치지 말고 보고한다.
- 셸 주의: 한글 경로가 섞이면 bash heredoc이 깨진다. 파일은 Write/Edit 도구로 만든다. 저장소 안에 임시 파일을 만들지 않는다(스크래치는 `C:\Users\Public\tmp-shots` 같은 저장소 밖 ASCII 경로).
- Playwright 즉석 스크립트는 실행 전에 `TEMP`/`TMP`를 ASCII 경로(예: `C:\Users\Public\tmp-shots\tmp`)로 바꾼다. 한글 TEMP에서 Node가 출력 없이 `0xC0000409`로 죽는다. E2E는 `npm run e2e`(래퍼가 캐시 경로를 처리한다. 빌드 포함, 포트 4173).
- 새 의존성을 추가하지 않는다.

## 실행 순서와 담당

| 단계 | Task | 담당 에이전트 | 선행 |
|---|---|---|---|
| Wave 1 (병렬) | Task 1 스토어 `replaceLastAssignment` | impl-s | - |
| Wave 1 (병렬) | Task 2 발표 로직(지난 배치 검사·인쇄 맞춤·useDrawSequence) | impl-m | - |
| Wave 1 (병렬) | Task 3 이름표·배치도(NoteSeat·SeatBoard·U자·고정 표시) | impl-l | - |
| Wave 2 | Task 4 발표 화면 통합(틀·조작 막대·전체 화면·인쇄·이미지) | impl-l | 1, 2, 3 |
| Wave 3 | Task 5 E2E | impl-m | 4 |
| 검증 | Opus 5.5 max 검증자(개발과 분리) | fork(Opus 5.5) | 5 |
| 반영 | 기획(메인)이 반영 여부 결정 → 반영 항목만 impl-* 위임 | 메인 → impl-* | 검증 |
| 배포 | Task 6 병합·푸시·라이브 확인 | 메인 | 최종 검증 |

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `src/store/useAppStore.ts` (수정) | `replaceLastAssignment` 추가, 모둠 묶기 헬퍼 `groupsOf` 추출 | 1 |
| `src/store/useAppStore.test.ts` (수정) | `replaceLastAssignment` 테스트 | 1 |
| `src/features/present/lastAssignment.ts` (신규) | 지난 배치를 발표 화면에 보여 줘도 되는지 검사 | 2 |
| `src/features/present/lastAssignment.test.ts` (신규) | 위 테스트 | 2 |
| `src/features/present/printFit.ts` (신규) | 인쇄 용지 방향·배율 계산(순수 함수) | 2 |
| `src/features/present/printFit.test.ts` (신규) | 위 테스트 | 2 |
| `src/features/present/useDrawSequence.ts` (수정) | `initialMapping`, `onSwapped`, 교환 후 위반 재계산 | 2 |
| `src/features/present/useDrawSequence.test.ts` (수정) | 위 테스트 | 2 |
| `src/components/cork/NoteSeat.tsx` (수정) | lg 가로형 이름표, 이름 길이별 글자 크기, 역할을 이름표 안에, `data-seat-name` | 3 |
| `src/components/cork/NoteSeat.test.tsx` (수정) | 위 테스트 | 3 |
| `src/features/layout/SeatBoard.tsx` (수정) | lg 슬롯 200px 통일, U자 격자, `showFixed`, 역할 전달 | 3 |
| `src/features/layout/SeatBoard.test.tsx` (수정) | 위 테스트 | 3 |
| `src/pages/DevCorkPage.tsx` (수정) | lg 이름표 데모를 실제 슬롯 폭(200px)으로 | 3 |
| `e2e/dev-cork.spec.ts` (수정, 주석만) | lg 얼굴 설명 주석을 새 크기에 맞춤 | 3 |
| `src/features/present/useFullscreen.ts` (신규) | 전체 화면 켜기·끄기 훅 | 4 |
| `src/features/present/PresentControls.tsx` (신규) | 얇은 조작 막대(반 이름·상태 칸·버튼) | 4 |
| `src/features/present/PresentControls.test.tsx` (신규) | 위 테스트 | 4 |
| `src/features/present/boardImage.ts` (신규) | 이미지 저장 그리기(PresentPage에서 이동 + 수정) | 4 |
| `src/features/present/boardImage.test.ts` (신규) | 글자 크기 비례 테스트 | 4 |
| `src/pages/PresentPage.tsx` (수정) | 화면 틀, 지난 배치, 인쇄 맞춤, 연결 | 4 |
| `src/features/present/present.css` (수정) | 인쇄 규칙(토스트 숨김·제목·배치도 가운데) | 4 |
| `src/features/present/PresentPage.test.tsx` (수정) | 발표 화면 테스트 | 4 |
| `e2e/present-draw.spec.ts` (수정) | 지난 배치로 여는 동작에 맞게 | 5 |
| `e2e/present-tv.spec.ts` (신규) | 교환 유지·글자 크기·U자 겹침·인쇄 가로·고정 표시 | 5 |

## Contracts (병렬 작업용 인터페이스 고정)

- 스토어(`AppState`): `replaceLastAssignment(mapping: Assignment): void`
  - `lastAssignment`가 없으면 아무것도 안 한다. 있으면 `lastAssignment = { ...prev, mapping }`(timestamp 유지). `assignmentHistory`는 그대로.
  - `layoutType === 'group'`이고 `groupHistory` 마지막 항목의 `timestamp === prev.timestamp`면 그 항목의 `groups`만 새 mapping으로 다시 계산해 교체. 아니면 `groupHistory` 그대로. Undo 대상 아님.
- `src/features/present/lastAssignment.ts`: `export interface LastAssignmentCheck { mapping: Assignment | null; stale: boolean }`, `export function loadableLastAssignment(data: ClassData): LastAssignmentCheck`
- `src/features/present/printFit.ts`: `export type PrintOrientation = 'landscape' | 'portrait'`, `export interface PrintFit { orientation: PrintOrientation; zoom: number }`, `export const PRINT_MARGIN_MM = 10`, `export const PRINT_TITLE_PX = 40`, `export function fitPrintPage(boardW: number, boardH: number): PrintFit`
- `useDrawSequence` 옵션 추가: `initialMapping?: Assignment | null`(첫 렌더에만 읽음, 있으면 `revealedSeats='all'`, `phase='idle'`, 위반 계산), `onSwapped?: (mapping: Assignment) => void`. `swap`은 `onAssigned`를 부르지 않는다.
- `NoteSeat`: prop `role?: string`, 이름 글자 span에 `data-seat-name`, 역할 span에 `data-seat-role`, `export function lgNameClass(name: string): string`
- `SeatBoard`: prop `showFixed?: boolean`(기본 `true`). U자 칸은 `<div data-grid-slot={index} data-grid-row={r} data-grid-col={c}>`(1부터). `size='lg'`면 모든 배치에서 이름표 칸 부모에 `w-[200px]`.
- 발표 화면 DOM: `data-present="board"`(기존), `data-present="controls"`(조작 막대 footer), `data-present="status"`(상태 칸, `data-tone="lottery"|"hint"`), `data-present="class"`(반 이름), 인쇄 제목 `p.present-print-title`, 인쇄 배치도 래퍼 `div.present-print-board`(style `zoom`). 기존 `data-present="swap-hint"`, `data-present="lottery-name"`은 없어진다.

---

### Task 1: 스토어 `replaceLastAssignment` (impl-s)

**Files:**
- Modify: `src/store/useAppStore.ts` (인터페이스 `AppState`, 모듈 상단 헬퍼, `recordAssignment` 근처 421-459행)
- Test: `src/store/useAppStore.test.ts` (기존 `describe('recordAssignment')` 다음에 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `replaceLastAssignment(mapping: Assignment): void` (Task 4가 발표 화면에서 호출)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/store/useAppStore.test.ts`의 `describe('recordAssignment', ...)` 블록 바로 뒤에 추가한다(`boot`, `dataKey`는 이미 import/정의돼 있다).

```ts
describe('replaceLastAssignment', () => {
  it('지난 배치의 좌석만 바꾸고 이력은 늘리지 않는다', () => {
    const { s } = boot();
    s().recordAssignment({ 0: 'A', 1: 'B' }, false);
    s().recordAssignment({ 0: 'B', 1: 'A' }, false);
    const before = s().data;
    s().replaceLastAssignment({ 0: 'A', 1: 'B' });
    expect(s().data.lastAssignment?.mapping).toEqual({ 0: 'A', 1: 'B' });
    expect(s().data.lastAssignment?.timestamp).toBe(before.lastAssignment?.timestamp);
    expect(s().data.assignmentHistory).toEqual(before.assignmentHistory);
  });

  it('지난 배치가 없으면 아무것도 하지 않는다', () => {
    const { s } = boot();
    const before = s().data;
    s().replaceLastAssignment({ 0: 'A' });
    expect(s().data).toBe(before);
  });

  it('모둠 배치면 이번 뽑기가 쌓은 모둠 기록만 바뀐 구성으로 고친다', () => {
    const { s } = boot();
    s().update({ layoutType: 'group', students: ['A', 'B', 'C', 'D'], classSize: 4 });
    s().updateLayoutSettings({ groupSizes: [2, 2] });
    s().recordAssignment({ 0: 'A', 1: 'B', 2: 'C', 3: 'D' }, false);
    s().replaceLastAssignment({ 0: 'A', 1: 'C', 2: 'B', 3: 'D' });
    expect(s().data.groupHistory).toHaveLength(1);
    expect(s().data.groupHistory[0]?.groups).toEqual([
      ['A', 'C'],
      ['B', 'D'],
    ]);
  });

  it('모둠 기록의 마지막 항목이 이번 뽑기 것이 아니면 모둠 기록을 건드리지 않는다', () => {
    const { s } = boot();
    s().update({ layoutType: 'group', students: ['A', 'B'], classSize: 2 });
    s().updateLayoutSettings({ groupSizes: [2] });
    s().update({
      lastAssignment: { mapping: { 0: 'A', 1: 'B' }, timestamp: 1 },
      groupHistory: [{ groups: [['A', 'B']], timestamp: 999 }],
    });
    s().replaceLastAssignment({ 0: 'B', 1: 'A' });
    expect(s().data.groupHistory).toEqual([{ groups: [['A', 'B']], timestamp: 999 }]);
    expect(s().data.lastAssignment?.mapping).toEqual({ 0: 'B', 1: 'A' });
  });

  it('바꾼 배치가 저장소에 저장된다', () => {
    const { adapter, s } = boot();
    s().recordAssignment({ 0: 'A', 1: 'B' }, false);
    s().replaceLastAssignment({ 0: 'B', 1: 'A' });
    const saved = JSON.parse(adapter.get(dataKey('1반'))!);
    expect(saved.lastAssignment.mapping).toEqual({ 0: 'B', 1: 'A' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/store/useAppStore.test.ts`
Expected: FAIL (`s(...).replaceLastAssignment is not a function` 또는 타입 오류)

- [ ] **Step 3: 구현**

(a) `AppState` 인터페이스에서 `recordAssignment(...)` 선언 바로 아래에 추가:

```ts
  /**
   * 발표 화면의 자리 교환 결과를 저장한다. 지난 배치(lastAssignment)의 좌석만 바꾸고
   * 이력(assignmentHistory)은 늘리지 않는다. 모둠 배치면 이번 뽑기가 쌓은 모둠 기록
   * (timestamp가 같은 마지막 항목)을 바뀐 구성으로 고친다. 지난 배치가 없으면 무시한다.
   */
  replaceLastAssignment(mapping: Assignment): void;
```

(b) 모듈 상단(`NOTICE` 상수 아래 등 컴포넌트 밖)에 헬퍼를 둔다:

```ts
/** 모둠별 학생 이름. 좌석 번호를 모둠 크기대로 잘라 묶는다(아무도 없는 모둠은 뺀다). */
function groupsOf(mapping: Assignment, d: ClassData): string[][] {
  const sizes = groupLayout.getGroupSizes(d.layoutSettings);
  const groups: string[][] = [];
  let cursor = 0;
  for (const sz of sizes) {
    const members: string[] = [];
    for (let seat = cursor; seat < cursor + sz; seat++) {
      const name = mapping[seat];
      if (name) members.push(name);
    }
    if (members.length > 0) groups.push(members);
    cursor += sz;
  }
  return groups;
}
```

(c) `recordAssignment` 안의 모둠 묶기 반복문(`const sizes = ...`부터 `const gh = ...` 직전까지)을 헬퍼로 바꾼다:

```ts
        if (d.layoutType === 'group') {
          const gh = [...d.groupHistory, { groups: groupsOf(mapping, d), timestamp: now, date: todayFrom(now) }];
          while (gh.length > LIMITS.MAX_HISTORY) gh.shift();
          next.groupHistory = gh;
        }
```

(d) `recordAssignment` 구현 바로 뒤에 추가:

```ts
      replaceLastAssignment: (mapping) => {
        const d = get().data;
        const prev = d.lastAssignment;
        if (!prev) return;
        const next: ClassData = { ...d, lastAssignment: { ...prev, mapping } };
        const lastGroup = d.groupHistory[d.groupHistory.length - 1];
        // recordAssignment는 lastAssignment와 모둠 기록에 같은 timestamp를 쓴다.
        // 같을 때만 "이번 뽑기의 모둠 기록"이므로 그때만 고친다.
        if (d.layoutType === 'group' && lastGroup && lastGroup.timestamp === prev.timestamp) {
          next.groupHistory = [...d.groupHistory.slice(0, -1), { ...lastGroup, groups: groupsOf(mapping, d) }];
        }
        // 배치 결과는 Undo 대상이 아니다(recordAssignment와 같다).
        setUntracked(next);
      },
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/store/useAppStore.test.ts`
Expected: PASS (기존 `recordAssignment` 테스트 포함 전부)

- [ ] **Step 5: 게이트 + 커밋**

Run: `npm run gate` → 전부 PASS (Global Constraints의 병렬 규칙 참고)

```bash
git add src/store/useAppStore.ts src/store/useAppStore.test.ts
git commit -m "feat(store): 자리 교환은 이력을 늘리지 않고 지난 배치만 고친다 (replaceLastAssignment)"
```

---

### Task 2: 발표 로직 — 지난 배치 검사·인쇄 맞춤·useDrawSequence (impl-m)

**Files:**
- Create: `src/features/present/lastAssignment.ts`, `src/features/present/lastAssignment.test.ts`
- Create: `src/features/present/printFit.ts`, `src/features/present/printFit.test.ts`
- Modify: `src/features/present/useDrawSequence.ts`, `src/features/present/useDrawSequence.test.ts`

**Interfaces:**
- Consumes: `getLayout`(`@/core/layouts`), `verifyAssignment`(`@/core/randomizer`)
- Produces: Contracts의 `loadableLastAssignment`, `fitPrintPage`/`PRINT_MARGIN_MM`/`PRINT_TITLE_PX`/`PrintFit`, `useDrawSequence`의 `initialMapping`·`onSwapped`

- [ ] **Step 1: `lastAssignment` 실패 테스트** — `src/features/present/lastAssignment.test.ts`

```ts
import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { loadableLastAssignment } from './lastAssignment';

function makeData(patch: Partial<ClassData> = {}): ClassData {
  const base = createDefaultData();
  return {
    ...base,
    students: ['가람', '나래', '다솜'],
    classSize: 3,
    lastAssignment: { mapping: { 0: '가람', 1: '나래', 2: '다솜' }, timestamp: 1 },
    ...patch,
    layoutSettings: { ...base.layoutSettings, columns: 2, rows: 2, ...(patch.layoutSettings ?? {}) },
  };
}

describe('loadableLastAssignment', () => {
  it('지난 배치가 없으면 조용히 null', () => {
    expect(loadableLastAssignment(makeData({ lastAssignment: null }))).toEqual({ mapping: null, stale: false });
  });

  it('비어 있는 지난 배치도 조용히 null', () => {
    expect(loadableLastAssignment(makeData({ lastAssignment: { mapping: {}, timestamp: 1 } }))).toEqual({
      mapping: null,
      stale: false,
    });
  });

  it('명단과 배치가 그대로면 지난 배치를 돌려준다', () => {
    const data = makeData();
    expect(loadableLastAssignment(data)).toEqual({ mapping: data.lastAssignment!.mapping, stale: false });
  });

  it('학생이 추가되면 쓰지 않는다', () => {
    const data = makeData({ students: ['가람', '나래', '다솜', '라온'], classSize: 4 });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('학생이 빠지면 쓰지 않는다', () => {
    const data = makeData({ students: ['가람', '나래'], classSize: 2 });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('좌석이 줄어 없는 자리에 앉은 학생이 있으면 쓰지 않는다', () => {
    const data = makeData({ layoutSettings: { columns: 1, rows: 2 } as never });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('빈 자리로 둔 좌석에 앉은 학생이 있으면 쓰지 않는다', () => {
    const data = makeData({ layoutSettings: { disabledSeats: [1] } as never });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('같은 이름이 두 자리에 있으면 쓰지 않는다', () => {
    const data = makeData({ lastAssignment: { mapping: { 0: '가람', 1: '가람', 2: '다솜' }, timestamp: 1 } });
    expect(loadableLastAssignment(data).stale).toBe(true);
  });
});
```

- [ ] **Step 2: `printFit` 실패 테스트** — `src/features/present/printFit.test.ts`

```ts
import { fitPrintPage, PRINT_MARGIN_MM, PRINT_TITLE_PX } from './printFit';

const PX_PER_MM = 96 / 25.4;
const SHORT = (210 - PRINT_MARGIN_MM * 2) * PX_PER_MM;
const LONG = (297 - PRINT_MARGIN_MM * 2) * PX_PER_MM;

describe('fitPrintPage', () => {
  it('가로로 긴 배치도는 가로 용지를 고르고 폭에 맞춰 줄인다', () => {
    const fit = fitPrintPage(1280, 540);
    expect(fit.orientation).toBe('landscape');
    expect(fit.zoom).toBeCloseTo(0.785, 2);
  });

  it('세로로 긴 배치도는 세로 용지를 고른다', () => {
    const fit = fitPrintPage(400, 900);
    expect(fit.orientation).toBe('portrait');
    expect(fit.zoom).toBeCloseTo(1.074, 2);
  });

  it('작은 배치도는 2배까지만 키운다', () => {
    expect(fitPrintPage(200, 100)).toEqual({ orientation: 'landscape', zoom: 2 });
  });

  it('크기를 모르면(0) 가로 용지·원래 크기', () => {
    expect(fitPrintPage(0, 0)).toEqual({ orientation: 'landscape', zoom: 1 });
  });

  it.each([
    [1280, 540],
    [1700, 700],
    [400, 900],
    [900, 900],
    [3000, 400],
  ])('%i x %i 는 고른 용지 한 장에 들어간다', (w, h) => {
    const { orientation, zoom } = fitPrintPage(w, h);
    const [pageW, pageH] = orientation === 'landscape' ? [LONG, SHORT] : [SHORT, LONG];
    expect(w * zoom).toBeLessThanOrEqual(pageW);
    expect(h * zoom + PRINT_TITLE_PX).toBeLessThanOrEqual(pageH);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/features/present/lastAssignment.test.ts src/features/present/printFit.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현** — `src/features/present/lastAssignment.ts`

```ts
// 발표 화면을 열 때 지난 배치를 그대로 보여 줘도 되는지 가린다(개선 스펙 3-4).
// 뽑은 뒤 명단이나 배치가 바뀌었으면 자리 번호가 어긋난 배치를 보여 주게 되므로 쓰지 않는다.
import { getLayout } from '@/core/layouts';
import type { Assignment, ClassData } from '@/core/model/types';

export interface LastAssignmentCheck {
  /** 보여 줘도 되는 지난 배치. 없거나 쓸 수 없으면 null. */
  mapping: Assignment | null;
  /** 지난 배치는 있었지만 명단·배치가 바뀌어 쓰지 못했다(안내 토스트용). */
  stale: boolean;
}

const NONE: LastAssignmentCheck = { mapping: null, stale: false };
const STALE: LastAssignmentCheck = { mapping: null, stale: true };

export function loadableLastAssignment(data: ClassData): LastAssignmentCheck {
  const mapping = data.lastAssignment?.mapping;
  if (!mapping) return NONE;
  const entries = Object.entries(mapping);
  if (entries.length === 0) return NONE;

  const seats = new Set(getLayout(data.layoutType).getSeatPositions(data.layoutSettings).map((p) => p.index));
  const disabled = new Set(data.layoutSettings.disabledSeats ?? []);
  const names = new Set<string>();
  for (const [key, name] of entries) {
    const seat = Number(key);
    if (!Number.isInteger(seat) || !seats.has(seat) || disabled.has(seat)) return STALE;
    if (names.has(name)) return STALE;
    names.add(name);
  }

  const roster = new Set(data.students);
  if (roster.size !== names.size) return STALE;
  for (const name of names) if (!roster.has(name)) return STALE;
  return { mapping, stale: false };
}
```

`src/features/present/printFit.ts`

```ts
// 인쇄 용지 방향과 배율(개선 스펙 3-3). A4 인쇄 영역을 CSS px(96dpi)로 환산해
// 배치도가 더 크게 들어가는 방향을 고르고, 그 방향에서 한 장에 꽉 차는 배율을 돌려준다.
export type PrintOrientation = 'landscape' | 'portrait';

export interface PrintFit {
  orientation: PrintOrientation;
  zoom: number;
}

/** 용지 여백(mm). PresentPage의 @page 규칙과 같은 값을 쓴다. */
export const PRINT_MARGIN_MM = 10;
/** 인쇄 페이지 제목 줄("[ 6-5 · 학생 시선 ]")과 아래 간격이 차지하는 높이(px). present.css와 같다. */
export const PRINT_TITLE_PX = 40;

const PX_PER_MM = 96 / 25.4;
const SHORT = (210 - PRINT_MARGIN_MM * 2) * PX_PER_MM; // 약 718px
const LONG = (297 - PRINT_MARGIN_MM * 2) * PX_PER_MM; // 약 1047px
/** 아주 작은 반이 종이에서 지나치게 커지지 않게 묶는 위쪽 한계. */
const MAX_ZOOM = 2;
/** 브라우저마다 다른 글꼴·반올림 차이로 한 장을 넘기지 않게 남기는 여유. */
const SAFETY = 0.96;

export function fitPrintPage(boardW: number, boardH: number): PrintFit {
  if (!(boardW > 0) || !(boardH > 0)) return { orientation: 'landscape', zoom: 1 };
  const landscape = Math.min(LONG / boardW, (SHORT - PRINT_TITLE_PX) / boardH);
  const portrait = Math.min(SHORT / boardW, (LONG - PRINT_TITLE_PX) / boardH);
  const orientation: PrintOrientation = landscape >= portrait ? 'landscape' : 'portrait';
  const best = orientation === 'landscape' ? landscape : portrait;
  const zoom = Math.min(MAX_ZOOM, best * SAFETY);
  return { orientation, zoom: Math.round(zoom * 1000) / 1000 };
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/features/present/lastAssignment.test.ts src/features/present/printFit.test.ts`
Expected: PASS

- [ ] **Step 6: `useDrawSequence` 실패 테스트** — `src/features/present/useDrawSequence.test.ts`에서 기존 `it('swap은 두 좌석의 학생을 맞바꾸고 저장을 요청한다', ...)`를 **통째로 아래 첫 테스트로 교체**하고, 나머지 두 테스트를 그 뒤에 추가한다.

```ts
  it('swap은 두 좌석의 학생을 맞바꾸고 onSwapped로 저장을 요청한다(이력을 쌓는 onAssigned는 부르지 않는다)', async () => {
    const onAssigned = vi.fn();
    const onSwapped = vi.fn();
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData(),
        onAssigned,
        onSwapped,
        delay: async () => {},
        reducedMotion: true,
        randomize: async () => okResult(),
        playSound: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    onAssigned.mockClear();
    act(() => {
      result.current.swap(0, 5);
    });

    expect(result.current.mapping?.[0]).toBe('바다');
    expect(result.current.mapping?.[5]).toBe('가람');
    expect(onAssigned).not.toHaveBeenCalled();
    expect(onSwapped).toHaveBeenCalledTimes(1);
    expect(onSwapped).toHaveBeenCalledWith({ ...FULL, 0: '바다', 5: '가람' });
  });

  it('initialMapping이 있으면 전부 공개된 상태로 시작하고 바로 교환할 수 있다', () => {
    const onAssigned = vi.fn();
    const onSwapped = vi.fn();
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData(),
        onAssigned,
        onSwapped,
        initialMapping: FULL,
        reducedMotion: true,
        playSound: vi.fn(),
      }),
    );

    expect(result.current.mapping).toEqual(FULL);
    expect(result.current.revealedSeats).toBe('all');
    expect(result.current.phase).toBe('idle');
    expect(result.current.drawId).toBe(0);

    act(() => {
      result.current.swap(1, 2);
    });
    expect(result.current.mapping?.[1]).toBe('다솜');
    expect(result.current.mapping?.[2]).toBe('나래');
    expect(onSwapped).toHaveBeenCalledTimes(1);
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it('initialMapping의 규칙 위반을 현재 규칙으로 계산하고, 교환 뒤 다시 계산한다', () => {
    const data = makeData({ fixedSeats: [{ studentName: '가람', seatIndex: 5 }] });
    const { result } = renderHook(() =>
      useDrawSequence({
        data,
        onAssigned: vi.fn(),
        onSwapped: vi.fn(),
        initialMapping: FULL,
        reducedMotion: true,
        playSound: vi.fn(),
      }),
    );

    expect(result.current.violations.map((v) => v.kind)).toContain('fixed');
    act(() => {
      result.current.swap(0, 5);
    });
    expect(result.current.violations).toEqual([]);
  });
```

- [ ] **Step 7: 실패 확인**

Run: `npx vitest run src/features/present/useDrawSequence.test.ts`
Expected: FAIL (`onSwapped` 미호출, `initialMapping` 무시)

- [ ] **Step 8: 구현** — `src/features/present/useDrawSequence.ts`

(a) `DrawSequenceOptions`에 추가(`onAssigned` 아래):

```ts
  /** 자리 교환 결과 저장(스토어의 replaceLastAssignment). 이력은 늘리지 않는다. */
  onSwapped?: (mapping: Assignment) => void;
  /**
   * 발표 화면을 열 때 보여 줄 지난 배치(loadableLastAssignment를 통과한 것).
   * 첫 렌더에만 읽는다. 있으면 전부 공개된 상태로 시작하고, 규칙 위반을 현재 규칙으로 계산한다.
   */
  initialMapping?: Assignment | null;
```

(b) 함수 인자 구조 분해에 `onSwapped`, `initialMapping = null`을 추가하고, 상태 초기값을 바꾼다:

```ts
  const [mapping, setMappingState] = useState<Assignment | null>(initialMapping);
  const [revealed, setRevealedState] = useState<'all' | number[]>(initialMapping ? 'all' : []);
  const [violations, setViolations] = useState<Violation[]>(() =>
    initialMapping ? verifyAssignment(initialMapping, data) : [],
  );
```

```ts
  const mappingRef = useRef<Assignment | null>(initialMapping);
  const revealedRef = useRef<'all' | number[]>(initialMapping ? 'all' : []);
```

(c) `swap`을 바꾼다(문서 주석은 유지하고 끝에 한 줄 추가: "저장은 onSwapped로, 이력은 늘리지 않는다."):

```ts
  const swap = useCallback(
    (seatA: number, seatB: number) => {
      const current = mappingRef.current;
      if (!current || seatA === seatB) return;
      const next: Assignment = { ...current };
      const nameA = current[seatA];
      const nameB = current[seatB];
      if (nameA) next[seatB] = nameA;
      else delete next[seatB];
      if (nameB) next[seatA] = nameB;
      else delete next[seatA];
      setMapping(next);
      // 뽑기 직후의 위반 목록이 교환 뒤에도 남으면 틀린 안내가 된다.
      setViolations(verifyAssignment(next, data));
      onSwapped?.(next);
    },
    [data, onSwapped, setMapping],
  );
```

- [ ] **Step 9: 통과 확인**

Run: `npx vitest run src/features/present/useDrawSequence.test.ts`
Expected: PASS (기존 테스트 포함)

- [ ] **Step 10: 게이트 + 커밋**

Run: `npm run gate` → PASS

```bash
git add src/features/present/lastAssignment.ts src/features/present/lastAssignment.test.ts src/features/present/printFit.ts src/features/present/printFit.test.ts src/features/present/useDrawSequence.ts src/features/present/useDrawSequence.test.ts
git commit -m "feat(present): 지난 배치 검사·인쇄 맞춤 계산, 교환은 onSwapped로 저장하고 위반을 다시 계산"
```

---

### Task 3: 이름표·배치도 — lg 가로형, U자 격자, 고정 표시 끄기 (impl-l)

**Files:**
- Modify: `src/components/cork/NoteSeat.tsx` (전체 교체), `src/components/cork/NoteSeat.test.tsx`
- Modify: `src/features/layout/SeatBoard.tsx` (전체 교체), `src/features/layout/SeatBoard.test.tsx`
- Modify: `src/pages/DevCorkPage.tsx:90-96`, `e2e/dev-cork.spec.ts:34` (주석만)

**Interfaces:**
- Consumes: 없음(코어 좌표만)
- Produces: `NoteSeat`의 `role`·`data-seat-name`·`data-seat-role`·`lgNameClass`, `SeatBoard`의 `showFixed`·U자 `data-grid-slot/row/col`·lg `w-[200px]` (Task 4·5가 사용)

- [ ] **Step 1: NoteSeat 실패 테스트** — `src/components/cork/NoteSeat.test.tsx`에서 기존 `it('발표 크기는 28px 이상', ...)`을 지우고 아래를 `describe` 안에 추가한다. import에 `lgNameClass`를 추가한다(`import { NoteSeat, lgNameClass } from './NoteSeat';`).

```ts
  it('lg 이름은 4글자까지 48px이고 길면 단계적으로 줄인다', () => {
    expect(lgNameClass('김')).toBe('text-[48px]');
    expect(lgNameClass('김하람')).toBe('text-[48px]');
    expect(lgNameClass('남궁민수')).toBe('text-[48px]');
    expect(lgNameClass('황보아리랑')).toBe('text-[38px]');
    expect(lgNameClass('가나다라마바')).toBe('text-[32px]');
    expect(lgNameClass('가나다라마바사아')).toBe('text-[24px]');
    expect(lgNameClass('가나다라마바사아자')).toBe('text-[20px]');
  });

  it('lg 이름표는 이름에 크기 클래스를 붙이고 한 줄로 자르며, 번호는 왼쪽 위에 둔다', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" size="lg" />);
    const b = screen.getByRole('button');
    expect(b).toHaveAttribute('data-size', 'lg');
    expect(b.className).toContain('h-[100px]');
    const name = b.querySelector('[data-seat-name]')!;
    expect(name.textContent).toBe('김하람');
    expect(name.className).toContain('text-[48px]');
    expect(name.className).toContain('truncate');
    const num = screen.getByText('1');
    expect(num.className).toContain('absolute');
    expect(num.className).toContain('text-ink');
  });

  it('이름 글자에만 data-seat-name을 단다(빈 자리·빈 자리로 둠에는 없다)', () => {
    const { unmount } = render(<NoteSeat index={0} state="empty" size="lg" />);
    expect(document.querySelector('[data-seat-name]')).toBeNull();
    unmount();
    render(<NoteSeat index={0} state="disabled" size="lg" />);
    expect(document.querySelector('[data-seat-name]')).toBeNull();
  });

  it('역할은 이름표 안 아랫줄에 쓴다', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" size="lg" role="모둠장" />);
    const b = screen.getByRole('button');
    const role = b.querySelector('[data-seat-role]')!;
    expect(role.textContent).toBe('모둠장');
    expect(role.className).toContain('text-ink');
  });

  it('빈 자리에는 역할을 쓰지 않는다', () => {
    render(<NoteSeat index={0} state="empty" size="lg" role="모둠장" />);
    expect(screen.queryByText('모둠장')).toBeNull();
  });
```

- [ ] **Step 2: SeatBoard 실패 테스트** — `src/features/layout/SeatBoard.test.tsx`

(a) `it('ushape: columns + rows*2 만큼 절대 배치로 렌더한다', ...)`를 아래로 **교체**:

```ts
  it('ushape: columns + rows*2 만큼 row/col 격자 칸에 놓는다', () => {
    const { container } = render(
      <SeatBoard data={makeData({ layoutType: 'ushape', layoutSettings: { columns: 4, rows: 2 } as never })} />,
    );
    expect(seatNodes(container)).toHaveLength(8);
    const cell = (i: number) => container.querySelector<HTMLElement>(`[data-grid-slot="${i}"]`)!;
    // 윗줄(칠판 쪽) 0~3번은 1행, 왼쪽 줄 4·5번은 1열, 오른쪽 줄 6·7번은 4열
    expect([cell(0).dataset.gridRow, cell(0).dataset.gridCol]).toEqual(['1', '1']);
    expect([cell(3).dataset.gridRow, cell(3).dataset.gridCol]).toEqual(['1', '4']);
    expect([cell(4).dataset.gridRow, cell(4).dataset.gridCol]).toEqual(['2', '1']);
    expect([cell(7).dataset.gridRow, cell(7).dataset.gridCol]).toEqual(['3', '4']);
    expect(container.querySelector('[data-abs-slot]')).toBeNull();
  });

  it('ushape: 왼쪽·오른쪽 줄이 같은 열이 되는 1열 설정도 칸이 겹치지 않는다', () => {
    const { container } = render(
      <SeatBoard data={makeData({ layoutType: 'ushape', layoutSettings: { columns: 1, rows: 2 } as never })} />,
    );
    const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-grid-slot]')).map(
      (c) => `${c.dataset.gridRow}:${c.dataset.gridCol}`,
    );
    expect(cells).toHaveLength(5);
    expect(new Set(cells).size).toBe(5);
  });
```

(b) `describe('SeatBoard 시선(perspective)')` 안의 `it('교사 시선의 절대 배치는 좌표가 180도 뒤집힌다', ...)`를 아래 두 개로 **교체**:

```ts
  it('교사 시선의 U자는 행·열이 모두 뒤집힌다', () => {
    const u = makeData({ layoutType: 'ushape', layoutSettings: { columns: 3, rows: 1 } as never });
    const student = render(<SeatBoard data={u} />).container.querySelector<HTMLElement>('[data-grid-slot="0"]')!;
    const teacher = render(<SeatBoard data={u} perspective="teacher" />).container.querySelector<HTMLElement>(
      '[data-grid-slot="0"]',
    )!;
    expect([student.dataset.gridRow, student.dataset.gridCol]).toEqual(['1', '1']);
    // 3열 x 2행(윗줄 + 옆줄 1개) 격자에서 좌상단 칸은 우하단 칸이 된다
    expect([teacher.dataset.gridRow, teacher.dataset.gridCol]).toEqual(['2', '3']);
  });

  it('교사 시선의 자유배치는 좌표가 캔버스 안에서 180도 뒤집힌다', () => {
    const data = makeData({
      layoutType: 'custom',
      layoutSettings: { customDesks: [{ x: 0, y: 0 }, { x: 100, y: 80 }] } as never,
    });
    const s = render(<SeatBoard data={data} />).container;
    const t = render(<SeatBoard data={data} perspective="teacher" />).container;
    const canvas = s.querySelector<HTMLElement>('[data-arrangement="custom"]')!;
    const w = Number.parseFloat(canvas.style.width);
    const h = Number.parseFloat(canvas.style.height);
    const at = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-abs-slot="0"]')!.style;
    expect(Number.parseFloat(at(s).left) + Number.parseFloat(at(t).left)).toBeCloseTo(w, 3);
    expect(Number.parseFloat(at(s).top) + Number.parseFloat(at(t).top)).toBeCloseTo(h, 3);
  });
```

(c) `describe('SeatBoard 공개(revealedSeats)')` 안에 추가:

```ts
  it('역할은 이름표 안에 쓴다', () => {
    const { container } = render(<SeatBoard data={data} mapping={mapping} roles={{ 0: '모둠장' }} size="lg" />);
    expect(container.querySelector('[data-seat="0"]')).toHaveTextContent('모둠장');
  });
```

(d) `describe('SeatBoard 고정 좌석')` 안에 추가:

```ts
  it('showFixed=false면 고정 좌석도 일반 좌석처럼 그린다', () => {
    const { container } = render(
      <SeatBoard data={data} mapping={{ 0: '김하람', 1: '이도윤' }} showFixed={false} />,
    );
    const seat = container.querySelector('[data-seat="0"]')!;
    expect(seat).toHaveAttribute('data-state', 'assigned');
    expect(seat.querySelector('[data-cork="pushpin"]')).toBeNull();
    expect(seat).toHaveAttribute('aria-label', '1번 자리: 김하람');
  });

  it('showFixed=false면 뽑기 전 빈 화면에서도 고정 자리를 드러내지 않는다', () => {
    const { container } = render(<SeatBoard data={data} showFixed={false} />);
    expect(container.querySelector('[data-seat="0"]')).toHaveAttribute('data-state', 'empty');
    expect(container.querySelector('[data-cork="pushpin"]')).toBeNull();
  });
```

(e) `describe('SeatBoard 상호작용과 크기')` 안에 추가:

```ts
  it('size=lg는 시험대형에서도 모든 이름표 칸을 200px로 고정한다', () => {
    const { container } = render(
      <SeatBoard
        data={makeData({ layoutType: 'exam', layoutSettings: { columns: 3, rows: 1 } as never })}
        size="lg"
        mapping={{ 0: '가', 1: '가나다라마바' }}
      />,
    );
    const seats = seatNodes(container);
    expect(seats).toHaveLength(3);
    for (const seat of seats) expect(seat.parentElement!.className).toContain('w-[200px]');
  });
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/components/cork/NoteSeat.test.tsx src/features/layout/SeatBoard.test.tsx`
Expected: FAIL

- [ ] **Step 4: NoteSeat 구현** — `src/components/cork/NoteSeat.tsx` 전체를 아래로 교체한다(기존 R-주석은 그대로 살렸다).

```tsx
import { Tape } from './Tape';
import { PushPin } from './PushPin';

export type NoteSeatState = 'empty' | 'assigned' | 'fixed' | 'disabled';

const VARIANT = ['bg-paper tilt-note-a', 'bg-paper-2 tilt-note-b', 'bg-paper-3 tilt-note-c'] as const;
// lg는 발표·인쇄용 가로형 이름표다(개선 스펙 3-1). 폭은 부모 슬롯(SeatBoard의 200px)이 정한다.
// 번호를 왼쪽 위 모서리로 빼고(pt-3로 이름을 살짝 내림) 이름 글자를 키운다.
const SIZE = { sm: 'h-14 text-[14px]', lg: 'h-[100px] px-3 pt-3 text-[26px]' } as const;
const NUMBER = {
  sm: 'font-body text-[10px] font-normal text-ink',
  lg: 'absolute left-2 top-1 font-body text-[14px] font-normal leading-none text-ink',
} as const;
const ROLE_TEXT = { sm: 'text-[11px]', lg: 'text-[18px]' } as const;

/**
 * lg 이름 글자 크기. 글자 수(공백 포함)가 늘면 200px 이름표 안에 한 줄로 들어가도록 줄인다
 * (Gaegu 한글 한 글자 폭은 글자 크기의 약 0.8~0.85배).
 * Tailwind 임의값 클래스는 문자열 보간으로 만들 수 없어 단계별 리터럴로 둔다.
 */
const LG_NAME_STEPS = [
  { maxChars: 4, cls: 'text-[48px]' },
  { maxChars: 5, cls: 'text-[38px]' },
  { maxChars: 6, cls: 'text-[32px]' },
  { maxChars: 8, cls: 'text-[24px]' },
] as const;
const LG_NAME_MIN = 'text-[20px]';

export function lgNameClass(name: string): string {
  const chars = [...name].length;
  return LG_NAME_STEPS.find((step) => chars <= step.maxChars)?.cls ?? LG_NAME_MIN;
}

type Props = {
  index: number;
  name?: string;
  state: NoteSeatState;
  size?: keyof typeof SIZE;
  variant?: 0 | 1 | 2;
  /** 모둠 역할. 이름표 안 아랫줄에 작게 쓴다(밖에 두면 아래 줄 이름표에 가려진다). */
  role?: string;
  onClick?: () => void;
  onRestore?: () => void;
  highlight?: boolean;
};

export function seatLabel(index: number, state: NoteSeatState, name?: string, canRestore = true): string {
  const n = index + 1;
  // R38: onRestore가 없으면 되살릴 수 없는데 "다시 쓰기"라고 약속하는 문구를 쓰지 않는다.
  if (state === 'disabled') return canRestore ? `${n}번 자리 다시 쓰기` : `${n}번 자리 (빈 자리로 둠)`;
  if (state === 'empty' || !name) return `${n}번 자리 (빈 자리)`;
  return `${n}번 자리: ${name}${state === 'fixed' ? ' (고정)' : ''}`;
}

export function NoteSeat({
  index,
  name,
  state,
  size = 'sm',
  variant = 0,
  role,
  onClick,
  onRestore,
  highlight = false,
}: Props) {
  // R35: 이 상태가 "빈 자리로 둬서 다시 써야 하는 좌석"임을 나타낸다. 네이티브
  // disabled 속성(R32)과 이름이 겹치지 않도록 isRemoved로 부른다.
  const isRemoved = state === 'disabled';
  // R37: state가 empty면 name이 있어도 빈 자리로 표시해 라벨과 화면 내용을 일치시킨다.
  const showEmpty = state === 'empty' || !name;
  // R32: 클릭해도 아무 동작이 없는 좌석(핸들러 미전달)은 네이티브 disabled로
  // 탭 순서에서 제외한다. 시각적 dimming은 추가하지 않는다(disabled:opacity 금지).
  const handler = isRemoved ? onRestore : onClick;
  const base = 'relative flex w-full flex-col items-center justify-center rounded-note font-hand font-bold leading-tight';
  // R20: cork(배경) 위에서는 paper 텍스트가 2.57:1로 대비 미달이라 금지된다.
  // disabled 상태는 불투명한 paper 메모지 + 점선 cork-dark 테두리 + ink 텍스트로 표현한다.
  const look = isRemoved
    ? 'border-2 border-dashed border-cork-dark bg-paper text-ink'
    : `${VARIANT[variant]} text-ink shadow-note`;
  // R33: gold 링은 cork(1.34:1)·paper(1.9:1) 모두 대비 미달이라 ink로 교체한다.
  const ring = highlight ? 'ring-4 ring-ink' : '';
  // 누를 수 있는 좌석은 그렇게 보여야 한다(예전에는 커서도 안 바뀌어 아무도 누를
  // 생각을 못 했다). 색이 아니라 커서와 테두리로만 알린다.
  const interactive = handler
    ? 'cursor-pointer hover:ring-2 hover:ring-ink focus-visible:ring-2 focus-visible:ring-ink'
    : '';
  // lg 이름은 한 줄 유지(truncate). 단계별 글자 크기로 대부분 잘리지 않고, 아주 긴 이름만 말줄임된다.
  const nameClass = size === 'lg' ? `block max-w-full truncate ${lgNameClass(name ?? '')}` : undefined;
  return (
    <button
      type="button"
      data-cork="note-seat"
      data-seat={index}
      data-state={state}
      data-size={size}
      data-highlight={highlight ? 'true' : undefined}
      aria-label={seatLabel(index, state, name, Boolean(onRestore))}
      onClick={handler}
      disabled={!handler}
      className={`${base} ${look} ${ring} ${interactive} ${SIZE[size]}`}
    >
      {!isRemoved && <Tape />}
      {state === 'fixed' && <PushPin color="gold" />}
      {/* 좌석 번호: mute는 paper-2·paper-3 배경에서 4.5:1 미달(각 4.25/4.46)이라
          ink를 사용한다 (src/styles/contrast.test.ts 참고). */}
      <span className={NUMBER[size]}>{index + 1}</span>
      {isRemoved ? (
        // R38: onRestore가 없으면 되살릴 수 없으므로 "다시 쓰기"를 약속하는 문구를 쓰지 않는다.
        <span>{onRestore ? '다시 쓰기' : '빈 자리로 둠'}</span>
      ) : showEmpty ? (
        // R30: opacity 합성(~3.0:1)이 아니라 ink 색 + normal weight로 "비어있음"을 표현한다.
        <span className="text-ink font-normal">빈 자리</span>
      ) : (
        <span data-seat-name className={nameClass}>
          {name}
        </span>
      )}
      {role && !isRemoved && !showEmpty ? (
        <span data-seat-role className={`mt-1 font-body font-bold leading-none text-ink ${ROLE_TEXT[size]}`}>
          {role}
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 5: SeatBoard 구현** — `src/features/layout/SeatBoard.tsx` 전체를 아래로 교체한다.

```tsx
// 배치도 렌더러 (계약서 3-2). 교사 화면 미리보기와 발표 화면이 공유하는 유일한 배치도.
// 좌표는 반드시 getLayout(...).getSeatPositions(...)에서만 얻는다(직접 계산 금지).
// 좌석 순서 규칙은 legacy/js/layouts/*.js의 render()를 따른다:
//   exam    : teacherView -> 행 역순, 열 역순 (exam-layout.js:31-34)
//   pair    : teacherView -> 행 역순, 짝 그룹 역순, 짝 내부 역순 (pair-layout.js:44-52)
//   group   : 모둠 블록 위치(layoutSettings.groupPositions)를 코어가 px/py에 반영해 주므로
//             custom과 같은 절대 배치로 그린다. teacherView -> 좌표 180도 반전
//             (레거시 group-layout.js:229-232의 역순 렌더와 같은 효과).
//   custom  : teacherView -> 좌표 180도 반전 (custom-layout.js:285-289)
//   ushape  : 코어의 row/col(윗줄 row 0 = 칠판 쪽, 왼쪽 줄 col 0, 오른쪽 줄 col columns-1)을
//             격자 칸에 그대로 놓는다(레거시의 줄 단위 렌더와 같은 모양). teacherView -> 행·열 역순.
//             예전의 반원 백분율 배치는 폭을 정하지 않는 부모 안에서 폭이 0으로 무너져
//             자리가 한 곳에 겹쳤다(개선 스펙 2026-09-28 1절).
import { ChalkBoard } from '@/components/cork/ChalkBoard';
import { NoteSeat, type NoteSeatState } from '@/components/cork/NoteSeat';
import { getLayout } from '@/core/layouts';
import type { SeatPosition } from '@/core/layouts/types';
import type { Assignment, ClassData } from '@/core/model/types';

export interface SeatBoardProps {
  data: ClassData;
  mapping?: Assignment;
  size?: 'sm' | 'lg';
  perspective?: 'student' | 'teacher';
  highlightSeats?: number[];
  fixedMode?: boolean;
  /** false면 고정 자리도 일반 자리처럼 그린다(압정·"(고정)" 없음). 학생이 보는 발표 화면·인쇄용. */
  showFixed?: boolean;
  editable?: boolean;
  onSeatClick?: (seatIndex: number) => void;
  onSeatRestore?: (seatIndex: number) => void;
  groupNames?: Record<number, string>;
  roles?: Record<number, string>;
  revealedSeats?: 'all' | number[];
  flipping?: boolean;
  className?: string;
}

type Size = 'sm' | 'lg';

// NoteSeat의 SIZE와 같은 높이를 써서 빈 공간이 격자 흐름을 그대로 유지하게 한다.
const SLOT_H: Record<Size, string> = { sm: 'h-14', lg: 'h-[100px]' };
// lg(발표·인쇄)는 모든 배치에서 같은 가로형 폭을 쓴다(개선 스펙 3-1).
// sm의 격자 흐름(시험대형·짝꿍·U자)은 폭을 정하지 않아 이름 길이를 따른다.
const SLOT_W: Record<Size, string> = { sm: 'w-[84px]', lg: 'w-[200px]' };
const GAP: Record<Size, string> = { sm: 'gap-2', lg: 'gap-4' };
const PAIR_GAP: Record<Size, string> = { sm: 'gap-[2px]', lg: 'gap-[4px]' };
const GROUP_TEXT: Record<Size, string> = { sm: 'text-[14px]', lg: 'text-[24px]' };
// 모둠 팻말은 좌상단 좌석의 중심에서 위로 이 만큼 띄운다(좌석 높이 절반 + 글자 높이).
const GROUP_LABEL_OFFSET: Record<Size, number> = { sm: 46, lg: 74 };
// 모둠 팻말과 이름표 윗변 사이 간격.
const LABEL_GAP = 14;

interface SeatSlotProps {
  index: number;
  size: Size;
  removed: boolean;
  editable: boolean;
  name?: string;
  fixed: boolean;
  highlight: boolean;
  role?: string;
  onSeatClick?: (seatIndex: number) => void;
  onSeatRestore?: (seatIndex: number) => void;
}

function SeatSlot({
  index,
  size,
  removed,
  editable,
  name,
  fixed,
  highlight,
  role,
  onSeatClick,
  onSeatRestore,
}: SeatSlotProps) {
  // lg는 격자 흐름에서도 이름표 칸 폭을 고정한다(열 폭이 이름 길이에 따라 달라지지 않게).
  const width = size === 'lg' ? SLOT_W.lg : '';
  // 비활성 좌석 + 편집 불가: 격자 흐름은 유지하되 아무것도 보이지 않는 빈 공간.
  // 장식/자리표시 요소이므로 aria-hidden과 pointer-events-none을 함께 준다(계약서 1절).
  if (removed && !editable) {
    return (
      <div
        data-seat={index}
        data-state="disabled"
        aria-hidden="true"
        className={`pointer-events-none ${SLOT_H[size]} ${width}`}
      />
    );
  }

  const state: NoteSeatState = removed ? 'disabled' : fixed ? 'fixed' : name ? 'assigned' : 'empty';
  return (
    <div className={`flex flex-col items-stretch ${width}`}>
      <NoteSeat
        index={index}
        name={name}
        state={state}
        size={size}
        variant={(index % 3) as 0 | 1 | 2}
        role={role}
        highlight={highlight}
        onClick={onSeatClick ? () => onSeatClick(index) : undefined}
        onRestore={onSeatRestore ? () => onSeatRestore(index) : undefined}
      />
    </div>
  );
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function extent(values: number[]): { min: number; max: number; span: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, span: max - min || 1 };
}

/** 이름표 한 칸의 실제 크기(px). SLOT_W/SLOT_H와 같은 값이어야 한다. */
const SLOT_PX: Record<Size, { w: number; h: number }> = {
  sm: { w: 84, h: 56 },
  lg: { w: 200, h: 100 },
};

/**
 * 원본 px/py 좌표계에서 책상 한 개가 차지하는 크기.
 * custom: `core/layouts/custom.ts`의 DESK_W/DESK_H (60x40)
 * group : `core/layouts/group.ts`의 seatW/seatH (64x48)
 * 편집기(CustomDeskEditor·GroupPositionEditor)도 같은 값을 쓴다. lg(200x100)는 가로 배율이
 * 세로 배율보다 커서 편집기보다 가로로 조금 넓게 그려진다(책상 한 개 = 이름표 한 칸이라
 * 겹치지 않는 원칙은 그대로다. 개선 스펙 3-1).
 */
const SOURCE_CELL: Record<'custom' | 'group', { w: number; h: number }> = {
  custom: { w: 60, h: 40 },
  group: { w: 64, h: 48 },
};

/**
 * px/py 픽셀 좌표를 캔버스 안 픽셀 좌표로 옮긴다(custom과 group 공용).
 *
 * 백분율로 정규화하면 캔버스가 좁을 때 이웃한 좌석의 간격이 이름표 폭보다
 * 작아져 이름표가 서로 겹친다(모둠 배치에서 실제로 겹쳤다). 그래서 원본 좌표계의
 * 책상 한 개(SOURCE_CELL)가 이름표 한 칸이 되도록 일정하게 축척하고, 캔버스 크기도
 * 그 결과에 맞춘다. 화면에 맞추는 일은 바깥(발표 화면·미리보기의 확대·축소)이 맡는다.
 *
 * 좌석 간 최소 간격을 기준으로 삼지 않는 이유: 책상 두 개가 유난히 가까우면
 * 그 한 쌍 때문에 배치도 전체가 몇 배로 부풀어 다른 자리가 다 작아진다.
 */
function pixelScale(
  positions: SeatPosition[],
  size: Size,
  cell: { w: number; h: number },
  pad: { top: number; bottom: number } = { top: 0, bottom: 0 },
): {
  toLeft: (px: number) => number;
  toTop: (py: number) => number;
  width: number;
  height: number;
} {
  const x = extent(positions.map((p) => p.px ?? 0));
  const y = extent(positions.map((p) => p.py ?? 0));
  const slot = SLOT_PX[size];
  const kx = slot.w / cell.w;
  const ky = slot.h / cell.h;
  return {
    toLeft: (px: number) => (px - x.min) * kx + slot.w / 2,
    toTop: (py: number) => (py - y.min) * ky + slot.h / 2 + pad.top,
    width: (x.max - x.min) * kx + slot.w,
    height: (y.max - y.min) * ky + slot.h + pad.top + pad.bottom,
  };
}

/**
 * U자 좌석을 격자 칸(1부터)에 놓는다. 1열 설정처럼 왼쪽·오른쪽 줄이 같은 칸을
 * 가리키면 뒤에 오는 좌석을 오른쪽 빈 칸으로 민다(자리가 겹쳐 보이면 안 된다).
 */
function ushapeCells(positions: SeatPosition[], teacher: boolean): { pos: SeatPosition; row: number; col: number }[] {
  const taken = new Set<string>();
  const placed = positions.map((pos) => {
    let col = pos.col;
    while (taken.has(`${pos.row}:${col}`)) col += 1;
    taken.add(`${pos.row}:${col}`);
    return { pos, row: pos.row, col };
  });
  const rows = Math.max(...placed.map((p) => p.row)) + 1;
  const cols = Math.max(...placed.map((p) => p.col)) + 1;
  return placed.map(({ pos, row, col }) => ({
    pos,
    row: (teacher ? rows - 1 - row : row) + 1,
    col: (teacher ? cols - 1 - col : col) + 1,
  }));
}

export function SeatBoard({
  data,
  mapping,
  size = 'sm',
  perspective = 'student',
  highlightSeats,
  fixedMode = false,
  showFixed = true,
  editable = false,
  onSeatClick,
  onSeatRestore,
  groupNames,
  roles,
  revealedSeats = 'all',
  flipping = false,
  className = '',
}: SeatBoardProps) {
  const positions = getLayout(data.layoutType).getSeatPositions(data.layoutSettings);
  const teacher = perspective === 'teacher';
  const removedSet = new Set(data.layoutSettings.disabledSeats ?? []);
  const fixedSet = new Set(data.fixedSeats.map((f) => f.seatIndex));
  const highlightSet = new Set(highlightSeats ?? []);
  const revealedSet = revealedSeats === 'all' ? null : new Set(revealedSeats);

  // 미공개 좌석은 뒷면(빈 종이)이다. 이름·역할은 물론 고정 압정도 붙이지 않아
  // 공개 전에 어떤 정보도 DOM에 남지 않게 한다. showFixed=false면 공개 뒤에도 압정이 없다.
  const slot = (pos: SeatPosition) => {
    const i = pos.index;
    const revealed = revealedSet === null || revealedSet.has(i);
    return (
      <SeatSlot
        key={i}
        index={i}
        size={size}
        removed={removedSet.has(i)}
        editable={editable}
        name={revealed ? mapping?.[i] : undefined}
        fixed={showFixed && revealed && fixedSet.has(i)}
        highlight={highlightSet.has(i) || (fixedMode && fixedSet.has(i))}
        role={revealed ? roles?.[i] : undefined}
        onSeatClick={onSeatClick}
        onSeatRestore={onSeatRestore}
      />
    );
  };

  // 절대 배치(px 좌표) 공통. 교사 시선이면 캔버스 안에서 180도 반전한다.
  const absSlotPx = (pos: SeatPosition, leftPx: number, topPx: number, w: number, h: number) => {
    const left = teacher ? w - leftPx : leftPx;
    const top = teacher ? h - topPx : topPx;
    return (
      <div
        key={pos.index}
        data-abs-slot={pos.index}
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${SLOT_W[size]}`}
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        {slot(pos)}
      </div>
    );
  };

  let body: React.ReactNode;

  if (positions.length === 0) {
    body = <p className="py-8 text-center font-body text-ink">배치할 자리가 없습니다.</p>;
  } else if (data.layoutType === 'pair') {
    const rowOrder = uniqueSorted(positions.map((p) => p.row));
    const pairColOrder = uniqueSorted(positions.map((p) => p.pairCol ?? 0));
    const rows = teacher ? [...rowOrder].reverse() : rowOrder;
    const pairCols = teacher ? [...pairColOrder].reverse() : pairColOrder;
    body = (
      <div
        data-arrangement="pair"
        className={`grid justify-center ${GAP[size]}`}
        style={{ gridTemplateColumns: `repeat(${pairColOrder.length}, auto)` }}
      >
        {rows.flatMap((r) =>
          pairCols.map((pc) => {
            const pair = positions
              .filter((p) => p.row === r && (p.pairCol ?? 0) === pc)
              .sort((a, b) => a.col - b.col);
            const inner = teacher ? [...pair].reverse() : pair;
            return (
              <div key={`${r}-${pc}`} data-pair-group={`${r}-${pc}`} className={`flex ${PAIR_GAP[size]}`}>
                {inner.map(slot)}
              </div>
            );
          }),
        )}
      </div>
    );
  } else if (data.layoutType === 'ushape') {
    const cells = ushapeCells(positions, teacher);
    const cols = Math.max(...cells.map((c) => c.col));
    body = (
      <div
        data-arrangement="ushape"
        className={`grid justify-center ${GAP[size]}`}
        style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}
      >
        {cells.map(({ pos, row, col }) => (
          <div
            key={pos.index}
            data-grid-slot={pos.index}
            data-grid-row={row}
            data-grid-col={col}
            style={{ gridRow: row, gridColumn: col }}
          >
            {slot(pos)}
          </div>
        ))}
      </div>
    );
  } else if (data.layoutType === 'custom') {
    // 역할 글씨는 이름표 안에 있으므로 캔버스에 위아래 여유를 따로 두지 않는다.
    const scale = pixelScale(positions, size, SOURCE_CELL.custom);
    body = (
      <div
        data-arrangement="custom"
        className="relative"
        style={{ width: scale.width, height: scale.height }}
      >
        {positions.map((pos) =>
          absSlotPx(pos, scale.toLeft(pos.px ?? 0), scale.toTop(pos.py ?? 0), scale.width, scale.height),
        )}
      </div>
    );
  } else if (data.layoutType === 'group') {
    // 모둠 블록 위치는 코어가 px/py에 반영해 둔다. 여기서 격자를 다시 계산하면
    // 교사가 드래그해 저장한 위치(groupPositions)가 배치도에서 사라진다.
    // 모둠 이름 팻말(위)이 잘리지 않게 여유를 둔다. 교사 시선은 좌표를 180도 뒤집으므로
    // 여유는 위아래가 같아야 한다.
    const gPad = GROUP_LABEL_OFFSET[size];
    const scale = pixelScale(positions, size, SOURCE_CELL.group, { top: gPad, bottom: gPad });
    const groupOrder = uniqueSorted(positions.map((p) => p.groupIndex ?? 0));
    body = (
      <div
        data-arrangement="group"
        className="relative"
        style={{ width: scale.width, height: scale.height }}
      >
        {groupOrder.map((g) => {
          const seats = positions.filter((p) => (p.groupIndex ?? 0) === g);
          const xs = seats.map((p) => p.px ?? 0);
          const ys = seats.map((p) => p.py ?? 0);
          // 교사 시선은 좌표가 180도 뒤집히므로, 블록의 반대쪽 모서리가 화면 좌상단이 된다.
          const anchorX = teacher ? Math.max(...xs) : Math.min(...xs);
          const anchorY = teacher ? Math.max(...ys) : Math.min(...ys);
          const rawLeft = scale.toLeft(anchorX);
          const rawTop = scale.toTop(anchorY);
          const left = teacher ? scale.width - rawLeft : rawLeft;
          const top = teacher ? scale.height - rawTop : rawTop;
          return (
            // 모둠 이름 팻말: cork 배경 위이므로 text-ink
            <span
              key={g}
              data-group-index={g}
              // top은 블록에서 화면상 가장 위에 오는 좌석의 "중심"이다. 팻말 높이는
              // 글꼴에 따라 달라지므로 -translate-y-full로 팻말의 아래쪽을 좌석 윗변
              // 바로 위에 붙인다(고정 오프셋으로 빼면 이름표에 가려진다).
              style={{ left: `${left}px`, top: `${top - SLOT_PX[size].h / 2 - LABEL_GAP}px` }}
              className={`absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap font-hand font-bold leading-none text-ink ${GROUP_TEXT[size]}`}
            >
              {groupNames?.[g] ?? `${g + 1}모둠`}
            </span>
          );
        })}
        {positions.map((pos) =>
          absSlotPx(pos, scale.toLeft(pos.px ?? 0), scale.toTop(pos.py ?? 0), scale.width, scale.height),
        )}
      </div>
    );
  } else {
    // exam (기본값). getLayout 폴백도 exam이므로 알 수 없는 배치는 여기로 온다.
    const ordered = teacher
      ? [...positions].sort((a, b) => (a.row !== b.row ? b.row - a.row : b.col - a.col))
      : positions;
    body = (
      <div
        data-arrangement="exam"
        className={`grid justify-center ${GAP[size]}`}
        style={{ gridTemplateColumns: `repeat(${data.layoutSettings.columns}, auto)` }}
      >
        {ordered.map(slot)}
      </div>
    );
  }

  return (
    <div
      data-testid="seat-board"
      data-layout={data.layoutType}
      data-perspective={perspective}
      data-size={size}
      data-flipping={flipping ? 'true' : undefined}
      className={`flex flex-col ${GAP[size]} ${flipping ? 'seat-board-flipping' : ''} ${className}`}
    >
      {!teacher && <ChalkBoard kind="board" />}
      {body}
      {teacher && <ChalkBoard kind="podium" />}
    </div>
  );
}
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/components/cork/NoteSeat.test.tsx src/features/layout/SeatBoard.test.tsx`
Expected: PASS(기존 테스트 포함). 기존 group 테스트(sm 기준 좌표)는 SLOT_PX.sm이 그대로라 통과해야 한다.

- [ ] **Step 7: DevCork 데모와 E2E 주석** — `src/pages/DevCorkPage.tsx`의 lg 이름표 줄(현재 `<div className="grid w-full max-w-[720px] grid-cols-4 gap-3">` 블록)을 실제 슬롯 폭으로 바꾼다. 발표 화면의 lg 칸은 200px이라, 171px 칸에 두면 5글자 이름이 잘려 `e2e/dev-cork.spec.ts`의 한 줄 검사가 깨진다.

```tsx
          <div className="flex flex-wrap gap-3">
            <div className="w-[200px]">
              <NoteSeat index={0} name="황보아리랑" state="assigned" size="lg" onClick={count} />
            </div>
            <div className="w-[200px]">
              <NoteSeat index={1} name="이도윤" state="fixed" size="lg" onClick={count} />
            </div>
            <div className="w-[200px]">
              <NoteSeat index={2} state="empty" size="lg" onClick={count} />
            </div>
            {/* R38: onRestore가 없으므로 "빈 자리로 둠"으로 표시되고 네이티브 disabled가 된다. */}
            <div className="w-[200px]">
              <NoteSeat index={3} state="disabled" size="lg" />
            </div>
          </div>
```

`e2e/dev-cork.spec.ts` 34행 주석만 고친다(코드 그대로):

```ts
/** lg 좌석 이름표가 쓰는 얼굴 (NoteSeat: font-hand font-bold → 700. 글자 크기는 이름 길이에 따라 20~48px이고, 얼굴 로드는 크기와 무관). */
```

- [ ] **Step 8: 눈 확인(필수)** — 저장소 밖 ASCII 경로(`C:\Users\Public\tmp-shots`)에서 즉석 스크립트로 스크린샷을 찍어 직접 본다. PresentPage는 아직 안 바뀌었지만 이미 lg 배치도를 쓰므로 새 이름표가 보인다.
  - `npm run build` 후 `npm run preview -- --port 4173 --strictPort --host 127.0.0.1`을 백그라운드로 띄운다.
  - `src/test/fixtures/v1-basic.json`(exam 6x4, 22명, 지난 배치 있음)을 `localStorage`에 넣고(`seat-changer-classes`=`["6-7"]`, `seat-changer-active`=`6-7`, `seat-changer-data-6-7`=JSON), 1920x1080에서 `/present` "자리 뽑기" 후, `/dev/cork`, 교사 화면(`/`)을 U자(`layoutType:'ushape'`, `columns:8, rows:7`)로 찍는다.
  - 확인: 이름이 이름표 밖으로 넘치거나 잘리지 않는다 / 번호와 이름이 겹치지 않는다 / U자가 겹치지 않고 윗줄 + 양옆 줄 모양이다 / 모둠 배치(`groupSize:4`)에서 모둠 팻말이 가려지지 않는다. 문제가 있으면 NoteSeat 여백·글자 단계만 조정하고 테스트를 맞춘다.
  - 실행 전 `TEMP`/`TMP`를 ASCII 경로로 바꾼다(Global Constraints).

- [ ] **Step 9: 게이트 + E2E(dev-cork만) + 커밋**

Run: `npm run gate` → PASS
Run: `npm run e2e -- e2e/dev-cork.spec.ts` → PASS

```bash
git add src/components/cork/NoteSeat.tsx src/components/cork/NoteSeat.test.tsx src/features/layout/SeatBoard.tsx src/features/layout/SeatBoard.test.tsx src/pages/DevCorkPage.tsx e2e/dev-cork.spec.ts
git commit -m "feat(board): 발표용 이름표를 200x100 가로형으로, U자는 격자로, 고정 표시를 끌 수 있게"
```

---

### Task 4: 발표 화면 통합 (impl-l)

**Files:**
- Create: `src/features/present/useFullscreen.ts`
- Create: `src/features/present/PresentControls.tsx`, `src/features/present/PresentControls.test.tsx`
- Create: `src/features/present/boardImage.ts`, `src/features/present/boardImage.test.ts`
- Modify: `src/pages/PresentPage.tsx` (전체 교체), `src/features/present/present.css`, `src/features/present/PresentPage.test.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 1 `replaceLastAssignment`, Task 2 `loadableLastAssignment`·`fitPrintPage`·`PRINT_MARGIN_MM`·`PrintFit`·`useDrawSequence({ initialMapping, onSwapped })`, Task 3 `SeatBoard showFixed`·`[data-seat-name]`
- Produces: Contracts의 발표 화면 DOM(`data-present="status"` 등) — Task 5 E2E가 사용

- [ ] **Step 1: 실패 테스트 — PresentControls** — `src/features/present/PresentControls.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentControls, type PresentControlsProps } from './PresentControls';

function props(patch: Partial<PresentControlsProps> = {}): PresentControlsProps {
  return {
    classLabel: '6-5',
    status: null,
    hidden: false,
    hasResult: true,
    running: false,
    lottery: false,
    teacherView: false,
    muted: false,
    onStart: vi.fn(),
    onStartLottery: vi.fn(),
    onRevealOne: vi.fn(),
    onRevealAll: vi.fn(),
    onTogglePerspective: vi.fn(),
    onToggleSound: vi.fn(),
    onSaveImage: vi.fn(),
    onPrint: vi.fn(),
    ...patch,
  };
}

afterEach(() => {
  // useFullscreen이 읽는 전역을 테스트마다 되돌린다(jsdom에는 Fullscreen API가 없다).
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
});

describe('PresentControls', () => {
  it('반 이름과 상태 칸을 보여 준다', () => {
    render(<PresentControls {...props({ status: { text: '두 자리를 차례로 누르면 서로 바뀝니다', tone: 'hint' } })} />);
    expect(document.querySelector('[data-present="class"]')).toHaveTextContent('6-5');
    const status = document.querySelector('[data-present="status"]')!;
    expect(status).toHaveTextContent('두 자리를 차례로 누르면 서로 바뀝니다');
    expect(status).toHaveAttribute('data-tone', 'hint');
  });

  it('상태가 없어도 상태 칸은 같은 높이로 남는다', () => {
    render(<PresentControls {...props()} />);
    const status = document.querySelector('[data-present="status"]')!;
    expect(status.className).toContain('h-9');
    expect(status).toHaveTextContent('');
  });

  it('뽑는 동안에는 언마운트하지 않고 가린다(높이 유지)', () => {
    render(<PresentControls {...props({ hidden: true })} />);
    expect(document.querySelector('[data-present="controls"]')!.className).toContain('invisible');
  });

  it('결과가 없으면 이미지 저장·인쇄를 잠그고 버튼 이름은 자리 뽑기다', () => {
    render(<PresentControls {...props({ hasResult: false })} />);
    expect(screen.getByRole('button', { name: /이미지 저장/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /자리 뽑기/ })).toBeEnabled();
  });

  it('한 명씩 뽑기 중에는 다음 학생 공개·모두 공개를 보여 준다', () => {
    render(<PresentControls {...props({ lottery: true })} />);
    expect(screen.getByRole('button', { name: '다음 학생 공개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모두 공개' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /한 명씩 뽑기/ })).toBeNull();
  });

  it('전체 화면을 쓸 수 없는 환경에서는 버튼을 숨긴다', () => {
    render(<PresentControls {...props()} />);
    expect(screen.queryByRole('button', { name: /전체 화면/ })).toBeNull();
  });

  it('전체 화면 버튼은 문서 전체를 전체 화면으로 요청한다', async () => {
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    render(<PresentControls {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: '전체 화면' }));
    expect(request).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 테스트 — boardImage** — `src/features/present/boardImage.test.ts`

```ts
import { seatFontSizes } from './boardImage';

describe('seatFontSizes', () => {
  it('발표용 이름표(100px)에서 이름 42px, 번호 14px', () => {
    expect(seatFontSizes(100)).toEqual({ name: 42, number: 14 });
  });

  it('작은 이름표에서도 읽을 수 있는 최소 크기를 지킨다', () => {
    expect(seatFontSizes(20)).toEqual({ name: 12, number: 10 });
  });
});
```

- [ ] **Step 3: 실패 테스트 — PresentPage** — `src/features/present/PresentPage.test.tsx` 전체를 아래로 교체한다(기존 테스트는 이름 읽는 방법만 바뀌고 모두 남는다).

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { PresentPage } from '@/pages/PresentPage';
import { Confetti } from '@/features/present/Confetti';

function makeData(patch: Partial<ClassData> = {}): ClassData {
  const base = createDefaultData();
  return {
    ...base,
    students: ['가람', '나래'],
    classSize: 2,
    ...patch,
    layoutSettings: { ...base.layoutSettings, columns: 2, rows: 1, ...(patch.layoutSettings ?? {}) },
  };
}

const LAST = { mapping: { 0: '가람', 1: '나래' }, timestamp: 1 };

/** prefers-reduced-motion을 켠 상태로 고정한다. */
function mockReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function seatAt(index: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cork="note-seat"][data-seat="${index}"]`);
  if (!el) throw new Error(`좌석 ${index}을 찾지 못했습니다.`);
  return el;
}

/** 좌석에 적힌 이름(이름 글자에만 붙는 data-seat-name) */
function nameAt(index: number): string {
  return seatAt(index).querySelector('[data-seat-name]')?.textContent ?? '';
}

function statusText(): string {
  return document.querySelector('[data-present="status"]')?.textContent ?? '';
}

beforeEach(() => {
  mockReducedMotion(true);
  useAppStore.setState({ activeClass: '테스트반', data: makeData() });
});

describe('PresentPage', () => {
  it('prefers-reduced-motion이면 카운트다운 없이 곧바로 전체를 공개한다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));

    expect(await screen.findByText('가람')).toBeInTheDocument();
    expect(screen.getByText('나래')).toBeInTheDocument();
    expect(document.querySelector('[data-present="countdown"]')).toBeNull();
    // 두 번째부터는 같은 버튼의 라벨만 바뀐다.
    expect(screen.getByRole('button', { name: /다시 뽑기/ })).toBeInTheDocument();
  });

  it('배치에 실패하면 사유를 그대로 보여준다', async () => {
    useAppStore.setState({ data: makeData({ students: [], classSize: 0 }) });
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));

    const failure = await screen.findByText('학생 명단이 비어 있습니다.');
    expect(failure).toBeInTheDocument();
    expect(failure).toHaveAttribute('data-reason', 'no-students');
  });

  it('좌석 두 개를 차례로 누르면 두 학생의 자리를 맞바꾼다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);
    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));
    await screen.findByText('가람');

    const before = [nameAt(0), nameAt(1)];
    await user.click(seatAt(0));
    expect(screen.getByText(/1번 자리를 골랐습니다/)).toBeInTheDocument();

    await user.click(seatAt(1));
    expect(nameAt(0)).toBe(before[1]);
    expect(nameAt(1)).toBe(before[0]);
  });

  it('시점 토글은 레거시와 같은 라벨로 학생 시선과 선생님 시선을 오간다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(screen.getByRole('button', { name: /학생 시선/ }));

    expect(useAppStore.getState().data.viewPerspective).toBe('teacher');
    expect(screen.getByRole('button', { name: /선생님 시선/ })).toBeInTheDocument();
  });

  // 실브라우저 검증에서 찾은 결함: 인쇄용 양면 보기가 인쇄 버튼을 누른 동안에만
  // 존재해, 사용자가 Ctrl+P로 직접 인쇄하면 빈 종이가 나왔다. 이제는 브라우저가
  // 인쇄를 시작할 때 알리는 beforeprint에서 올린다.
  it('브라우저가 인쇄를 시작하면 학생 시선과 선생님 시선 배치도를 함께 올린다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);
    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));
    await screen.findByText('가람');

    // 평소 화면에는 배치도가 하나뿐이다.
    expect(screen.getAllByTestId('seat-board')).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    const boards = screen.getAllByTestId('seat-board');
    expect(boards).toHaveLength(3);
    expect(boards.map((b) => b.getAttribute('data-perspective'))).toEqual(['student', 'student', 'teacher']);

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(screen.getAllByTestId('seat-board')).toHaveLength(1);
  });

  it('지난 배치가 있으면 공개된 상태로 열리고 바로 인쇄·이미지 저장을 쓸 수 있다', () => {
    useAppStore.setState({ data: makeData({ lastAssignment: LAST }) });
    render(<PresentPage />);

    expect(nameAt(0)).toBe('가람');
    expect(nameAt(1)).toBe('나래');
    expect(screen.getByRole('button', { name: /다시 뽑기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /이미지 저장/ })).toBeEnabled();
    expect(statusText()).toBe('두 자리를 차례로 누르면 서로 바뀝니다');
  });

  it('명단이 바뀌어 지난 배치를 쓸 수 없으면 빈 화면으로 열고 알린다', async () => {
    useAppStore.setState({ data: makeData({ lastAssignment: { mapping: { 0: '가람', 1: '다른학생' }, timestamp: 1 } }) });
    render(<PresentPage />);

    expect(await screen.findByText('명단이나 배치가 바뀌어 지난 배치는 불러오지 않았습니다.')).toBeInTheDocument();
    expect(document.querySelector('[data-seat-name]')).toBeNull();
    expect(screen.getByRole('button', { name: /자리 뽑기/ })).toBeInTheDocument();
  });

  it('지난 배치에서 자리를 바꾸면 이력을 늘리지 않고 지난 배치만 고친다', async () => {
    useAppStore.setState({ data: makeData({ lastAssignment: LAST }) });
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(seatAt(0));
    expect(statusText()).toBe('1번 자리를 골랐습니다. 바꿀 자리를 누르세요 (같은 자리를 다시 누르면 취소)');
    await user.click(seatAt(1));

    const saved = useAppStore.getState().data;
    expect(saved.lastAssignment?.mapping).toEqual({ 0: '나래', 1: '가람' });
    expect(saved.lastAssignment?.timestamp).toBe(1);
    expect(saved.assignmentHistory).toHaveLength(0);
    expect(statusText()).toBe('두 자리를 차례로 누르면 서로 바뀝니다');
  });

  it('발표 화면은 고정 자리를 드러내지 않는다', () => {
    useAppStore.setState({
      data: makeData({ fixedSeats: [{ studentName: '가람', seatIndex: 0 }], lastAssignment: LAST }),
    });
    render(<PresentPage />);

    expect(seatAt(0)).toHaveAttribute('data-state', 'assigned');
    expect(document.querySelector('[data-cork="pushpin"]')).toBeNull();
  });

  it('제목 칠판 없이 반 이름은 조작 막대에 둔다', () => {
    render(<PresentPage />);
    expect(screen.queryByText('테스트반 자리 배치')).toBeNull();
    expect(document.querySelector('[data-present="class"]')).toHaveTextContent('테스트반');
  });

  it('인쇄하면 반 이름을 넣은 제목과 용지 방향 규칙을 올린다', () => {
    useAppStore.setState({ data: makeData({ lastAssignment: LAST }) });
    render(<PresentPage />);

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(screen.getByText('[ 테스트반 · 학생 시선 ]')).toBeInTheDocument();
    expect(screen.getByText('[ 테스트반 · 선생님 시선 ]')).toBeInTheDocument();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    // jsdom은 배치도 크기를 0으로 재므로 fitPrintPage의 기본값(가로)이 나온다.
    expect(css).toMatch(/@page\s*\{\s*size:\s*landscape;\s*margin:\s*10mm;\s*\}/);
    // 인쇄용 배치도도 고정 자리를 드러내지 않는다.
    expect(document.querySelector('[data-cork="pushpin"]')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
  });
});

describe('Confetti', () => {
  it('active가 아니면 아무것도 그리지 않는다', () => {
    render(<Confetti active={false} />);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  // 실브라우저 검증에서 찾은 결함: 연출이 끝나도 캔버스가 화면 전체를 덮은 채
  // 남아 인쇄·캡처에 끼어들었다. 2d 컨텍스트가 없는 환경에서도 스스로 내려가야 한다.
  it('그릴 수 없는 환경에서는 캔버스를 남기지 않는다', () => {
    render(<Confetti active />);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run src/features/present/PresentControls.test.tsx src/features/present/boardImage.test.ts src/features/present/PresentPage.test.tsx`
Expected: FAIL (모듈 없음, 새 동작 없음)

- [ ] **Step 5: 구현 — `src/features/present/useFullscreen.ts`**

```ts
// 전체 화면(Fullscreen API) 켜기·끄기(개선 스펙 3-2). 쓸 수 없는 브라우저면 supported=false.
import { useCallback, useEffect, useState } from 'react';

function currentlyFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const supported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function';
  const [active, setActive] = useState(currentlyFullscreen);

  useEffect(() => {
    const onChange = () => setActive(currentlyFullscreen());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    try {
      const done = currentlyFullscreen() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      // 거부(권한·사용자 제스처 없음)는 조용히 넘어간다. 화면이 그대로면 그것이 신호다.
      done.catch(() => {});
    } catch {
      // 전체 화면을 막는 환경이면 조용히 넘어간다.
    }
  }, []);

  return { supported, active, toggle };
}
```

- [ ] **Step 6: 구현 — `src/features/present/PresentControls.tsx`**

```tsx
// 발표 화면 조작 막대(개선 스펙 3-2). 얇은 한 줄: 반 이름 + 고정 높이 상태 칸 + 버튼.
// 뽑는 동안에는 언마운트하지 않고 가려서(invisible) 높이를 지킨다. 막대가 빠졌다 들어오면
// 배치도 영역이 커졌다 작아지며 배율이 흔들린다. 상태 칸도 높이가 고정이라 문구가 바뀌어도
// 배치도가 움직이지 않는다(첫 자리를 누를 때 자리가 움직이던 문제).
import {
  ArrowLeft,
  Eye,
  ImageDown,
  Maximize,
  Minimize,
  Play,
  Printer,
  RotateCcw,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WoodButton } from '@/components/cork/WoodButton';
import { useFullscreen } from './useFullscreen';

export interface PresentStatus {
  text: string;
  /** lottery: 한 명씩 뽑기에서 지금 공개하는 이름(크게), hint: 자리 바꾸기 안내 */
  tone: 'lottery' | 'hint';
}

export interface PresentControlsProps {
  classLabel: string;
  status: PresentStatus | null;
  /** 카운트다운·셔플·줄 공개 중. 막대를 가리되 자리는 지킨다. */
  hidden: boolean;
  hasResult: boolean;
  running: boolean;
  lottery: boolean;
  teacherView: boolean;
  muted: boolean;
  onStart: () => void;
  onStartLottery: () => void;
  onRevealOne: () => void;
  onRevealAll: () => void;
  onTogglePerspective: () => void;
  onToggleSound: () => void;
  onSaveImage: () => void;
  onPrint: () => void;
}

const ICON = 'pointer-events-none';

export function PresentControls({
  classLabel,
  status,
  hidden,
  hasResult,
  running,
  lottery,
  teacherView,
  muted,
  onStart,
  onStartLottery,
  onRevealOne,
  onRevealAll,
  onTogglePerspective,
  onToggleSound,
  onSaveImage,
  onPrint,
}: PresentControlsProps) {
  const fullscreen = useFullscreen();
  const statusLook =
    status?.tone === 'lottery' ? 'font-hand text-[30px] font-bold leading-9' : 'font-body text-[15px] font-bold leading-9';
  return (
    <footer
      data-present="controls"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-note bg-paper px-3 py-2 shadow-card ${hidden ? 'invisible' : ''}`}
    >
      <span data-present="class" className="shrink-0 font-hand text-[20px] font-bold text-ink">
        {classLabel}
      </span>
      <p
        data-present="status"
        data-tone={status?.tone}
        aria-live="polite"
        className={`h-9 min-w-[12rem] flex-1 truncate text-ink ${statusLook}`}
      >
        {status?.text ?? ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <WoodButton
          variant="primary"
          disabled={running}
          onClick={onStart}
          icon={
            hasResult ? (
              <RotateCcw size={18} aria-hidden="true" className={ICON} />
            ) : (
              <Play size={18} aria-hidden="true" className={ICON} />
            )
          }
        >
          {hasResult ? '다시 뽑기' : '자리 뽑기'}
        </WoodButton>

        {lottery ? (
          <>
            <WoodButton variant="primary" disabled={running} onClick={onRevealOne}>
              다음 학생 공개
            </WoodButton>
            <WoodButton variant="secondary" disabled={running} onClick={onRevealAll}>
              모두 공개
            </WoodButton>
          </>
        ) : (
          <WoodButton
            variant="secondary"
            disabled={running}
            onClick={onStartLottery}
            icon={<UserRound size={18} aria-hidden="true" className={ICON} />}
          >
            한 명씩 뽑기
          </WoodButton>
        )}

        <WoodButton
          variant="secondary"
          onClick={onTogglePerspective}
          aria-label={`${teacherView ? '선생님 시선' : '학생 시선'} (누르면 시점이 바뀝니다)`}
          icon={<Eye size={18} aria-hidden="true" className={ICON} />}
        >
          {teacherView ? '선생님 시선' : '학생 시선'}
        </WoodButton>

        <WoodButton
          variant="secondary"
          onClick={onToggleSound}
          icon={
            muted ? (
              <VolumeX size={18} aria-hidden="true" className={ICON} />
            ) : (
              <Volume2 size={18} aria-hidden="true" className={ICON} />
            )
          }
        >
          {muted ? '소리 켜기' : '소리 끄기'}
        </WoodButton>

        <WoodButton
          variant="secondary"
          onClick={onSaveImage}
          disabled={!hasResult || running}
          icon={<ImageDown size={18} aria-hidden="true" className={ICON} />}
        >
          이미지 저장
        </WoodButton>

        <WoodButton
          variant="secondary"
          onClick={onPrint}
          disabled={!hasResult || running}
          icon={<Printer size={18} aria-hidden="true" className={ICON} />}
        >
          인쇄
        </WoodButton>

        {fullscreen.supported && (
          <WoodButton
            variant="secondary"
            onClick={fullscreen.toggle}
            icon={
              fullscreen.active ? (
                <Minimize size={18} aria-hidden="true" className={ICON} />
              ) : (
                <Maximize size={18} aria-hidden="true" className={ICON} />
              )
            }
          >
            {fullscreen.active ? '전체 화면 끝내기' : '전체 화면'}
          </WoodButton>
        )}

        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-4 py-2 font-hand text-[15px] font-bold text-ink shadow-note"
        >
          <ArrowLeft size={18} aria-hidden="true" className={ICON} />
          교사 화면으로
        </a>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: 구현 — `src/features/present/boardImage.ts`** (현재 `PresentPage.tsx` 67-172행을 옮기고 고친다)

```ts
// 이미지 저장 그리기 (legacy/js/screens/student-screen.js:1074-1155 renderToCanvas 이식).
// 여백·제목 높이·2배 스케일·둥근 모서리·제목 문구·파일명 규칙은 레거시 그대로다.
// 색만 v1 팔레트(#F8FAFC 등)에서 v2 코르크 팔레트로 바꿨다 — v2에는 그 색이 없다.
// 개선 스펙 3-5: 글자 크기는 이름표 상자 크기에 비례하고, 고정 자리 전용 색은 없다
// (학생이 보는 결과물에 고정 자리를 드러내지 않는다). 이름은 data-seat-name에서 읽는다.
const PADDING = 40;
const TITLE_HEIGHT = 50;
// 저장 파일 확장자. G4 스캐너(scripts/scan-emoji.mjs)는 소스에 이미지 확장자 문자열이
// 그대로 있으면 이미지 파일 참조로 보고 막는다. 여기서는 파일명을 만드는 용도라
// 확장자만 상수로 떼어 문자열에서 점과 붙지 않게 한다.
export const IMAGE_EXT = 'png';
const IMG = {
  bg: '#FFFBF0',
  title: '#2A211B',
  board: '#26443C',
  boardText: '#F3F0E6',
  podium: '#7B5130',
  podiumText: '#FFFBF0',
  seatAssigned: '#FFFBF0',
  seatEmpty: '#E8F1D9',
  seatLine: '#7B5130',
  seatText: '#2A211B',
} as const;

/** 이름표 높이에 비례한 글자 크기(px). 발표용 이름표(100px)에서 이름 42px, 번호 14px. */
export function seatFontSizes(seatHeight: number): { name: number; number: number } {
  return {
    name: Math.max(12, Math.round(seatHeight * 0.42)),
    number: Math.max(10, Math.round(seatHeight * 0.14)),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function renderBoardToCanvas(root: HTMLElement, teacherView: boolean): HTMLCanvasElement | null {
  const seats = Array.from(root.querySelectorAll<HTMLElement>('[data-cork="note-seat"]'));
  if (seats.length === 0) return null;
  const rootRect = root.getBoundingClientRect();
  const width = Math.max(rootRect.width + PADDING * 2, 600);
  const height = rootRect.height + PADDING * 2 + TITLE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);

  ctx.fillStyle = IMG.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = IMG.title;
  ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const dateStr = new Date().toLocaleDateString('ko-KR');
  const viewLabel = teacherView ? ' (선생님 시선)' : '';
  ctx.fillText(`자리 배치${viewLabel} - ${dateStr}`, width / 2, 30);

  const board = root.querySelector<HTMLElement>('[data-cork="chalkboard"]');
  if (board) {
    const rect = board.getBoundingClientRect();
    const bx = rect.left - rootRect.left + PADDING;
    const by = rect.top - rootRect.top + PADDING + TITLE_HEIGHT;
    const podium = board.dataset.kind === 'podium';
    ctx.fillStyle = podium ? IMG.podium : IMG.board;
    roundRect(ctx, bx, by, rect.width, rect.height, 4);
    ctx.fill();
    ctx.fillStyle = podium ? IMG.podiumText : IMG.boardText;
    ctx.font = '14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(board.textContent ?? '', bx + rect.width / 2, by + rect.height / 2 + 5);
  }

  for (const seat of seats) {
    const rect = seat.getBoundingClientRect();
    const x = rect.left - rootRect.left + PADDING;
    const y = rect.top - rootRect.top + PADDING + TITLE_HEIGHT;
    const state = seat.dataset.state;
    const filled = state === 'assigned' || state === 'fixed';
    ctx.fillStyle = filled ? IMG.seatAssigned : IMG.seatEmpty;
    ctx.strokeStyle = IMG.seatLine;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, rect.width, rect.height, 6);
    ctx.fill();
    ctx.stroke();

    const font = seatFontSizes(rect.height);
    ctx.fillStyle = IMG.seatText;
    ctx.font = `${font.number}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(Number(seat.dataset.seat ?? '0') + 1), x + 6, y + 4);

    const name = filled ? (seat.querySelector<HTMLElement>('[data-seat-name]')?.textContent ?? '') : '';
    if (name) {
      ctx.font = `bold ${font.name}px "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 이름이 긴 학생이 있어도 이름표 밖으로 나가지 않게 폭을 제한한다.
      ctx.fillText(name, x + rect.width / 2, y + rect.height / 2, Math.max(rect.width - 16, 20));
    }
  }
  return canvas;
}
```

- [ ] **Step 8: 구현 — `src/pages/PresentPage.tsx` 전체 교체**

```tsx
// 발표 화면(스펙 6절, 개선 스펙 2026-09-28). 전체화면으로 띄워 학생들이 함께 보는 화면이다.
// 뽑기 연출의 상태는 useDrawSequence, 조작 막대는 PresentControls, 이미지 그리기는
// boardImage가 맡는다. 이 파일은 화면 구성과 저장(스토어)·인쇄·시점 전환을 잇는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ToastHost } from '@/components/Toast';
import { SeatBoard } from '@/features/layout/SeatBoard';
import { assignRoles } from '@/core/groups/roles';
import { groupLayout } from '@/core/layouts/group';
import type { Assignment, ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { useGroupSettings } from '@/features/groups/useGroupSettings';
import { Confetti } from '@/features/present/Confetti';
import { PresentControls, type PresentStatus } from '@/features/present/PresentControls';
import { IMAGE_EXT, renderBoardToCanvas } from '@/features/present/boardImage';
import { loadableLastAssignment } from '@/features/present/lastAssignment';
import { fitPrintPage, PRINT_MARGIN_MM, type PrintFit } from '@/features/present/printFit';
import { isMuted, playSound, setMuted, type SoundKind } from '@/features/present/sound';
import { useDrawSequence } from '@/features/present/useDrawSequence';
import '@/features/present/present.css';

/** prefers-reduced-motion 판정. matchMedia가 없는 환경(jsdom 등)도 있어 방어적으로 읽는다. */
function readReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    } catch {
      mq = null;
    }
    if (!mq) return;
    const target = mq;
    const onChange = () => setReduced(target.matches);
    target.addEventListener?.('change', onChange);
    return () => target.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/** 모둠별 학생 이름. 스토어 recordAssignment와 같은 구간 나누기다(계약서 4절). */
function groupsFromMapping(mapping: Assignment, data: ClassData): string[][] {
  const sizes = groupLayout.getGroupSizes(data.layoutSettings);
  const groups: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    const members: string[] = [];
    for (let seat = cursor; seat < cursor + size; seat++) {
      const name = mapping[seat];
      if (name) members.push(name);
    }
    if (members.length > 0) groups.push(members);
    cursor += size;
  }
  return groups;
}

/** 지난 배치를 불러오지 못했을 때의 안내(개선 스펙 3-4). */
const STALE_NOTICE = '명단이나 배치가 바뀌어 지난 배치는 불러오지 않았습니다.';

export function PresentPage() {
  const data = useAppStore((s) => s.data);
  const activeClass = useAppStore((s) => s.activeClass);
  const recordAssignment = useAppStore((s) => s.recordAssignment);
  const replaceLastAssignment = useAppStore((s) => s.replaceLastAssignment);
  const update = useAppStore((s) => s.update);
  const pushToast = useToasts((s) => s.push);

  const groupSettings = useGroupSettings((s) => s.settings);
  const loadGroupSettings = useGroupSettings((s) => s.load);
  const recordRoles = useGroupSettings((s) => s.recordRoles);

  const reducedMotion = useReducedMotion();
  const [muted, setMutedState] = useState(() => isMuted());
  const [swapFirst, setSwapFirst] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printFit, setPrintFit] = useState<PrintFit>({ orientation: 'landscape', zoom: 1 });
  const [rolesByStudent, setRolesByStudent] = useState<Record<string, string>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const rolesDrawRef = useRef(0);
  // 교실 TV(1920x1080)에서 뒷자리 학생도 읽을 수 있도록 배치도를 남는 공간만큼 키운다.
  // SeatBoard의 lg 크기가 기준값이고, 여기서는 그 결과를 통째로 확대·축소만 한다.
  const [boardScale, setBoardScale] = useState(1);

  // 처음 열 때 한 번만 지난 배치를 검사한다(개선 스펙 3-4). 교환 저장으로 data가
  // 바뀌어도 다시 검사하지 않는다(useDrawSequence도 initialMapping을 첫 렌더에만 읽는다).
  const [initial] = useState(() => loadableLastAssignment(data));
  const staleNotifiedRef = useRef(false);
  useEffect(() => {
    // StrictMode 개발 모드에서 effect가 두 번 돌아도 안내는 한 번만 띄운다.
    if (!initial.stale || staleNotifiedRef.current) return;
    staleNotifiedRef.current = true;
    pushToast(STALE_NOTICE);
  }, [initial.stale, pushToast]);

  // 배치도를 남는 공간에 맞춰 확대한다. offsetWidth/offsetHeight는 transform 이전의
  // 레이아웃 크기라 확대해도 값이 변하지 않으므로 되먹임 루프가 생기지 않는다.
  useEffect(() => {
    const area = boardAreaRef.current;
    const board = boardRef.current;
    if (!area || !board) return;
    const compute = () => {
      const availW = area.clientWidth;
      const availH = area.clientHeight;
      const naturalW = board.offsetWidth;
      const naturalH = board.offsetHeight;
      if (!availW || !availH || !naturalW || !naturalH) return;
      const next = Math.min(availW / naturalW, availH / naturalH);
      setBoardScale(Math.min(2.6, Math.max(0.4, next)));
    };
    compute();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(compute);
    ro?.observe(area);
    ro?.observe(board);
    window.addEventListener('resize', compute);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  const play = useCallback((kind: SoundKind) => playSound(kind), []);
  const seq = useDrawSequence({
    data,
    onAssigned: recordAssignment,
    onSwapped: replaceLastAssignment,
    initialMapping: initial.mapping,
    reducedMotion,
    playSound: play,
  });

  const teacherView = data.viewPerspective === 'teacher';

  useEffect(() => {
    loadGroupSettings(activeClass);
  }, [activeClass, loadGroupSettings]);

  // 모둠 역할은 뽑기 한 번에 한 번만 배정한다. 자리 교환으로 매핑이 바뀌어도
  // 역할은 학생을 따라가므로 다시 배정하지 않는다(역할이 갑자기 뒤바뀌지 않게).
  // 다시 연 지난 배치(drawId 0)에는 역할을 표시하지 않는다(개선 스펙 3-4 한계).
  useEffect(() => {
    if (seq.drawId === rolesDrawRef.current) return;
    rolesDrawRef.current = seq.drawId;
    if (!seq.mapping || data.layoutType !== 'group') {
      setRolesByStudent({});
      return;
    }
    const groups = groupsFromMapping(seq.mapping, data);
    const { byStudent, relaxed } = assignRoles({
      groups,
      roles: groupSettings.roles,
      roleHistory: groupSettings.roleHistory,
    });
    setRolesByStudent(byStudent);
    recordRoles(byStudent);
    if (relaxed) pushToast('직전과 같은 역할을 피하지 못해 일부 역할이 겹칩니다.');
  }, [seq.drawId, seq.mapping, data, groupSettings.roles, groupSettings.roleHistory, recordRoles, pushToast]);

  const seatRoles = useMemo(() => {
    const out: Record<number, string> = {};
    if (!seq.mapping) return out;
    for (const [seat, name] of Object.entries(seq.mapping)) {
      const role = Object.hasOwn(rolesByStudent, name) ? rolesByStudent[name] : undefined;
      if (role) out[Number(seat)] = role;
    }
    return out;
  }, [seq.mapping, rolesByStudent]);

  const groupNames = useMemo(() => {
    const out: Record<number, string> = {};
    groupSettings.names.forEach((name, i) => {
      if (name) out[i] = name;
    });
    return out;
  }, [groupSettings.names]);

  const isGroup = data.layoutType === 'group';
  const hasResult = seq.mapping !== null;
  // 카운트다운·셔플·줄 공개 중에는 조작 막대를 가린다(자리는 지킨다). 한 명씩 뽑기의
  // 짧은 공개 사이에는 막대를 그대로 두고 버튼만 잠근다(막대가 깜빡이지 않게).
  const drawing = seq.phase === 'countdown' || seq.phase === 'shuffling' || seq.phase === 'revealing';
  const canSwap = hasResult && seq.revealedSeats === 'all' && !seq.running;

  const handleSeatClick = useCallback(
    (seat: number) => {
      if (swapFirst === null) {
        setSwapFirst(seat);
        return;
      }
      if (swapFirst === seat) {
        setSwapFirst(null);
        return;
      }
      const nameA = seq.mapping?.[swapFirst] ?? '빈 자리';
      const nameB = seq.mapping?.[seat] ?? '빈 자리';
      seq.swap(swapFirst, seat);
      setSwapFirst(null);
      pushToast(`${nameA} - ${nameB} 자리를 바꿨습니다.`);
    },
    [pushToast, seq, swapFirst],
  );

  const togglePerspective = useCallback(() => {
    update({ viewPerspective: teacherView ? 'student' : 'teacher' });
  }, [teacherView, update]);

  const toggleSound = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playSound('tick');
  }, [muted]);

  const saveImage = useCallback(() => {
    const root = boardRef.current;
    if (!root) return;
    // renderBoardToCanvas는 getBoundingClientRect로 좌표를 읽는다. 확대된 상태 그대로 읽으면
    // 상자와 글자 비례가 흔들리므로, 캡처하는 동안만 확대를 끄고 원래 크기의 좌표를 읽는다.
    const restore = root.style.transform;
    root.style.transform = 'translate(-50%, -50%)';
    const canvas = renderBoardToCanvas(root, teacherView);
    root.style.transform = restore;
    if (!canvas || typeof canvas.toBlob !== 'function') {
      pushToast('이미지 저장에 실패했습니다.');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        pushToast('이미지 저장에 실패했습니다.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix = teacherView ? '_선생님시선' : '';
      link.download = `자리배치${suffix}_${new Date().toISOString().slice(0, 10)}.${IMAGE_EXT}`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast('이미지로 저장했습니다.');
    }, 'image/png');
  }, [pushToast, teacherView]);

  // 인쇄 용지 방향·배율(개선 스펙 3-3). 화면 배치도의 transform 이전 크기
  // (offsetWidth/offsetHeight)가 인쇄용 배치도와 같은 lg 크기다.
  const measurePrintFit = useCallback(
    (): PrintFit => fitPrintPage(boardRef.current?.offsetWidth ?? 0, boardRef.current?.offsetHeight ?? 0),
    [],
  );

  // 인쇄: 학생 시선·선생님 시선 양면 보기를 만든 뒤 인쇄한다
  // (legacy/js/screens/student-screen.js:788-835와 같은 구성).
  //
  // 양면 보기는 인쇄가 시작되는 순간에만 DOM에 올린다. 화면에는 배치도가 하나뿐이어야
  // 좌석 클릭·이미지 저장·E2E 선택자가 흔들리지 않기 때문이다. 브라우저는 beforeprint를
  // 처리한 뒤에 인쇄용 레이아웃을 잡으므로, 그 안에서 flushSync로 DOM(용지 방향 규칙 포함)을
  // 동기 반영하면 인쇄 버튼뿐 아니라 사용자가 직접 Ctrl+P를 눌러도 같은 결과가 나온다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const before = () =>
      flushSync(() => {
        setPrintFit(measurePrintFit());
        setPrinting(true);
      });
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [measurePrintFit]);

  const handlePrint = useCallback(() => {
    // beforeprint를 지원하지 않는 브라우저를 위해 버튼 경로에서도 직접 올려 둔다.
    flushSync(() => {
      setPrintFit(measurePrintFit());
      setPrinting(true);
    });
    try {
      window.print();
    } catch {
      // 인쇄를 막는 환경(테스트 등)에서는 조용히 넘어간다.
    }
    setPrinting(false);
  }, [measurePrintFit]);

  const highlightSeats = useMemo(() => {
    const out: number[] = [];
    if (swapFirst !== null) out.push(swapFirst);
    if (seq.spotlightSeat !== null) out.push(seq.spotlightSeat);
    return out;
  }, [seq.spotlightSeat, swapFirst]);

  // 조작 막대 상태 칸(고정 높이). 우선순위: 한 명씩 뽑기 이름 > 교환 중 안내 > 기본 안내.
  const status: PresentStatus | null = seq.lotteryName
    ? { text: seq.lotteryName, tone: 'lottery' }
    : swapFirst !== null
      ? { text: `${swapFirst + 1}번 자리를 골랐습니다. 바꿀 자리를 누르세요 (같은 자리를 다시 누르면 취소)`, tone: 'hint' }
      : canSwap
        ? { text: '두 자리를 차례로 누르면 서로 바뀝니다', tone: 'hint' }
        : null;

  const boardProps = {
    data,
    mapping: seq.mapping ?? undefined,
    size: 'lg' as const,
    perspective: data.viewPerspective,
    // 학생이 보는 화면·인쇄물에는 고정 자리를 드러내지 않는다(개선 스펙 3-5).
    showFixed: false,
    groupNames: isGroup ? groupNames : undefined,
    roles: isGroup ? seatRoles : undefined,
  };

  return (
    <main data-page="present" className="flex min-h-screen flex-col texture-cork p-3 md:p-4">
      <div className="present-screen-only mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3">
        {/*
          transform: scale은 그리기만 바꾸고 레이아웃 크기는 그대로 두기 때문에,
          배치도를 일반 흐름에 두면 작은 화면에서 원래 크기만큼 자리를 차지해
          세로 스크롤이 생긴다. 절대 위치로 띄워 남는 공간에만 그린다.
        */}
        <div ref={boardAreaRef} className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={boardRef}
            data-present="board"
            style={{ transform: `translate(-50%, -50%) scale(${boardScale})` }}
            className={`absolute left-1/2 top-1/2 origin-center ${seq.spotlightSeat !== null ? 'present-spotlight' : ''}`}
          >
            <SeatBoard
              {...boardProps}
              revealedSeats={seq.phase === 'idle' || seq.phase === 'failed' ? 'all' : seq.revealedSeats}
              flipping={seq.phase === 'shuffling'}
              highlightSeats={highlightSeats}
              onSeatClick={canSwap ? handleSeatClick : undefined}
            />
          </div>
        </div>

        {seq.failure && (
          <p
            data-present="failure"
            data-reason={seq.failure.reason}
            className="rounded-note bg-paper p-6 text-center font-hand text-[34px] font-bold text-ink shadow-card"
          >
            {seq.failure.detail}
          </p>
        )}

        {/*
          이력 배제 완화 안내는 스토어 recordAssignment가 loadNotice로 세우고
          ToastHost가 토스트로 띄운다. 여기에 배너를 또 두면 같은 말이 두 번 나온다.
        */}

        {seq.violations.length > 0 && (
          <section data-present="violations" className="rounded-note bg-paper p-4 text-ink shadow-card">
            <h2 className="font-hand text-[24px] font-bold">규칙 위반 {seq.violations.length}건</h2>
            <ul className="mt-2 list-disc pl-6 font-body text-[16px]">
              {seq.violations.map((v) => (
                <li key={`${v.kind}-${v.message}`}>{v.message}</li>
              ))}
            </ul>
          </section>
        )}

        <PresentControls
          classLabel={activeClass}
          status={status}
          hidden={drawing}
          hasResult={hasResult}
          running={seq.running}
          lottery={seq.phase === 'lottery'}
          teacherView={teacherView}
          muted={muted}
          onStart={() => void seq.start()}
          onStartLottery={() => void seq.startLottery()}
          onRevealOne={() => void seq.revealOne()}
          onRevealAll={seq.revealAll}
          onTogglePerspective={togglePerspective}
          onToggleSound={toggleSound}
          onSaveImage={saveImage}
          onPrint={handlePrint}
        />
      </div>

      {seq.countdown !== null && (
        <div
          data-present="countdown"
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/70"
        >
          <span className="present-countdown-number font-hand text-[180px] font-bold leading-none text-paper">
            {seq.countdown}
          </span>
        </div>
      )}

      <Confetti active={seq.confetti} />

      {printing && hasResult && (
        <div className="present-print-only">
          {/* 용지 방향은 배치도 모양에 맞춰 고른다(개선 스펙 3-3). 용지 크기는 프린터 설정을 따른다. */}
          <style>{`@page { size: ${printFit.orientation}; margin: ${PRINT_MARGIN_MM}mm; }`}</style>
          {/* 한 배치도가 페이지 경계에서 잘리지 않도록 시점별로 한 장씩 나눈다. */}
          <section className="present-print-page">
            <p className="present-print-title font-body text-[18px] font-bold text-ink">[ {activeClass} · 학생 시선 ]</p>
            <div className="present-print-board" style={{ zoom: printFit.zoom }}>
              <SeatBoard {...boardProps} perspective="student" />
            </div>
          </section>
          <section className="present-print-page">
            <p className="present-print-title font-body text-[18px] font-bold text-ink">[ {activeClass} · 선생님 시선 ]</p>
            <div className="present-print-board" style={{ zoom: printFit.zoom }}>
              <SeatBoard {...boardProps} perspective="teacher" />
            </div>
          </section>
        </div>
      )}

      <ToastHost />
    </main>
  );
}
```

- [ ] **Step 9: 구현 — `src/features/present/present.css`** — `@media print { ... }` 블록을 아래로 교체한다(파일의 다른 부분은 그대로).

```css
@media print {
  .present-screen-only {
    display: none !important;
  }
  .present-print-only {
    display: block !important;
    /* 칠판은 어두운 바탕에 밝은 글씨라 배경을 빼고 인쇄하면 글자가 사라진다.
       배치도 영역만 색을 그대로 내보낸다. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /*
   * 코르크 질감은 종이에서 잉크만 먹고 대비를 떨어뜨린다. 인쇄는 흰 바탕으로.
   * body 배경은 인쇄면 전체(캔버스)로 번지므로 함께 지운다. globals.css는
   * 건드리지 않고, 이 파일을 읽는 발표 화면의 인쇄에서만 덮어쓴다.
   */
  body {
    background: #ffffff !important;
  }
  [data-page='present'] {
    background: #ffffff !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
  /* 컨페티 캔버스는 화면 전체를 덮는 fixed 요소라 인쇄면을 가린다. */
  .present-confetti {
    display: none !important;
  }
  /* 토스트도 fixed라 모든 장에 찍힌다(실측으로 찾은 결함). */
  [data-cork='toast'] {
    display: none !important;
  }
  /* 제목 줄 높이 = printFit.ts의 PRINT_TITLE_PX(32 + 8 = 40px). 두 값을 함께 바꾼다. */
  .present-print-title {
    height: 32px;
    line-height: 32px;
    margin: 0 0 8px;
  }
  /* 배치도를 가운데에 둔다. 배율(zoom)과 용지 방향(@page)은 PresentPage가 fitPrintPage로 정한다. */
  .present-print-board {
    width: fit-content;
    margin: 0 auto;
  }
  /* 배치도 한 장이 페이지 경계에서 잘리지 않게 하고, 시점마다 새 장에서 시작한다. */
  .present-print-page {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .present-print-page + .present-print-page {
    break-before: page;
    page-break-before: always;
  }
}
```

(기존의 `@page { margin: 12mm; }`는 지운다. 여백은 PresentPage가 넣는 `@page` 규칙 하나로만 정한다.)

- [ ] **Step 10: 통과 확인**

Run: `npx vitest run src/features/present`
Expected: PASS (새 테스트 + 기존 useDrawSequence·lastAssignment·printFit 포함)

- [ ] **Step 11: 눈 확인(필수)** — Task 3 Step 8과 같은 방식(저장소 밖 즉석 스크립트, TEMP/TMP ASCII)으로 `npm run build` + preview 후 `v1-basic.json` 픽스처를 넣고 `/present`를 1920x1080, 1920x937, 1366x625에서 찍어 본다(뽑기 전 지난 배치 상태와 "다시 뽑기" 후). 확인: 제목 칠판 없음 / 막대가 한 줄이고 상태 칸 문구가 보임 / 배치도가 가로를 넓게 씀 / 금색 점 없음 / 좌석 클릭 시 배치도가 움직이지 않음(첫 클릭 전후 `[data-present="board"]`의 transform이 같음). `window.dispatchEvent(new Event('beforeprint'))` 후 `page.pdf({ preferCSSPageSize: true, printBackground: true })`로 PDF를 만들어 Read 도구로 열어 가로 2장·토스트 없음을 본다.

- [ ] **Step 12: 게이트 + 커밋**

Run: `npm run gate` → PASS

```bash
git add src/features/present/useFullscreen.ts src/features/present/PresentControls.tsx src/features/present/PresentControls.test.tsx src/features/present/boardImage.ts src/features/present/boardImage.test.ts src/pages/PresentPage.tsx src/features/present/present.css src/features/present/PresentPage.test.tsx
git commit -m "feat(present): 배치도가 화면을 채우게 틀을 줄이고, 지난 배치 열기·인쇄 용지 맞춤·전체 화면을 잇는다"
```

---

### Task 5: E2E (impl-m)

**Files:**
- Modify: `e2e/present-draw.spec.ts` (첫 테스트 교체)
- Create: `e2e/present-tv.spec.ts`

**Interfaces:**
- Consumes: Contracts의 발표 화면 DOM, 픽스처 `src/test/fixtures/v1-basic.json`(exam 6x4, 학생 22명, 지난 배치 좌석 0~21, 김하람 1번 자리 고정, 이력 1건, 1번=김하람·2번=이도윤·3번=박서준, 좌석 번호는 0부터)
- Produces: 없음

- [ ] **Step 1: `e2e/present-draw.spec.ts` 첫 테스트 교체** — `test('뽑기를 완주하면 모든 이름이 공개되고 결과가 저장된다', ...)`를 아래로 바꾼다(`beforeEach`, 나머지 테스트는 그대로).

```ts
test('지난 배치가 보이고, 다시 뽑으면 새 결과가 저장된다', async ({ page }) => {
  await page.goto('/present');
  const board = page.getByTestId('seat-board');
  await expect(board).toBeVisible();

  // 저장된 지난 배치가 공개된 채로 열린다(개선 스펙 3-4)
  await expect(board).toContainText('김하람');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));

  await page.getByRole('button', { name: '다시 뽑기' }).click();

  // 연출 중 결과가 저장되면 lastAssignment가 새것으로 바뀌고 직전 배치가 이력으로 간다
  await expect
    .poll(
      async () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!).lastAssignment.timestamp),
      { timeout: 20_000 },
    )
    .not.toBe(before.lastAssignment.timestamp);
  // 연출이 끝나면 조작 막대가 다시 보인다
  await expect(page.locator('[data-present="controls"]')).not.toHaveClass(/invisible/, { timeout: 20_000 });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(Object.keys(saved.lastAssignment.mapping).length).toBe(22);
  expect(saved.assignmentHistory.length).toBe(Math.min(before.assignmentHistory.length + 1, 5));
  await expect(board).toContainText('김하람');

  await page.screenshot({ path: 'test-results/present-drawn.png' });
});
```

- [ ] **Step 2: `e2e/present-tv.spec.ts` 작성**

```ts
// TV 가독성·가로 배치·자리 바꾸기·고정 표시 (개선 스펙 2026-09-28 5절)
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const v1 = JSON.parse(readFileSync('src/test/fixtures/v1-basic.json', 'utf8'));
const KEY = 'seat-changer-data-6-7';

/**
 * 픽스처를 한 번만 심는다. addInitScript는 새로고침마다 다시 돌므로, sessionStorage 표시로
 * 첫 탐색에서만 쓰게 해야 "새로고침 뒤에도 남는다"를 확인할 수 있다.
 */
async function seed(page: Page, data: unknown): Promise<void> {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    localStorage.setItem('seat-changer-classes', '["6-7"]');
    localStorage.setItem('seat-changer-active', '6-7');
    localStorage.setItem('seat-changer-data-6-7', raw);
    localStorage.setItem('seat-changer-sound', 'off');
  }, JSON.stringify(data));
}

const seat = (page: Page, i: number) =>
  page.locator(`[data-present="board"] [data-cork="note-seat"][data-seat="${i}"]`);

/** 화면에 실제로 그려지는 이름 글자 크기 = 글자 크기 x 배치도 배율 */
async function nameFontOnScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-present="board"]')!;
    const scale = Number(/scale\(([\d.]+)\)/.exec(board.style.transform)?.[1] ?? '1');
    const name = board.querySelector<HTMLElement>('[data-seat-name]')!;
    return parseFloat(getComputedStyle(name).fontSize) * scale;
  });
}

test('지난 배치에서 두 자리를 바꾸면 새로고침 뒤에도 남고 기록은 늘지 않는다', async ({ page }) => {
  await seed(page, v1);
  await page.goto('/present');
  const status = page.locator('[data-present="status"]');

  await expect(seat(page, 1)).toContainText('이도윤');
  await expect(seat(page, 2)).toContainText('박서준');
  await expect(status).toHaveText('두 자리를 차례로 누르면 서로 바뀝니다');

  // 첫 자리를 눌러도 배치도가 움직이지 않는다(상태 칸 높이 고정)
  const transformBefore = await page.locator('[data-present="board"]').getAttribute('style');
  await seat(page, 1).click();
  await expect(status).toContainText('2번 자리를 골랐습니다');
  expect(await page.locator('[data-present="board"]').getAttribute('style')).toBe(transformBefore);

  await seat(page, 2).click();
  await expect(seat(page, 1)).toContainText('박서준');
  await expect(seat(page, 2)).toContainText('이도윤');

  await page.reload();
  await expect(seat(page, 1)).toContainText('박서준');
  await expect(seat(page, 2)).toContainText('이도윤');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
  expect(saved.assignmentHistory).toHaveLength(v1.assignmentHistory.length);
  expect(saved.lastAssignment.timestamp).toBe(v1.lastAssignment.timestamp);
});

for (const vp of [
  { width: 1920, height: 1080, minFont: 60, minWidthRatio: 0.7 },
  { width: 1366, height: 625, minFont: 34, minWidthRatio: 0.6 },
]) {
  test(`${vp.width}x${vp.height}에서 이름이 ${vp.minFont}px 이상이고 배치도가 가로를 넓게 쓴다`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seed(page, v1);
    await page.goto('/present');
    await expect(page.locator('[data-seat-name]').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    expect(await nameFontOnScreen(page)).toBeGreaterThanOrEqual(vp.minFont);
    const box = await page.locator('[data-present="board"]').boundingBox();
    expect(box!.width / vp.width).toBeGreaterThanOrEqual(vp.minWidthRatio);
    // 세로 스크롤 없이 한 화면에 들어간다
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    );
    expect(overflow).toBe(false);

    await page.screenshot({ path: `test-results/present-tv-${vp.width}x${vp.height}.png` });
  });
}

test('U자 배치 자리는 교사 화면과 발표 화면 모두에서 겹치지 않는다', async ({ page }) => {
  // 22명이 앉도록 윗줄 8 + 옆줄 7 x 2 = 22석
  const ushape = {
    ...v1,
    layoutType: 'ushape',
    layoutSettings: { ...v1.layoutSettings, columns: 8, rows: 7 },
    lastAssignment: null,
    assignmentHistory: [],
  };
  await seed(page, ushape);
  for (const url of ['/', '/present']) {
    await page.goto(url);
    const seats = page.locator('[data-testid="seat-board"] [data-cork="note-seat"]');
    await expect(seats).toHaveCount(22);
    const boxes = await seats.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
        expect(apart, `${url}: 좌석 상자 ${i}와 ${j}가 겹친다`).toBe(true);
      }
    }
    await page.screenshot({ path: `test-results/ushape-${url === '/' ? 'teacher' : 'present'}.png` });
  }
});

test('인쇄는 가로 용지 두 장(학생 시선·선생님 시선)이다', async ({ page }) => {
  await seed(page, v1);
  await page.goto('/present');
  await expect(page.locator('[data-seat-name]').first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.present-print-page')).toHaveCount(2);

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  // Chromium(Skia) PDF의 페이지 사전은 압축되지 않아 /MediaBox가 평문으로 들어 있다.
  const text = pdf.toString('latin1');
  const pages = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  expect(pages).toHaveLength(2);
  for (const [w, h] of pages) expect(w).toBeGreaterThan(h!);
});

test('고정 자리 표시는 교사 화면에만 있고 발표 화면·인쇄에는 없다', async ({ page }) => {
  await seed(page, v1); // 김하람이 1번 자리(좌석 0)에 고정
  const pins = page.locator('[data-testid="seat-board"] [data-cork="pushpin"]');

  await page.goto('/');
  await expect(pins).toHaveCount(1);

  await page.goto('/present');
  await expect(page.locator('[data-seat-name]').first()).toBeVisible();
  await expect(pins).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.present-print-page')).toHaveCount(2);
  await expect(pins).toHaveCount(0);
});
```

- [ ] **Step 3: 실행**

Run: `npm run e2e`
Expected: 전체 PASS(dev-cork·teacher-flow·present-draw·custom-desk-editor·v1-data-load·present-tv). PDF 정규식이 실제 출력과 안 맞으면(0장) `pdf.toString('latin1')`에서 `/MediaBox` 주변을 출력해 형식을 보고 정규식만 고친다. 다른 단정은 스펙 기준이므로 바꾸지 말고, 실패하면 원인을 보고한다.

- [ ] **Step 4: 스크린샷 확인** — `test-results/present-tv-1920x1080.png`, `present-tv-1366x625.png`, `ushape-teacher.png`, `ushape-present.png`, `present-drawn.png`를 Read 도구로 열어 본다(겹침·잘림·금색 점이 없는지).

- [ ] **Step 5: 커밋**

```bash
git add e2e/present-draw.spec.ts e2e/present-tv.spec.ts
git commit -m "test(e2e): 지난 배치 교환 유지·TV 글자 크기·U자 겹침·인쇄 가로·고정 표시"
```

---

## 검증 단계 (Opus 5.5 max, 개발과 분리)

검증자는 코드를 고치지 않는다(저장소 밖 스크래치만). 목표는 반례를 찾는 것이다.

1. `npm run gate`, `npm run e2e` 전체 실행 결과.
2. 스펙 대조: 스펙 2절 결정과 3-1~3-5의 항목마다 구현 위치와 충족 여부.
3. 눈 확인: preview 서버 + 즉석 Playwright(TEMP/TMP ASCII)로 배치 5종(exam 6x4·pair·group 4인 6모둠·ushape 8x7·custom) x 화면 3종(1920x1080, 1920x937, 1366x625)의 `/present`를 찍어 직접 본다. 교사 화면 U자, 인쇄 PDF(가로 여부·한 장씩·토스트·금색 점), 한 명씩 뽑기 중 상태 칸 이름, 카운트다운 중 막대 자리 유지(배율 불변), 좌석 첫 클릭 시 배치도 불변, 지난 배치 불러오기 실패 토스트(StrictMode에서 한 번만), "다시 뽑기" 후 이력 +1, 교환 후 이력 불변을 확인.
4. 코드 리뷰: 정확성 결함, 회귀(교사 화면·이미지 저장·편집기), 접근성(label-in-name·포커스), 제약(이모지 스캔·Tailwind 리터럴·대비).
5. 보고 형식: 항목마다 등급(P0 출시 차단 / P1 실제 결함: 유실·크래시·오표시 / P2 경미), 근거(파일:행, 재현 절차, 스크린샷 경로), 제안 수정.

## 반영 결정 (기획)

기획이 검증 보고를 읽고 항목별로 반영/보류를 정한다. 기준: P0·P1(유실·크래시·오결과·오표시)은 반영, P2는 보류 목록으로만 남긴다(재검토 루프 없음). 반영 항목만 파일 소유권을 나눠 impl-*에 위임하고, 수정 후 최종 검증(게이트·E2E·해당 화면 재확인)을 한 번 더 한다.

### Task 6: 배포 (메인)

- [ ] `git status`가 깨끗하고 `npm run gate`·`npm run e2e`가 통과한 상태를 확인한다.
- [ ] `git switch master && git merge --ff-only feat/tv-landscape-swap && git push origin master`
- [ ] Vercel 프로덕션 배포가 master 커밋으로 READY인지 확인한다(Vercel 도구로 배포 목록 확인).
- [ ] 라이브(https://seat-changer-two.vercel.app)에서 `v1-basic.json`을 심고 `/present`를 1920x1080으로 찍어 확인한다: 지난 배치 표시·이름 60px 이상·금색 점 없음·콘솔 오류 없음.
- [ ] 메모리(`project_seat_changer_v2.md`)에 이번 개선과 남은 한계를 갱신한다.
