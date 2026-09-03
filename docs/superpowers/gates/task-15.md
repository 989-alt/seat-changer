# Task 15 — v1→v2 마이그레이션과 JSON 가져오기·내보내기

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 13:3x | migrate.test.ts 수집 실패 + R76 스키마 테스트 실패 → 구현. 수정 라운드 RED 13 → GREEN |
| G2 정적 검사 | 통과 | 13:5x | |
| G3 단위 테스트 | 통과 | 13:5x | 463/463 (model+storage 92) |
| G4 스캔 | 통과 | 13:5x | |
| G5 스펙 리뷰 | 통과 | 13:5x | 필드별 정규화 표 작성. 레거시 편차 = R2 부호 음수 clamp(수정 라운드), 나머지 엄격화는 R81 |
| G6 품질 리뷰(Opus) | 통과 | 14:0x | 루프 1회. Important 4(R82): 객체값 숫자 필드 예외, isInteger vs safe-int, 비객체 JSON ok:true, 정크 테스트 누락 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 보류(한도) | | Codex 사용량 한도(15:07 해제)로 미실행 → R80: Phase 2 QA(Task 14~17 통합)에서 수행, 결과는 task-17.md에 기록 |

## 판정 기록
- 이관 반영: R54(고정석 중복은 첫 항목 유지), R55(비정규 Assignment 키 제거), R59(disabledSeats 정수·범위·중복 정리), R76(students 유일성 refine + parse 전 중복 제거). 정규화는 모두 결정적이며 `ClassDataSchema.parse` 전에 수행.
- R2(사전 판결, 배치 누락 → 수정 라운드에서 적용): 브리핑 테스트의 `rows: -1 → 5`는 레거시 `Math.max(1, Math.min(12, parseInt(x) || 기본값))`과 다름 → v2도 클램프(→1). columns/rows/groupSize/groupSizes/groupCount/minDistance 전부 레거시 clamp 규칙.
- R81: 스키마가 요구하는 형태 검증으로 레거시가 통과시키던 비정형 원소(책상·규칙·성별·timestamp가 수가 아닌 이력)는 버림 — v2가 더 엄격, 실데이터 영향 없음으로 판단. 레거시 대조는 models.js 기준(store.js.importJSON은 로드 시 부작용).
- R82(품질 Important 4, 전부 수용): intField는 number/string만 parseInt(객체 → 기본값); 정수 필터는 Number.isSafeInteger; loadClassData의 비객체 JSON(null/[]/1)은 ok:false; 정크 입력 테스트에 해당 모양 추가. 접음: ASSIGNMENT_KEY_PATTERN 단일 소스, 픽스처 __proto__ 제거 단언, 한국어 오류 문구, stripDangerousKeys 1회 호출, 동어반복 safeParse 단언 제거.
- R64(보류 유지): `__proto__` 학생명은 stripDangerousKeys(레거시 sanitizeObj 동일)에서 키가 제거됨.
- intField는 배열 등 비원시 입력도 기본값으로(레거시는 String() 강제) — 안전 목적의 의도적 확장, 테스트로 고정.

## 보류(deferred minor)
- stripDangerousKeys 시그니처 `<T>(obj:T):T`가 실제 반환(널 프로토타입 복제)과 불일치 — 브리핑 인터페이스 유지, 후속 정리.
- 병적 중첩 깊이에서 스택 오버플로(호출자 try/catch로 기본값 폴백).
- 실제 교사 localStorage·실제 v1 백업 파일 미검증 → Task 17 Step 4(사용자).

커밋: 7107a0e, 40dc5a2
에스컬레이션: 없음
