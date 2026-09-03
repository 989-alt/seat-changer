# Task 12 — 제약 검사·백트래킹·randomizeSeats·verifyAssignment

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 15:0x | randomizer.test.ts 모듈 없음 실패 → 구현 |
| G2 정적 검사 | 통과 | 15:2x | core 경계 ESLint 포함. 레거시 '↔'가 스캔에 걸려 '-'로 교체 |
| G3 단위 테스트 | 통과 | 15:2x | 363/363 (randomizer.test 46). randomizer 커버리지 99.5% 라인 / 94% 분기 |
| G4 스캔 | 통과 | 15:2x | |
| G5 스펙 리뷰 | 통과 | 15:4x | 루프 0회. 함수별 레거시 대조 일치, 허용된 편차만. rng 소비 순서 동일성은 Task 13으로 이관 |
| G6 품질 리뷰(Opus) | 통과 | 15:4x | 루프 0회(Approved). 경미 4 중 3 접음(G9 라운드), 1 보류 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 16:2x | 루프 3회(needs-attention→needs-attention→approve). 수용 4(R68, R70, R71, R72)·기각 1(R69)·부분 1 |

## 판정 기록
- 의도된 변경 4가지: Math.random→주입 rng(모든 shuffle에 전달), Date.now→주입 clock+timeoutMs(마감 검사 cadence `(attempt&3)==0`·`(studentIdx&3)==0` 동일), yieldToUI 주입, 실패를 `{ok:false, reason, detail}`로 반환.
- R65: verifyAssignment는 레거시대로 `dist <= minDistance`를 위반으로 판정. 브리핑 픽스처 `{0, 12}`는 6열에서 체비셰프 거리 2라 불가능 → 18번 좌석(거리 3)으로 이동, 경계값 테스트로 고정. verify가 randomizer보다 느슨해지면 Task 13 기준선이 흔들림.
- R66: 레거시 verifyAssignment는 고정석·분리만 검사 → 브리핑의 Violation.kind 합집합(gender·capacity)을 채우기 위해 checkGenderConstraintFast와 동일 기준의 gender, capacity 검사 추가.
- R67: `RandomizeOptions.clock` 추가(기본 Date.now) — 주입 clock 타임아웃 테스트에 필요.
- 레거시 버그 그대로 이식(고치지 않음): 비활성/범위 밖 좌석의 고정석을 randomizer는 무시하지만 verify는 위반으로 표시; `_historyFallback`을 매핑 객체에 붙이던 것은 별도 필드로; 중복 고정석은 R54 스키마로 사전 차단; checkConstraints의 죽은 매개변수 2개.
- R70(GPT high, 의도적 불일치): 레거시 이력 폴백 조건은 `assignmentHistory.length > 0`뿐이라 lastAssignment만 있는 유효 상태에서 첫 시도가 막히면 재시도 없이 실패(레거시 버그, seat-randomizer.js:109) → v2는 `|| lastAssignment?.mapping` 포함. Task 13 골든 테스트가 이 시나리오를 v1≠v2로 고정해야 함.
- R68(GPT medium): verifyAssignment도 tryAssignment처럼 비활성·범위 밖 좌석의 고정석은 건너뜀(같은 술어 공유) → 성공 매핑은 항상 []. 계획 2 UI는 "고정석이 비활성 좌석" 설정 경고를 별도 표시.
- R69(GPT medium, 기각): 레거시 oracle 기반 rng 소비 순서 골든 테스트는 Task 13의 범위.
- R71(GPT 2차): 마지막 시도의 backtrack 내부에서 기한을 넘기면 `timedOut`이 안 잡히던 문제 → 각 패스의 시도 루프 종료 후 `clock() > deadline`로 보정(동작·rng 소비 불변).
- R72(GPT 2차, 부분 수용): 빈 `lastAssignment.mapping`도 이력 폴백을 켜던 문제 → 항목이 있는 mapping만 이력으로 인정. 현재 명단과의 겹침 검사는 기각(레거시에 없음, 과설계).

## 보류(deferred minor)
- custom 배치 + disabledSeats에서 getTotalSeats(비활성 무시)와 tryAssignment(비활성 제외)의 용량 판단이 어긋날 수 있음 — custom은 책상을 삭제하지 비활성화하지 않으므로 실사용 도달 불가로 판단, 기록만.
- `own()` 프로토타입 안전 읽기 헬퍼가 gender/constraints/verify에 중복 — 후속 정리.

커밋: 98e8ef4, 8a8a7f0, 2884ef1
에스컬레이션: 없음
