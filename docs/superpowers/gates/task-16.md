# Task 16 — Zustand 스토어 (persist + Undo/Redo)

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 14:0x | useAppStore.test.ts 모듈 없음 실패 → 구현 |
| G2 정적 검사 | 통과 | 14:1x | src/store는 core 밖(zustand·zundo 허용), window는 가드된 싱글턴 1줄 |
| G3 단위 테스트 | 통과 | 14:1x | 498/498 (store 35). useAppStore 98.8%, selectors 100% |
| G4 스캔 | 통과 | 14:1x | |
| G5 스펙 리뷰 | 통과 | 14:1x | 루프 0회. AppState 정확, undo 병합 전략 검증, recordAssignment 레거시 526-568행 대조 일치 |
| G6 품질 리뷰(Opus) | 통과 | 14:2x | 루프 1회. Important 2(R84): duplicateClass 이름 충돌을 저장 실패로 오진단, setGridSize 범위 미검증 저장(다음 부팅에 초기화) |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | Task 17에서 v1 데이터 로드 E2E |
| G9 GPT 적대적 QA | 보류(한도) | | Codex 사용량 한도로 미실행 → R80: Phase 2 QA(Task 14~17 통합)에서 수행, 결과는 task-17.md에 기록 |

## 판정 기록
- 이관 반영: R79(어댑터 boolean 확인 → 저장 실패 시 loadNotice), R76(setStudents 중복 제거·명단 밖 고정석/규칙/성별 정리), R59(disabledSeats 정리), R53(이력 상한은 레거시 student-screen 기준), R63(hasOwn). R74는 계획 2(randomize 호출부에서 verifyAssignment)로 이관.
- zundo 중첩 `partialize({data:{...}})`는 undo 시 data를 통째로 덮어 students를 잃음(브리핑 우려가 실제) → 평평한 partialize + temporal 바깥 `withUndoMerge` 미들웨어(부분 스냅샷을 data에 병합) + 명단 변경 시 pause/resume 병용.
- R53 해소: 레거시 이력 상한 5(student-screen.js:540,560) == LIMITS.MAX_HISTORY.
- R84(품질 Important 2, 수용): duplicateClass는 registry.list() 전후 비교로 "복사 실패"와 "이름 충돌"을 구분; setGridSize는 LIMITS.MIN_GRID..MAX_GRID로 clamp(비정상 입력은 no-op). 접음: setUntracked try/finally, setStudents 후 temporal clear + 중복제거 후 100 상한, isUndoSnapshot 구조 검사(6키), 알림 전용 변경 무저장·변경당 1회 저장·폴백 안내 테스트.
- R83(계획 2 이관): AppState에 randomize/violations 없음(브리핑대로) → 계획 2 스펙에서 위반 목록 위치와 R74 verifyAssignment 호출부 결정; recordAssignment(…, true)의 폴백 안내는 위반이 있으면 호출자가 clearNotice(); loadNotice가 단일 문자열이라 5종 안내가 서로 덮음 → 토스트 큐 여부 결정.

## 보류(deferred minor)
- `update(partial)`는 무검증(계획 2는 행·열 변경에 반드시 setGridSize 사용).
- registry.add()가 트림 전 이름으로 충돌 검사(레거시 특이 동작, Task 14) → duplicateClass(' 2반 ')이 기존 '2반'과 충돌 검사를 피할 수 있음 — 계획 2 UI에서 이름을 트림해 전달.
- isUndoSnapshot은 구조 검사로 강화했으나 여전히 휴리스틱(태그 방식은 후속).

커밋: f6698de, 8d9c55b
에스컬레이션: 없음
