# Task 09 — 거리 함수와 exam·pair·ushape 배치 이식

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 11:5x | grid.test.ts 모듈 없음 실패 → 구현 |
| G2 정적 검사 | 통과 | 12:0x | core 경계 ESLint 포함 |
| G3 단위 테스트 | 통과 | 12:0x | 168/168 (layouts 30: 3개 설정 × 3 배치, 전 쌍 거리) |
| G4 스캔 | 통과 | 12:0x | |
| G5 스펙 리뷰 | 통과 | 12:1x | 통합 리뷰. 레거시 본문 줄 단위 대조 일치, Interfaces 정확 |
| G6 품질 리뷰 | 통과 | 12:1x | 통합 리뷰. 경미: `gridPositions` 노출(브리핑 코드 그대로), 매개변수명 pos1/pos2 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 12:3x | 루프 1회(needs-attention→approve). 수용 2·기각 0 |

## 판정 기록
- 레거시 `layout-engine.js`에서는 `manhattanDistance`·`chebyshevDistance`만 이식(`escapeHTML`·`render`는 UI 영역, core 밖).
- `SeatLayout.type` 필드는 레거시에 없지만 브리핑 인터페이스 요구(계산 무관). Task 10 레지스트리가 사용.
- R56(GPT 1차, 수용 2): (a) 브리핑의 `SeatPosition.group?`는 레거시 group-layout 출력 `groupIndex`와 불일치 → 레거시 동일성이 스펙이므로 `groupIndex?: number`로 정정 + 컴파일 타임 리터럴 검사. (b) 동일성 테이블을 8개 설정(6×5, 4×3, 5×4, 1×1, 1×12, 12×1, 12×12, disabledSeats [0,7,29])으로 확장, 거리 함수는 layout-engine.js와 직접 비교. 경계에서 레거시 차이 없음(ushape columns=1은 좌우 열 겹침을 그대로 재현).

## 보류(deferred minor)
- `gridPositions`가 exam.ts에서 export됨(브리핑 Step 3 코드 그대로, Task 10 custom/group이 재사용 예정).
- pair/ushape distance 매개변수명 `pos1, pos2`(레거시 유지) vs 인터페이스 `a, b` — 구조상 무관.

커밋: 2722aa4, 2f9d8e5
에스컬레이션: 없음
