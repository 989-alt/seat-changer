# Task 13 — 레거시 골든 테스트 (Phase 1 게이트)

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 해당 없음 | | 테스트 자체가 산출물 |
| G2 정적 검사 | 통과 | 2026-09-03 16:5x | |
| G3 단위 테스트 | 통과 | 16:5x | 388/388. 골든 13 시나리오 × 3 시드(39 조합) 전부 레거시와 일치, 의도된 불일치 4건 고정. 골든 파일 54~152ms |
| G4 스캔 | 통과 | 16:5x | |
| G5 스펙 리뷰 | 통과 | 17:1x | 통합 리뷰(sonnet/high). 브리핑 6 + 확장 7 시나리오·시드·불일치 블록 전부 확인, 하네스가 레거시 shuffle/yieldToUI 소스를 실제로 구동함을 검증 |
| G6 품질 리뷰 | 통과 | 17:1x | 통합 리뷰. v1 non-null 단언·중복 좌석 검사·시드별 상이 검사로 비공허성 확보. 경미: describe 이름 문구 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 이관 3건 | 17:2x | **Phase 1 QA**(Task 8~13 전체, base 59c40f6). needs-attention 3건 모두 레거시 동일 동작 → 골든 동일성 유지, R74~R76으로 이관 |

## Phase 1 게이트 판정
- 커버리지 `src/core`: 99.31% 라인/구문, 92.23% 분기, 100% 함수 (임계 90/90/85/90) — 통과.
- v2 core 수정 0줄로 골든 통과. 비공허성 증명: rng.ts shuffle을 흔들면 13 시나리오 전부 즉시 실패(되돌림).
- 골든 시나리오: exam 기본 / pair mixed / ushape 분리 / custom 고정 / group 이력 / exam 삭제 좌석 / exam 고정+분리 / pair same 홀수 / mixedFirst / group 불균등+groupPositions / historyExcludeCount 2 / 3명·4석 / 만석.
- 의도된 불일치(양쪽 결과를 모두 단언): R57/R59 용량(레이아웃 기반·disabledSeats 정리), R70 lastAssignment 단독 폴백, R72 빈 mapping, 실패 형태(v1 null vs v2 {ok:false}).

## 판정 기록
- R73: 타임아웃·실패 경로는 골든 비교 제외(양쪽 clock 고정, 레거시 backtrack이 무한정 돌 수 있음). groupHistory 기반 모둠 배제·historyExcludeCount 3은 골든 미포함(Task 12 단위 테스트로 대체) → 계획 2 베타 전 추가.
- R74(GPT high, 이관): 고정석끼리는 분리·성별·모둠 제약을 검사하지 않음(레거시 동일: 고정석은 assignment에 바로 삽입). v1은 randomize 후 verifyAssignment로 위반을 토스트했음 → Task 16 스토어는 randomize 성공 후 반드시 verifyAssignment를 호출해 violations를 결과에 싣고, 계획 2 고정석 편집기는 고정석 간 규칙 충돌을 사전 경고. 알고리즘은 골든 기준선 유지.
- R75(GPT high, 이관): 타임아웃이 재귀 전체를 중단시키지 못함(깊이 4의 배수 호출에서만 false 반환, 레거시 동일). Phase 1에서는 레거시 동일 유지; 계획 2/3에서 timeout 전파(success/dead-end/timeout 3분기) + Web Worker 검토. 골든은 clock 고정이라 이 경로를 비교하지 않음.
- R76(GPT high, 이관 → Task 15): 중복 학생 이름이 스키마를 통과해 고정석과 결합 시 학생 누락(레거시 validateStudents도 중복 허용). Task 15에서 ClassDataSchema.students 유일성 refine 추가 + 마이그레이션·JSON 가져오기가 parse 전에 결정적 중복 제거(첫 항목 유지) + Task 16 setStudents 중복 제거.

## 보류(deferred minor)
- describe 이름 문구가 컨트롤러 지시 문자열과 다름(내용 동일).
- 타임아웃·실패 경로·groupHistory·historyExcludeCount 3 골든 미포함(R73).

커밋: b152c14
에스컬레이션: 없음
