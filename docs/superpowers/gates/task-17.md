# Task 17 — Phase 2 게이트: 실데이터 로드 확인과 태그

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 14:3x | e2e 스펙 선작성(diag 없음 실패) → 진단 블록 구현. R85 스토어 테스트 5건 RED→GREEN |
| G2 정적 검사 | 통과 | 14:4x | |
| G3 단위 테스트 | 통과 | 15:2x | 521/521 (R87·R88 반영). src/core 커버리지 99% 라인 / 92.7% 분기 / 98% 함수 (임계 90/90/85/90) |
| G4 스캔 | 통과 | 14:4x | |
| G5 스펙 리뷰 | 생략(R86) | | 사용자 지시로 개별 리뷰 생략, 최종 전체 리뷰(Opus)로 대체 |
| G6 품질 리뷰 | 생략(R86) | | 최종 전체 리뷰(Opus)로 대체 |
| G7 시각 체크 | 통과 | 14:3x | `test-results/teacher-diag.png`: cork 위 ink 텍스트, 이모지 없음, v1 픽스처(1반·6-7, 22명, 새 버전 안내) 표시. 진단 블록은 임시(계획 2에서 교체) |
| G8 E2E | 통과 | 14:38 | 컨트롤러 직접 실행 6/6 (28.6s): dev-cork 4 + v1-data-load 2 (v1 시드 로드·마이그레이션 재저장·안내 / 빈 저장소 기본값) |
| G9 GPT 적대적 QA | 통과(수용 1) | 15:17 | **Phase 2 QA**(Task 15~17, base 7f500cc) 1회. high 1건: 다중 탭 stale 덮어쓰기 — v1 initSync(탭 간 동기화)가 있었으므로 실제 후퇴로 판정 → R88 최소 동등 구현. revision/병합 충돌 검사는 기각 |

## Phase 2 게이트 판정
- **판정: Phase 2 게이트 PASS** (2026-09-03 15:2x). gate 521/521 초록, e2e 6/6, src/core 커버리지 99%, gates task-01~17 존재, 태그 v2-phase2.
- 계획 1 완료 조건: `npm run gate` 초록 / `npm run e2e` 전부 통과 / `src/core` 커버리지 90% 이상 / gates task-01~17 존재 / 태그 `v2-phase2`.
- Step 4(이 PC의 실제 프로덕션 localStorage 데이터 수동 확인)는 개인정보를 사용자가 직접 다뤄야 하므로 **사용자 결정 대기**로 넘김(원장 "Pending user decisions"). 픽스처 기반 E2E까지가 자율 범위.

## 판정 기록
- R85: 부팅 시 v1 데이터 재저장은 페이지의 `update({})` 강제 호출이 아니라 스토어가 `migrated: true`일 때 1회 write-back(ok:false·v2 데이터는 쓰지 않음). 페이지 꼼수 제거.
- R86(사용자 지시 14:37): 리뷰·GPT 지적은 실제 결함(유실·크래시·오결과·v1 호환)만 반영, 재검토 루프 없음, 개별 리뷰 대신 최종 전체 리뷰 1회.
- R87(최종 전체 리뷰 Opus, 수용): `lastAssignment`/이력의 timestamp가 Date 범위(±8.64e15ms) 밖이면 마이그레이션을 통과한 뒤 recordAssignment의 `toISOString`이 RangeError → 방금 뽑은 배치 유실. 마이그레이션에서 해당 레코드만 버리도록 가드 + 회귀 테스트. 최종 리뷰 그 외 11건은 보류.
- R88(GPT Phase 2 QA, 부분 수용): v1 store.initSync와 동등하게 `storage` 이벤트(활성 반 데이터 키·CLASSES·ACTIVE)에서 어댑터를 다시 읽어 상태를 갱신하고 Undo 스택을 비움(`reloadFromStorage`/`attachStorageSync`, 싱글턴에서 window 가드 아래 연결). revision 충돌 검사·병합은 기각(레거시에도 없음).
- 최종 전체 리뷰(Opus, base f0e07c5 → 8fc3c06, 54 커밋): 모듈 간 계약(layouts→randomizer, migrate→schema, store→registry 쓰기 순서, 부팅/전환 저장, undo 병합) 모두 정상. gate 515·골든 18/18 직접 실행 확인.

## 보류(deferred minor)
최종 전체 리뷰 보류 목록(계획 2 이후 처리):
- classes.ts add()가 트림 전 이름으로 중복 검사(레거시) → 계획 2 UI에서 트림.
- classes.ts remove()가 목록 쓰기 후 실패하면 목록과 ACTIVE 불일치 가능; duplicate()는 add 성공 후 복사 실패 시 기본 데이터 반이 남음; migrateIfNeeded()·writeRaw()는 어댑터 boolean 무시; readRaw/writeRaw는 스토어에서 미사용.
- verify.ts: studentA === studentB인 분리 규칙은 거리 0 위반으로 보고(레거시 동일).
- layouts/index.ts: custom은 disabledSeats를 차감하지 않지만 assign.ts는 제외 → 레이아웃 전환 후 잔존 인덱스가 capacity 대신 constraints로 보고(레거시 동일).
- useAppStore: update()는 무검증·temporal 미정리, setGridSize는 값이 같아도 clearedDisabled 보고, loadNotice 단일 채널(계획 2 이관).
- 골든 미포함: 타임아웃·실패 경로, groupHistory 배제, historyExcludeCount 3 (R73).

커밋: d5e8e56, 8fc3c06, 989577b, d6018f7
원장 사본: docs/superpowers/gates/plan1-ledger.md (판결 R1~R88)
에스컬레이션: 없음
