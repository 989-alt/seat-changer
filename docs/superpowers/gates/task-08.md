# Task 08 — 모델 타입·기본값·zod 스키마

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 11:1x | schema.test.ts 모듈 없음 실패 → 구현. 수정 라운드 RED→GREEN |
| G2 정적 검사 | 통과 | 11:4x | core 경계 ESLint 포함 |
| G3 단위 테스트 | 통과 | 11:4x | 138/138 (model 17: 기본 7 + R54 3 + R55 7) |
| G4 스캔 | 통과 | 11:4x | |
| G5 스펙 리뷰 | 통과 | 11:2x | 통합 리뷰(R52). 브리핑·legacy models.js·store.js importJSON 상한 대조 일치 |
| G6 품질 리뷰 | 통과 | 11:2x | 통합 리뷰. 경미 2(계획 유래): LIMITS.MAX_HISTORY 미사용, `as unknown as` 캐스트 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 11:4x | 루프 1회(needs-attention→approve). 수용 2(부분)·이관 2 |

## 판정 기록
- R52: 202줄이지만 브리핑 코드 전사라 통합 리뷰어 1명.
- R53: `LIMITS.MAX_HISTORY=5`는 스키마 이력 상한 10(legacy importJSON slice 10)과 불일치 — Task 16(스토어)에서 legacy push 상한을 확인해 상수 사용 또는 값 수정. `as unknown as z.ZodType<ClassData>`는 계획 그대로, Task 15 마이그레이션 테스트가 형태를 검증.
- R54(GPT high, 부분 수용): fixedSeats의 seatIndex·studentName 유일성을 superRefine으로 검사(중복이면 parse 실패). 명단 소속·좌석 범위·비활성 좌석 검사는 레이아웃 좌석수에 의존하므로 기각 → Task 12(제약 검사)·Task 15(마이그레이션이 parse 전에 결정적으로 정리)로 이관.
- R55(GPT medium): Assignment 키는 `^(0|[1-9]\d*)$` + `Number.isSafeInteger`, 비정규·충돌 키는 `ctx.addIssue`로 parse 실패(조용한 삭제 금지). 좌석 범위 검사는 이관. JS 객체의 정수 키는 정규 직렬화되므로 실제 v1 데이터엔 영향 없음.

## 보류(deferred minor)
- 위 R53 2건.

커밋: 3baf818, fff43b4
에스컬레이션: 없음
