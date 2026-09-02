# 자리바꾸기 v2 실행 플레이북 (모델 배정 · 적대적 QA 루프)

- 적용 대상: `2026-09-02-seat-changer-v2-plan1-foundation.md`(계획 1)과 이후 계획 2·3
- 스펙: `docs/superpowers/specs/2026-09-02-seat-changer-v2-design.md` 9장(검증 게이트와 루프)을 실행 수준으로 구체화한 문서
- 작업 경로·브랜치: `C:\Users\Public\seat-changer`, `v2`

## 1. 역할

| 역할 | 누가 | 하는 일 |
|---|---|---|
| 설계·지휘 | Fable 5.1, effort high (이 세션) | Task 브리핑 작성, 서브에이전트 배정, 리뷰·QA 결과 판정, 루프 제어, 에스컬레이션, 계획 2·3 작성 |
| 구현 | 티어별 Claude 서브에이전트 (아래 표) | 한 Task를 TDD로 구현, `npm run gate` 통과, 커밋 |
| 스펙 리뷰 | `spec-reviewer` 에이전트 (Sonnet, high) | 구현이 Task 요구와 스펙에 맞는지. 누락·과잉 |
| 품질 리뷰 | `quality-reviewer` 에이전트 (Opus, medium) | 코드 품질·테스트 설계·경계 위반 |
| 적대적 QA | GPT-5.6 Sol, effort high (Codex 플러그인) | 설계 가정을 공격, 깨지는 경로·데이터 손실·회귀를 찾음 |

## 2. 구현 서브에이전트 티어

에이전트 정의는 `.claude/agents/`에 둔다. 티어는 Task의 변경 범위·논리 난이도·회귀 위험으로 정한다.

| 티어 | 에이전트 | 모델 / effort | 기준 |
|---|---|---|---|
| S | `impl-s` | Sonnet / medium | 파일 1~3개, 논리 단순, 회귀 위험 낮음 |
| M | `impl-m` | Sonnet / high | 파일 3~6개, UI 컴포넌트·설정, 테스트 5개 내외 |
| L | `impl-l` | Opus / medium | 레거시 이식·동일성 테스트, 시각 게이트 포함 |
| XL | `impl-xl` | Opus / high | 알고리즘·스토어·골든 테스트처럼 실패 시 전체가 흔들리는 Task |

### 계획 1 Task 배정

| Task | 내용 | 티어 |
|---|---|---|
| 1 | 레거시 격리·Vite 스캐폴드 | M |
| 2 | 게이트 스크립트·템플릿 | S |
| 3 | 디자인 토큰·질감 | S |
| 4 | PushPin·Tape | S |
| 5 | PaperCard·WoodButton | M |
| 6 | ChalkBoard·NoteSeat | M |
| 7 | /dev/cork 갤러리·Playwright 시각 게이트 | L |
| 8 | 모델 타입·zod | M |
| 9 | 거리·exam/pair/ushape 이식 | L |
| 10 | custom/group 이식·레지스트리 | L |
| 11 | rng·룩업·인접·성별 | XL |
| 12 | 제약·백트래킹·randomizeSeats | XL |
| 13 | 골든 테스트 | XL |
| 14 | 저장소 어댑터·반 관리 | S |
| 15 | 마이그레이션·JSON | L |
| 16 | Zustand 스토어·Undo | XL |
| 17 | Phase 2 게이트·E2E | M |

계획 2·3의 Task는 작성 시 같은 기준으로 티어를 표에 적는다.

## 3. GPT-5.6 Sol 적대적 QA (Codex 플러그인)

- 플러그인: `codex@openai-codex` 1.0.6 (설치됨). 실행 스크립트: `~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs`
- 모델·effort는 `~/.codex/config.toml`의 `model = "gpt-5.6-sol"`, `model_reasoning_effort = "high"`를 따른다. 명령에서 바꾸지 않는다.
- 인증은 사용자의 Codex 로그인(`codex login`)을 쓴다. 미로그인이면 QA를 "보류"로 기록하고 개발은 계속한다. 로그인되면 보류 목록을 순서대로 처리한다.
- Stop 훅 리뷰 게이트(`--enable-review-gate`)는 켜지 않는다. 매 턴마다 15분 리뷰가 붙어 루프가 느려진다.

### 3-1. Task 단위 QA (G9)

Task 커밋 직후, 그 Task의 diff만 검토한다.

```bash
cd /c/Users/Public/seat-changer
node "$CODEX_PLUGIN/scripts/codex-companion.mjs" adversarial-review --wait --base <task 시작 전 커밋> \
  "Task N: <한 줄 목표>. 스펙 <장 번호> 기준. 특히 <이 Task에서 가장 위험한 가정 1~2개>를 공격하라. \
   레거시(legacy/)와의 동작 차이, 데이터 손실 경로, 테스트가 놓친 분기를 찾아라. 한국어로 답하라."
```

출력은 그대로 `docs/superpowers/gates/task-NN.md`의 G9 절에 붙인다.

### 3-2. Phase 단위 QA

Phase 게이트 통과 후, 설계 자체를 공격한다. 리뷰가 아니라 `task`(rescue)로 묻는다.

```bash
node "$CODEX_PLUGIN/scripts/codex-companion.mjs" task --wait \
  "역할: 적대적 QA. 대상: Phase P<n> 산출물(<경로들>). 스펙: docs/superpowers/specs/2026-09-02-seat-changer-v2-design.md <장>. \
   해야 할 일: (1) 스펙과 구현의 불일치 목록 (2) 실제 교사 사용 시나리오에서 깨지는 경로 3개 이상, 각각 재현 절차 (3) 테스트를 추가해 실패를 증명할 수 있으면 파일 경로와 테스트 코드 초안 (4) 고치지 말 것. 한국어로."
```

### 3-3. 판정 규칙 (Fable이 수행)

GPT 출력의 각 지적을 세 가지로 나눈다.

- **수용**: 재현 가능하거나 스펙 위반이 분명함 → 수정 루프
- **기각**: 스펙이 의도한 동작이거나 범위 밖 → 근거 한 줄과 함께 게이트 기록
- **보류**: 계획 2·3에서 다룰 항목 → `docs/superpowers/gates/backlog.md`에 이관

수용 항목이 하나라도 있으면 같은 Task의 수정 루프로 돌아간다.

## 4. 루프

```
for Task in 계획:
    [Fable] 브리핑 작성: Task 본문 + 스펙 해당 절 + 이전 Task의 Interfaces + 이 Task의 티어
    [impl-<tier>] 테스트 먼저 → 실패 확인 → 구현 → npm run gate → 커밋 → 요약 보고
    loop A (최대 3회):
        [spec-reviewer] 판정 → 지적 있으면 [impl-<tier>] 수정·재게이트·커밋
    loop B (최대 3회):
        [quality-reviewer] 판정 → 지적 있으면 [impl-<tier>] 수정·재게이트·커밋
    UI Task: G7 스크린샷 체크(리뷰어가 checklists/ui.md로 판정) · G8 E2E
    loop C (최대 3회):
        [GPT-5.6 Sol] adversarial-review(3-1) → [Fable] 판정(3-3) → 수용 항목 있으면 [impl-<tier>] 수정·재게이트·커밋
    [Fable] gates/task-NN.md 완성 (G1~G9, 루프 횟수, 마지막 지적)
    [Fable] 사용자에게 3~5줄 진행 보고
Phase 끝:
    Phase 게이트(계획의 Task 7·13·17) → [GPT-5.6 Sol] Phase QA(3-2) → 판정 → 필요 시 Task 추가 후 위 루프
    통과 시 git tag, 다음 Phase
계획 1 끝:
    [Fable] 계획 2 작성(스펙 5·6장 + 4장 화면 적용) → 사용자 검토 → 같은 루프
```

- 루프 상한 초과, 같은 지적 2회 반복, 스펙 모순 발견, 레거시 골든 테스트 3 시나리오 이상 불일치 → 즉시 멈추고 `AskUserQuestion`으로 사용자에게 묻는다.
- 서브에이전트는 `git push`·배포·`legacy/` 수정·`1반` 실데이터 접근을 하지 않는다. 푸시는 Phase 게이트 후 Fable이 사용자 확인을 받고 한다.
- 구현 서브에이전트가 같은 Task에서 두 번째 수정에 들어갈 때는 새 에이전트를 띄우지 않고 `SendMessage`로 같은 에이전트에 이어서 지시한다(컨텍스트 보존). 세 번째부터는 새 에이전트에 전체 브리핑을 다시 준다.

## 5. 게이트 기록 확장

`docs/superpowers/gates/_template.md`(Task 2가 만든다)에 다음 행을 추가한다.

```
| G9 GPT 적대적 QA | 통과/보류/기각 n건 | | 루프 n회, 수용 n·기각 n·보류 n |
```

`docs/superpowers/gates/backlog.md`는 보류 항목 목록이다. 계획 2·3 작성 시 여기서 Task를 뽑는다.

## 6. 자동 시작

2026-09-02 13:50 KST에 세션 크론이 계획 1 Task 1을 시작한다. 그 전에 사용자가 `codex login`을 마쳐야 GPT QA가 첫 Task부터 붙는다. 로그인이 안 되어 있으면 3절의 보류 규칙을 따른다.
