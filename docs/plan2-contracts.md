# 계획 2 공용 계약서 (모든 구현 에이전트 필독)

이 문서는 병렬로 작업하는 여러 에이전트가 서로의 파일을 보지 않고도 조립되도록
인터페이스를 미리 고정한 것이다. **여기 적힌 시그니처는 협상 불가. 그대로 구현한다.**

## 0. 절대 규칙

- **이모지 전면 금지.** 소스·주석·테스트·문자열 어디에도 금지. 아이콘은 `lucide-react`만.
  화살표도 금지(U+2194 등은 스캐너가 잡는다). 허용 기호는 `->`, `-` 같은 ASCII.
- **이미지 파일 금지.** 질감은 CSS 그라디언트/의사요소로만.
- `src/core/**`는 React·zustand·컴포넌트를 import 하지 않는다(ESLint가 막는다).
  순수 TS 로직만. 브라우저 API도 금지.
- 게이트: `npm run typecheck && npm run lint && npm run test && npm run scan` 전부 통과해야 한다.
  본인 담당 파일에 대한 테스트를 함께 쓴다(과하지 않게, 핵심 동작 위주).
- 저장소 안에 임시 파일(`_tmp-*`)을 만들지 않는다.
- **본인에게 배정된 파일만 만들거나 고친다.** 다른 Task 파일은 읽기만 한다.
  `src/pages/TeacherPage.tsx`, `src/pages/PresentPage.tsx`, `src/App.tsx`는 T6 담당이다.

## 1. 디자인 토큰 (src/styles/globals.css에 이미 있음)

색: `cork`(#C8955A) `cork-dark`(#7B5130) `paper`(#FFFBF0) `paper-2`(#FDE6B8)
`paper-3`(#E8F1D9) `chalk`(#2E5A4E) `chalk-text`(#F3F0E6) `ink`(#2A211B)
`mute`(#7A6A5C) `apple`(#D2553D) `gold`(#E4B04A)
→ Tailwind에서 `bg-paper`, `text-ink`, `border-cork-dark` 처럼 쓴다.

글꼴: `font-hand`(Gaegu, 제목·이름표), `font-body`(Noto Sans KR, 본문·입력)
반경/그림자: `rounded-note`, `shadow-note`, `shadow-card`
질감 유틸: `texture-cork`, `texture-paper-lines`, `texture-wood`
기울기 유틸: `tilt-l`, `tilt-r`, `tilt-note-a/b/c`

**대비 판결(위반 금지)**
- cork 배경 위 글자는 반드시 `text-ink`. `text-paper` 금지(2.57:1).
- 칠판(`#26443C`)·`bg-chalk` 위는 `text-chalk-text`.
- `bg-cork-dark` 위는 `text-paper` 또는 `text-chalk-text`.
- 글자에 `opacity-50` 금지. 위계는 font-weight/색(`text-mute`)으로.
- 핸들러가 없는 `<button>`은 네이티브 `disabled`를 준다(죽은 탭 스톱 금지).
- `aria-label`은 화면에 보이는 문구를 포함한다.
- 장식용 `aria-hidden` 요소는 `pointer-events-none`을 함께 준다.
- 애니메이션은 `prefers-reduced-motion`에서 `animation: none`(globals.css가 전역 처리하므로
  **정지 상태에서도 내용이 보이도록** 만들어야 한다. 초기 `opacity:0` + 애니메이션으로만 보이게 하는 패턴 금지).

## 2. 기존 코드 (읽기 전용, 그대로 쓴다)

### 스토어 `src/store/useAppStore.ts`
```ts
useAppStore((s) => s.data)            // ClassData
useAppStore((s) => s.classes)         // string[]
useAppStore((s) => s.activeClass)     // string
useAppStore((s) => s.loadNotice)      // string | null
// 액션 (선택자로 꺼내 쓴다)
addClass(name): boolean
renameClass(oldName, newName): boolean
removeClass(name): boolean
switchClass(name): void
duplicateClass(src, newName): boolean
update(partial: Partial<ClassData>): void
updateLayoutSettings(partial: Partial<LayoutSettings>): void
setStudents(names: string[]): void
deleteSeat(seatIndex): void
restoreSeat(seatIndex): void
restoreAllSeats(): void
setGridSize(columns, rows): { clearedDisabled: number }   // 행·열 변경은 반드시 이것으로 (R83)
recordAssignment(mapping, historyFallback): void
exportJSON(): string
importJSON(json): { ok: boolean; error?: string }
clearNotice(): void
```
- **Undo/Redo**: `import { useTemporal } from '@/store/useAppStore'` → `const { undo, redo, pastStates, futureStates } = useTemporal()`.
  **반드시 컴포넌트 렌더 안에서 호출한다**(모듈 최상위 금지).
  Undo 대상은 `layoutType/layoutSettings/fixedSeats/separationRules/genderRule/studentGenders`뿐이다.
- 반 이름은 스토어에 넘기기 전에 `.trim()` 해서 넘긴다(레거시 중복 검사가 트림 전 이름을 본다).

### 코어 `src/core/**`
```ts
import type { ClassData, LayoutSettings, LayoutType, Assignment, FixedSeat,
              SeparationRule, GenderRule, Gender } from '@/core/model/types';
import { getLayout, getTotalSeats, layouts } from '@/core/layouts';
import type { SeatPosition } from '@/core/layouts/types';
import { randomizeSeats, verifyAssignment } from '@/core/randomizer';
import type { RandomizeResult, Violation } from '@/core/randomizer';

getLayout(type).getSeatPositions(settings): SeatPosition[]   // {index,row,col,pairCol?,arcPos?,px?,py?,groupIndex?}
getTotalSeats(data): number                                   // 비활성 좌석 제외한 사용 가능 좌석 수
await randomizeSeats(data): Promise<RandomizeResult>
  // { ok:true, mapping, historyFallback } | { ok:false, reason:'no-layout'|'no-students'|'capacity'|'constraints', detail }
verifyAssignment(mapping, data): Violation[]                  // { kind:'fixed'|'separation'|'gender'|'capacity', message }
```

### 코르크 부품 `src/components/cork/`
```ts
<PaperCard title badge? tilt?={'l'|'r'|'none'} pin?={boolean} className?>{children}</PaperCard>
<NoteSeat index name? state={'empty'|'assigned'|'fixed'|'disabled'} size?={'sm'|'lg'}
          variant?={0|1|2} onClick? onRestore? highlight? />
<ChalkBoard>{...}</ChalkBoard>            // 칠판/교탁 라벨, 나무 프레임
<WoodButton variant?={'primary'|'secondary'|'danger'} size?={'sm'|'md'|'lg'} icon?={ReactNode} ...buttonProps />
<PushPin color? /> <Tape side? />
```
정확한 props는 각 파일을 직접 읽어 확인할 것.

## 3. 이번에 새로 만드는 공용 인터페이스 (담당자 외에는 **호출만** 한다)

### 3-1. 토스트 — T4 담당, 파일 `src/store/useToasts.ts`, `src/components/Toast.tsx`
```ts
// src/store/useToasts.ts  (독립 zustand 스토어. persist 없음)
export interface ToastItem { id: number; message: string; actionLabel?: string; onAction?: () => void }
export const useToasts: UseBoundStore<StoreApi<{
  items: ToastItem[];
  push(message: string, action?: { label: string; onAction: () => void }): number;
  dismiss(id: number): void;
}>>;
// 사용 예 (어느 컴포넌트에서든)
const push = useToasts((s) => s.push);
push('3번 자리를 삭제했습니다.', { label: '되돌리기', onAction: () => restoreSeat(3) });

// src/components/Toast.tsx
export function ToastHost(): JSX.Element;   // 스토어를 직접 구독. props 없음. 화면 우하단 고정.
```
- 큐 방식(R83): 동시에 여러 개가 쌓일 수 있고, 각 항목은 5초 뒤 자동 사라진다.
  액션 버튼이 있는 항목은 자동 소멸 8초.
- `loadNotice`도 T4가 `ToastHost` 안에서 감시해 토스트로 띄우고 `clearNotice()`를 호출한다.

### 3-2. 배치도 — T1 담당, 파일 `src/features/layout/SeatBoard.tsx`
```ts
export interface SeatBoardProps {
  data: ClassData;
  mapping?: Assignment;                   // 없으면 전부 빈 자리
  size?: 'sm' | 'lg';                     // sm=교사 화면 미리보기(기본), lg=발표 화면
  perspective?: 'student' | 'teacher';    // 기본 'student'
  highlightSeats?: number[];              // 강조(ring-ink) 좌석 인덱스
  fixedMode?: boolean;                    // true면 고정 자리 지정 모드(고정 좌석에 PushPin 강조)
  editable?: boolean;                     // true면 좌석 삭제/복구 UI 활성 (기본 false)
  onSeatClick?: (seatIndex: number) => void;
  onSeatRestore?: (seatIndex: number) => void;
  groupNames?: Record<number, string>;    // groupIndex -> 모둠 이름 (group 배치에서만)
  roles?: Record<number, string>;         // seatIndex -> 역할 라벨. 이름표 하단 작은 글씨
  revealedSeats?: 'all' | number[];       // 기본 'all'. 배열이면 그 좌석만 앞면, 나머지는 뒷면(빈 종이)
  flipping?: boolean;                     // true면 셔플/뒤집기 연출 클래스 부여
  className?: string;
}
export function SeatBoard(props: SeatBoardProps): JSX.Element;
```
동작 규정:
- 좌표는 반드시 `getLayout(data.layoutType).getSeatPositions(data.layoutSettings)`로 얻는다. 직접 계산 금지.
- `perspective==='teacher'`면 좌석 순서를 **행 역순·열 역순**으로 정렬하고(레거시 exam-layout.js와 동일),
  칠판 라벨을 위가 아니라 아래에 `교 탁`으로 놓는다. `student`면 위에 `칠 판`.
- 배치별 배열:
  - `exam`: `grid-template-columns: repeat(columns, auto)`
  - `pair`: 같은 `row` 안에서 2칸씩 묶고 짝 사이 간격을 좁게, 짝 그룹 사이는 넓게(`pairCol` 사용)
  - `ushape`: `arcPos`(0~1)를 각도로 매핑해 절대 위치 배치(컨테이너는 `relative`, 좌석은 `absolute`)
  - `custom`: `px`,`py`를 절대 위치로 사용
  - `group`: `groupIndex`로 묶어 모둠 블록을 격자로 놓고, 블록 상단에 `groupNames[groupIndex]` 팻말
- 비활성 좌석(`layoutSettings.disabledSeats`)은 `editable`이면 `NoteSeat state="disabled"` + `onSeatRestore`로
  되살릴 수 있게, `editable`이 false면 같은 자리를 빈 공간으로 남기되 격자 흐름은 유지한다.
- 고정 좌석은 `state="fixed"`.
- `revealedSeats`가 배열일 때 미공개 좌석은 이름을 렌더하지 않는다(뒷면). DOM에 이름 문자열이 남으면 안 된다.
- `data-seat={index}` 속성을 각 좌석에 준다(E2E용). 루트에 `data-testid="seat-board"`.

### 3-3. 역할 배정 순수 로직 — T3 담당, 파일 `src/core/groups/roles.ts`
```ts
export const DEFAULT_ROLES: string[];            // ['모둠장','기록이','발표자','시간지기']
export const GROUP_NAME_PRESETS: Record<'animal'|'color'|'planet'|'fruit', string[]>;
export interface RoleAssignInput {
  groups: string[][];                            // 모둠별 학생 이름
  roles: string[];
  roleHistory: Record<string, string[]>;         // 학생 -> 최근 역할 (최신이 앞)
  rng?: () => number;
}
export function assignRoles(input: RoleAssignInput): {
  byStudent: Record<string, string>;             // 학생 -> 역할 (역할이 모자라면 없음)
  relaxed: boolean;                              // 직전 역할 회피에 실패해 중복 허용했으면 true
};
export function pickGroupNames(count: number, pool: string[], rng?: () => number): string[];
```
- `src/core/groups/roles.test.ts`도 함께 쓴다. React import 금지.

### 3-4. 카드 컴포넌트 (T6이 조립한다. 전부 **props 없음**, 스토어를 직접 읽고 쓴다)
```ts
// T2
export function RosterCard(): JSX.Element;      // src/features/roster/RosterCard.tsx
// T3
export function LayoutCard(): JSX.Element;      // src/features/layout/LayoutCard.tsx  <- T1 담당
export function RulesCard(): JSX.Element;       // src/features/rules/RulesCard.tsx
export function GroupsCard(): JSX.Element;      // src/features/groups/GroupsCard.tsx
// T4
export function ClassBar(): JSX.Element;        // src/features/classes/ClassBar.tsx
export function HistoryCard(): JSX.Element;     // src/features/history/HistoryCard.tsx
```
각 카드는 바깥을 `<PaperCard title="...">`로 감싸고, 루트에 `data-card="roster"` 같은 식별자를 준다.

### 3-5. 단계 완료 판정 — T6 담당, 파일 `src/features/check/progress.ts`
```ts
export type StepKey = 'roster' | 'layout' | 'rules' | 'check';
export function stepDone(data: ClassData): Record<StepKey, boolean>;
```

## 4. 좌석/모둠 계산 참고

- 모둠 배치에서 모둠별 좌석 구간은 `layoutSettings.groupSizes`를 순서대로 누적한 구간이다
  (스토어 `recordAssignment`가 쓰는 방식과 동일). `groupSizes`가 비면 `groupSize`x`groupCount`로 균등 분할.
- 좌석 수 계산은 항상 `getTotalSeats(data)`. `columns*rows` 직접 계산 금지.
