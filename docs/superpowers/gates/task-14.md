# Task 14 — 저장소 어댑터와 반 관리 레지스트리

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 17:3x | classes.test.ts 모듈 없음 실패 → 구현 |
| G2 정적 검사 | 통과 | 17:4x | core 경계 ESLint(브라우저 전역 없음, Storage 타입만) |
| G3 단위 테스트 | 통과 | 17:4x | 397/397 (storage 9) |
| G4 스캔 | 통과 | 17:4x | |
| G5 스펙 리뷰 | 통과 | 17:5x | 통합 리뷰(R10/R25). 루프 1회. 지적: rename `??`(레거시 `||`), duplicate 트림 키(레거시 미트림) 미공개 편차 |
| G6 품질 리뷰 | 통과 | 17:5x | 통합 리뷰. 경미: ClassRegistry 인터페이스 추가 export, 경계 테스트 부족(수정 라운드에 접음) |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 1회 후 한도 | 13:2x | 루프 1회(needs-attention). 수용 3(R77, R79 부분, 테스트)·기각 0. 재검토는 Codex 사용량 한도(15:07 해제)로 실행 불가 → R80: Sonnet 범위 한정 재리뷰로 마감, Phase 2 QA에서 보완 |

## 판정 기록
- v1 localStorage 키(`seat-changer-classes`·`seat-changer-active`·`seat-changer-data-<name>`)와 migrateIfNeeded(store.js:33-46) 동일 유지. 레지스트리는 raw 문자열만 읽고 씀(ClassData 파싱·마이그레이션은 Task 15).
- `add()`가 트림 전 이름으로 중복 검사하는 레거시 특이 동작 그대로 이식. `remove()`의 다음 활성 반 선택에 `?? '1반'` 타입 안전 폴백(관측 동작 불변).
- R77(스펙·GPT): rename()은 레거시대로 `data || 기본값`(빈 문자열 데이터 → 기본 데이터로 교체).
- R78(스펙, 의도적 편차 유지): duplicate()는 트림한 이름 키에 복사본을 씀. 레거시(store.js:130)는 트림 전 키에 써서 공백 포함 이름이면 복사본이 유실되는 버그 → v2에서 수정, 테스트로 고정·공개.
- R79(GPT high, 부분 수용): StorageAdapter.set/remove가 boolean 반환(브리핑은 void — 추가적 편차, Task 16 소비자는 반환값 확인). 레지스트리 변경 메서드는 쓰기 실패 시 false. rename은 대상 데이터 → 메타데이터 → 원본 삭제 순, 메타데이터 실패 시 대상 키 롤백; remove는 메타데이터 먼저. localStorage에 트랜잭션이 없으므로 그 이상의 롤백은 기각.

## 보류(deferred minor)
- duplicate()는 add 성공 후 복사 쓰기 실패 시 새 반이 기본 데이터로 남은 채 false 반환(원자성 미보장) — Task 16 스토어에서 사용자 안내 시 고려.
- writeRaw()는 void 시그니처라 boolean을 버림 — Task 16은 adapter.set 반환값을 직접 확인.
- ClassRegistry 인터페이스 추가 export(브리핑 외 심볼, 무해).

커밋: 62bed0c, be70b46
에스컬레이션: 없음
