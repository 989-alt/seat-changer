# Task 10 — custom·group 배치 이식과 레지스트리, getTotalSeats

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 12:4x | custom-group.test.ts 모듈 없음 실패 → 구현 |
| G2 정적 검사 | 통과 | 12:5x | core 경계 ESLint 포함 |
| G3 단위 테스트 | 통과 | 12:5x | 258/258 (custom-group 43) |
| G4 스캔 | 통과 | 12:5x | |
| G5 스펙 리뷰 | 통과 | 13:1x | 루프 1회. 지적: getTotalSeats 3번째 불일치(groupCount>20 클램프) 미고정 → R58 |
| G6 품질 리뷰(Opus) | 통과 | 13:1x | 루프 0회(Approved). 경미 6 중 3 접음, 3 보류 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | G9_RESULT | | 루프 G9_LOOPS. 수용 1(R59)·기각 0 |

## 판정 기록
- R57(구현자 발견, 컨트롤러 판결): 브리핑의 "legacy models.getTotalSeats == groupLayout.getSeatCount" 주석은 틀림. legacy models.js는 ushape를 columns*rows로 세고(6×5에서 30 vs 레이아웃 16) group에 groupPositions.length*groupSize 폴백이 있음. 레거시 추적 결과 models.getTotalSeats는 교사 화면 사전검사·고정석 편집기에서만 쓰이고, 발표 화면과 randomizeSeats는 레이아웃 기반 좌석을 씀 → v2 `getTotalSeats`는 레이아웃 기반 유지(브리핑 index.ts 코드). models.js 쪽은 레거시 잠재 버그(ushape 과다 계산으로 뽑기 불가 명단을 통과시킴). 불일치는 legacy models.js를 import하는 테스트로 고정·문서화. Task 12/13 골든 테스트는 randomizeSeats 기준, 계획 2 UI 사전검사는 v2 getTotalSeats 사용.
- custom-layout.js의 DOM 편집기(_desks·드래그·undo·render)는 이식하지 않음(계획 2에서 React로 재작성).
- R58(스펙): legacy models.js는 groupCount에 상한이 없고 group-layout은 20으로 클램프·groupSizes 20개로 자름 → 3번째 불일치를 legacy 기준 테스트로 고정. ClassDataSchema가 20으로 상한을 두므로 검증된 데이터에선 도달 불가.
- R59(GPT): getTotalSeats가 disabledSeats.length를 그대로 빼서 범위 밖([999])·중복([0,0])을 과다 차감 → non-custom은 `0 <= i < raw`인 인덱스의 Set 크기만 차감. legacy models.js와의 의도적 4번째 불일치로 고정. Task 12(랜덤화도 같은 필터 적용)·Task 15(마이그레이션이 disabledSeats 정리)로 이관.

## 보류(deferred minor)
- custom.ts/group.ts의 `py!`·`sizes[g]!` 비-null 단언(레거시와 동일 동작, 타이핑 문제).
- getLayout의 `?? examLayout` 폴백은 타입상 도달 불가 — Task 15에서 알 수 없는 layoutType이 유입될 수 있으면 재검토.
- custom.ts `customDesks || []` 분기 미테스트.

커밋: b67750d
에스컬레이션: 없음
