# 자리바꾸기 v2 설계 스펙

- 작성일: 2026-09-02
- 대상: https://seat-changer-two.vercel.app (989-alt/seat-changer)
- 상태: 사용자 승인 대기 → 승인 후 writing-plans로 구현 계획 작성

## 0. 배경과 목표

현재 앱은 순수 JS 18개 모듈을 `build.js`가 `bundle.js` 하나로 이어 붙이는 구조다. 교사 화면 913줄, 학생 화면 1,169줄에 UI·상태·저장 로직이 섞여 있고 UI 테스트가 없다. 현장 교사 피드백 5건(좌석 삭제 후 복구 불가 4건, "미리 뽑기 테스트" 혼란 1건)은 **긴급 수정 트랙(A)** 에서 현재 코드 위에 먼저 고쳐 배포한다. 이 문서는 그 다음 단계인 **React 재작성 트랙(B)** 의 설계다.

목표:

1. 기능은 현재 앱과 1:1로 유지하고, 기존 localStorage 데이터와 JSON 백업 파일을 그대로 읽는다.
2. 비주얼 아이덴티티를 "코르크보드" 로 새로 잡는다. 이모지는 쓰지 않는다.
3. 좌석 복구·전역 Undo/Redo, 뽑기 연출 강화, 모둠 이름·역할 배정을 추가한다.
4. 모든 작업 단위에 자동 검증 게이트를 두고, 게이트를 통과할 때까지 도는 루프 구조로 구현한다.

비목표(YAGNI): 서버·로그인·사진 업로드·PWA 오프라인 설치·file:// 더블클릭 실행.

## 1. 구조와 라우팅

- Vite + React 19 + TypeScript SPA. 라우팅은 react-router 없이 `/`와 `/present` 두 경로만 `window.location.pathname` 기준으로 분기한다(Vercel `rewrites`로 모든 경로를 `index.html`로).
  - `/` 교사 설정 화면
  - `/present` 발표 화면(전체화면 전제, 학생들이 보는 화면)
- 폴더 구조

```
src/
  core/            # UI 무관 순수 TS. React import 금지(ESLint 규칙으로 강제)
    model/         # 타입, zod 스키마, 기본값, 마이그레이션
    layouts/       # exam · pair · ushape · custom · group 좌표·거리 계산
    randomizer/    # 배정 알고리즘, 제약 검증, 이력 배제
    storage/       # localStorage 어댑터, 반 관리, JSON 내보내기·가져오기
  store/           # Zustand 스토어(persist + zundo)
  features/
    roster/        # 명단 입력·파일 불러오기(csv/hwp/hwpx/xml)·성별
    layout/        # 배치 5종 편집기, 좌석 삭제·복구
    rules/         # 고정 자리, 분리 규칙, 성별 규칙, 이력 배제 설정
    check/         # 규칙 검사(미리보기)
    present/       # 발표 화면: 뽑기 연출, 러티 모드, 자리 교환, 인쇄·이미지 저장
    groups/        # 모둠 이름·역할 배정
    classes/       # 다반 관리
  components/
    ui/            # shadcn/ui 생성물
    cork/          # PaperCard, NoteSeat, ChalkBoard, WoodButton, PushPin, Tape
    motion/        # Aceternity·ReactBits에서 가져와 손본 애니메이션 컴포넌트
  pages/           # TeacherPage, PresentPage
```

- `core/`는 브라우저 API에 의존하지 않는다(`localStorage`는 `storage/` 어댑터 인터페이스 뒤에 숨긴다). 그래야 Vitest에서 DOM 없이 돈다.

## 2. 상태와 데이터 호환

- Zustand 스토어 하나. 상태는 `{ classes: string[], activeClass: string, data: Record<className, ClassData> }`.
- persist 미들웨어는 기존 키를 그대로 쓴다: `seat-changer-classes`, `seat-changer-active`, `seat-changer-data-<반이름>`. 새 키를 만들지 않는다.
- `ClassData`에 `schemaVersion: 2`를 추가한다. 로드 시:
  1. `schemaVersion` 없음 → v1로 간주, `migrateV1toV2()` 적용(필드 기본값 채움, `disabledSeats` 정수 배열 보장, prototype 오염 키 제거).
  2. zod `ClassDataSchema.safeParse`. 실패 시 해당 반은 기본값으로 대체하고 사용자에게 "저장 데이터를 읽지 못해 초기화했습니다. 백업 JSON이 있으면 불러오세요" 토스트.
- JSON 내보내기는 v2 스키마로 쓰고, 가져오기는 v1·v2 모두 받는다(같은 마이그레이션 함수 재사용).
- Undo/Redo: zundo(temporal) 미들웨어를 `layoutSettings`·`fixedSeats`·`separationRules`에만 건다. 명단·이력·배정 결과는 Undo 대상이 아니다. 스택 깊이 50. 단축키 Ctrl+Z / Ctrl+Shift+Z. 좌석 삭제 직후 토스트에도 "되돌리기" 버튼을 둔다.
- 좌석 삭제·복구 규칙: 삭제된 좌석은 점선 이름표 자리로 렌더되고 클릭하면 복구된다. 배치 카드에 "삭제한 자리 모두 복구 (N개)" 버튼. 행·열 변경 시 `disabledSeats`를 비우고 안내 토스트.

## 3. 알고리즘 이식

- `seat-randomizer.js`, `layout-engine.js`, 배치 5종의 `getSeatPositions / getSeatCount / distance`를 타입이 있는 순수 TS로 옮긴다. 로직은 바꾸지 않는다.
- `test-logic.mjs`의 모든 케이스를 Vitest로 이식한다. 같은 입력·같은 시드에서 같은 결과가 나오도록 난수 생성기를 주입 가능하게 만든다(`randomizeSeats(data, { rng })`). 골든 테스트는 시드 고정으로 v1 결과와 비교한다.
- 보강 한 가지: 배정 실패 시 `null` 대신 `{ ok: false, reason: 'separation' | 'gender' | 'history' | 'capacity', detail }`를 반환해 UI가 원인을 말해 준다.

## 4. 디자인 시스템 (코르크보드)

- 토큰(Tailwind `theme.extend.colors`)

| 토큰 | 값 | 용도 |
|---|---|---|
| cork | #C8955A | 바탕(코르크판) |
| cork-dark | #7B5130 | 판 테두리, 나무 |
| paper | #FFFBF0 | 종이 카드·이름표 |
| paper-2 | #FDE6B8 | 이름표 변주 |
| paper-3 | #E8F1D9 | 이름표 변주 |
| chalk | #2E5A4E | 칠판, 주요 버튼 |
| chalk-text | #F3F0E6 | 칠판 글자 |
| ink | #2A211B | 본문 글자 |
| mute | #7A6A5C | 보조 글자 |
| apple | #D2553D | 뽑기 버튼, 삭제·경고 |
| gold | #E4B04A | 고정 자리, 활성 탭 |

- 글꼴: Gaegu(손글씨, 카드 제목·이름표·탭), Noto Sans KR(본문·입력). Google Fonts 링크.
- 아이콘: lucide-react만. 이모지 전면 금지(ESLint 커스텀 규칙 + CI 스캔 게이트).
- 질감: 코르크·종이 줄·테이프·압정은 전부 CSS 그라디언트와 의사요소로 그린다. 이미지 파일 없음.
- 핵심 컴포넌트
  - `PaperCard`: 줄 노트 배경, 상단 압정, ±1° 기울기(시각 변주는 `index % 3`으로 결정).
  - `NoteSeat`: 테이프 조각이 붙은 이름표. 상태: empty / assigned / fixed(PushPin) / disabled(점선, "되살리기").
  - `ChalkBoard`: 칠판 또는 교탁 라벨. 나무 프레임.
  - `WoodButton`: 나무 팻말. primary(apple) / secondary(paper).
  - `Tape`, `PushPin`: 장식 프리미티브.
- 발표 화면 가독성 기준: 이름표 글자 최소 28px, 이름표 대비비 4.5:1 이상, 칠판 글자 최소 32px. 1920×1080 TV 기준으로 30명·6열까지 한 화면.
- 교사 화면은 정보 밀도가 높으므로 질감을 절제한다: 코르크 바탕 + 종이 카드까지만, 이름표 기울기·테이프는 배치도 미리보기에서만.

## 5. 교사 화면 흐름

- 상단 진행 표시 4단계: 명단 → 배치 → 규칙 → 규칙 검사. 완료 단계는 체크 아이콘(lucide `Check`)로 바뀐다.
- 좌측 설정 패널(카드 4개: 명단·배치·규칙·기록), 우측 배치도 미리보기. 반 선택·내보내기·가져오기는 헤더.
- "규칙 검사"는 미리보기 전용임을 버튼 아래 한 줄로 명시한다. 검사 결과는 미리보기에 표시되고 저장하지 않는다(이력에 남지 않음).
- 검사 통과 시 헤더의 "학생들 앞에서 뽑기" 버튼이 강조되고 `/present`로 이동한다. 이 버튼이 발표 화면으로 가는 유일한 경로다.
- 좌석 삭제는 빈 좌석 클릭 → X → 삭제. 확인창 없음, 대신 토스트 "되돌리기".

## 6. 뽑기 연출 (발표 화면)

- 시퀀스: 카운트다운 3·2·1(큰 손글씨) → 이름표 전체가 뒤집혀 뒷면(빈 종이)이 되고 0.8초 셔플 → 앞줄부터 줄 단위 순차 공개(줄당 0.25초) → 마지막에 컨페티(canvas-confetti, 코르크 팔레트 색).
- 구성 요소는 Aceternity UI·ReactBits에서 카드 플립·텍스트 리빌·컨페티 계열을 가져와 코르크 톤과 lucide 아이콘으로 손본다. 라이선스는 MIT만 사용하고 출처를 `components/motion/README.md`에 적는다.
- 효과음: Web Audio API로 합성(틱·셔플·공개·팡파르). 오디오 파일 없음. 음소거 토글은 localStorage `seat-changer-sound`에 저장.
- 러티 모드(한 명씩 뽑기): 같은 시퀀스 언어로 한 명 이름표만 뒤집힌다.
- `prefers-reduced-motion`이면 카운트다운·셔플·컨페티를 생략하고 즉시 공개한다.
- "다시 뽑기"는 같은 버튼이 라벨만 바뀐다. 이전 결과는 이력에 저장된다(현재 동작 유지).

## 7. 신규 기능

### 7-1. 좌석 복구 + Undo/Redo
2번 섹션에 정의. 추가로 Undo 버튼을 배치 카드 헤더에 두고 스택이 비면 비활성화.

### 7-2. 모둠 이름·역할 배정
- 모둠 배치일 때만 규칙 카드에 "모둠 이름·역할" 항목이 나타난다.
- 모둠 이름: 프리셋(동물·색·행성·과일) 중 하나 또는 직접 입력. 뽑기 시 모둠에 무작위로 붙는다.
- 역할: 기본 4종(모둠장·기록이·발표자·시간지기), 추가·삭제·이름 변경 가능. 모둠 인원이 역할 수보다 적으면 앞 역할부터 배정하고 남는 역할은 비운다.
- 역할 이력: `roleHistory`(최근 5회)에 저장해 같은 학생이 직전과 같은 역할을 받지 않도록 배제(불가능하면 안내 후 배정). 기존 `groupHistory`와 별개.
- 발표 화면에서 모둠 이름은 칠판 아래 팻말로, 역할은 이름표 하단 작은 라벨로 표시.

## 8. 테스트·배포·롤아웃

- 단위: Vitest, `core/` 전체와 스토어 마이그레이션. 커버리지 `core/` 90% 이상.
- E2E: Playwright 핵심 흐름 5개 — 명단 입력·저장, 좌석 삭제·복구·Undo, 규칙 검사, 발표 뽑기 완주, v1 localStorage 데이터 로드.
- 정적: `tsc --noEmit`, ESLint(React·core 경계 규칙·이모지 금지 규칙), Prettier.
- CI: GitHub Actions에서 위 전부. PR 머지 조건.
- 작업 경로: `C:\Users\Public\seat-changer`(한글 홈 경로에서 vite build 크래시 이력). 브랜치 `v2`.
- 배포: `v2` 브랜치를 Vercel 프리뷰로 먼저 올려 교사 베타(1~2주) → 피드백 반영 → `main` 머지로 프로덕션 승격. 승격 전 기존 URL에 "새 버전 미리 써 보기" 배너.
- 이전 `js/`·`css/`·`build.js`는 승격 시 삭제. README에 file:// 미지원 명시.

## 9. 검증 게이트와 루프 구조

구현은 subagent-driven development로 진행하며, 모든 작업 단위(Task)는 아래 게이트를 통과해야 완료로 친다. 게이트에 걸리면 같은 Task가 수정 루프를 돈다.

### 9-1. Task 게이트 (매 Task, 자동)

| 순서 | 게이트 | 통과 기준 | 실패 시 |
|---|---|---|---|
| G1 | 테스트 선행 | 구현 전 실패하는 테스트가 커밋에 있음 | Task 반려 |
| G2 | 정적 검사 | `tsc --noEmit`, ESLint 0 error | 수정 후 재검사 |
| G3 | 단위 테스트 | `vitest run` 전부 통과 | 수정 루프 |
| G4 | 이모지·이미지 스캔 | `src/`에 이모지 코드포인트 0건, `.png/.jpg` import 0건 | 수정 루프 |
| G5 | 스펙 리뷰 | 리뷰 subagent가 이 스펙 대비 누락·과잉 확인 | 지적 사항 반영 후 재리뷰 |
| G6 | 품질 리뷰 | 코드 품질 subagent 리뷰 | 동일 |

루프 상한: G5·G6 각 3회. 3회 초과 시 사람(사용자)에게 에스컬레이션.

### 9-2. 화면 게이트 (UI Task, 반자동)

- G7 시각 체크: Playwright로 1920×1080 스크린샷 → 체크리스트 대조(글자 크기 하한, 대비비, 겹침·잘림 없음, 이모지 없음). 체크리스트는 `docs/superpowers/checklists/ui.md`에 두고 리뷰 subagent가 스크린샷을 보고 판정한다.
- G8 상호작용: 해당 화면의 Playwright E2E 통과.

### 9-3. Phase 게이트 (단계 전환)

| Phase | 내용 | 게이트 |
|---|---|---|
| P0 | 스캐폴드·토큰·cork 컴포넌트 | G1~G7 + 스토리 페이지(`/dev/cork`)에서 컴포넌트 전 상태 확인 |
| P1 | core 이식 | 골든 테스트 100% 일치, 커버리지 90% |
| P2 | 스토어·마이그레이션 | 실제 교사 데이터 샘플(익명화) 3종 로드 성공, v1 JSON 가져오기 성공 |
| P3 | 교사 화면 | E2E 3개(명단·삭제복구·검사) |
| P4 | 발표 화면·연출 | E2E 뽑기 완주, reduced-motion 경로, 60fps 확인(Performance 트레이스 1회) |
| P5 | 모둠 이름·역할 | 단위 + E2E 1개 |
| P6 | 프리뷰 배포·베타 | 교사 베타 피드백 수집 → 이슈 0건 또는 전부 처리 |
| P7 | 프로덕션 승격 | P0~P6 전 게이트 녹색, 구 코드 삭제, README 갱신 |

### 9-4. 루프 구조

```
for Task in Plan:
    implementer subagent: 테스트 작성 → 실패 확인 → 구현 → G2~G4 자체 실행
    loop (최대 3회):
        spec reviewer subagent → 지적 있으면 implementer 수정
    loop (최대 3회):
        quality reviewer subagent → 지적 있으면 implementer 수정
    UI Task이면 G7·G8
    커밋
Phase 끝: Phase 게이트 → 통과 시 다음 Phase, 실패 시 해당 Task로 복귀
P6: 베타 피드백 루프 (피드백 → 이슈화 → Task 추가 → 위 루프)
```

- 에스컬레이션 규칙: 같은 지적이 2회 반복되거나, 게이트가 스펙 자체의 모순을 드러내면 구현을 멈추고 사용자에게 스펙 수정 여부를 묻는다.
- 기록: 각 Task의 게이트 결과를 `docs/superpowers/gates/<task-id>.md`에 남긴다(통과 시각, 루프 횟수, 마지막 지적).

## 10. 열린 결정 (사용자 확인 필요)

없음. 아래는 이 스펙에서 확정한 가정이다.

- Vercel 배포는 GitHub 연동으로 `main` 푸시 시 프로덕션, 그 외 브랜치는 프리뷰라고 가정한다. 첫 프리뷰 배포 때 확인한다.
- 명단 파일 불러오기(csv/hwp/hwpx/xml)는 기존 `roster-parser.js` 로직을 그대로 이식한다.
- 다반 최대 15개, 학생 최대 100명 제한은 유지한다.
