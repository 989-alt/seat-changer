# Task 04 — PushPin·Tape 프리미티브

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-02 17:0x | 모듈 없음 실패 → 구현. 수정 라운드 RED→GREEN |
| G2 정적 검사 | 통과 | 17:2x | |
| G3 단위 테스트 | 통과 | 17:2x | 77/77 (cork 6) |
| G4 스캔 | 통과 | 17:2x | |
| G5+G6 통합 리뷰 | 통과 | 17:1x | R25: 150줄 미만 diff는 스펙+품질 리뷰어 1명. 지적 없음. minor: className 이중 공백, keyof typeof 타이핑 |
| G7 시각 체크 | 이관 | | Task 7 Playwright: bounding box가 부모 카드에 고정되는지, 장식 위 클릭이 아래 컨트롤로 통과하는지 |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 17:3x | 루프 1회(needs-attention→approve). 수용 2·기각 0 |

## 판정 기록
- R26(GPT): aria-hidden은 hit testing을 끄지 않음 → `pointer-events-none` 추가, 단위 테스트.
- R27(GPT): 절대배치 부모(`relative`) 계약을 JSDoc에 명시, 공용 상수 `decor.ts`의 `DECOR_BASE = 'absolute pointer-events-none'`.
- 브라우저 배치·클릭 통과 검증은 Task 7로 이관.

커밋: 776a319, de68b36
에스컬레이션: 없음
