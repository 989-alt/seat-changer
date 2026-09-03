# Task 11 — 랜덤화 보조 모듈 (rng·룩업·인접·성별)

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 14:0x | helpers.test.ts 모듈 없음 실패 → 구현 |
| G2 정적 검사 | 통과 | 14:1x | core 경계 ESLint 포함 |
| G3 단위 테스트 | 통과 | 14:1x | 305/305 (randomizer 41). core 커버리지 98.8% 라인 |
| G4 스캔 | 통과 | 14:1x | |
| G5 스펙 리뷰 | 통과 | 14:3x | 루프 0회. 본문 줄 단위 대조 일치, shuffle 상수는 레거시 복사본으로 유도(브리핑 초안 상수는 오류였음) |
| G6 품질 리뷰(Opus) | 통과 | 14:3x | 루프 0회(Approved). 경미 5건은 G9 수정 라운드에 접음 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 기각 1건 보류 | 14:5x | 루프 2회(needs-attention→needs-attention). 수용 1(R63)·기각 1(R64) |

## 판정 기록
- R60: `precomputeGenderSeats`는 브리핑 인터페이스대로 genderRule 'none'이면 `null`(레거시는 null을 반환하지 않음) → **Task 12는 null을 "모든 학생이 availableSeats 전부 사용 가능"으로 처리해야 함**.
- R61: `buildAdjacencyMap`은 브리핑 Step 3의 `getLayout().distance`가 아니라 레거시대로 row/col Manhattan-1(상하좌우) → exam 6×5에서 0번 좌석 인접은 `[1, 6]`. lookup.ts는 layouts를 import하지 않음.
- 레거시 mixed 분기의 `slack1 === slack2` 항등으로 도달 불가한 else는 그대로 보존(커버리지 미달 2줄).
- `posMap` 미사용 매개변수(레거시도 무시), `|| 'none'`·`|| {}` 방어 폴백은 타입·스키마가 보장하므로 제거.
- R62(품질): GenderSeatSets의 Set은 여러 학생이 같은 참조를 공유(레거시 배열 별칭과 동일) → Task 12는 읽기 전용으로 취급. 문서 주석 추가.
- R64(GPT 2차, 기각): `__proto__`라는 학생 이름은 ClassDataSchema의 z.record 파싱에서 키가 탈락해 성별이 사라진다는 지적 — 스키마(Task 8) 영역이며 학생 이름으로 비현실적, 크래시 없이 "성별 미상=전 좌석 허용"으로 퇴화하므로 보류. Task 15 마이그레이션에서 예약 이름 정리 여부 재검토.
- R63(GPT): 학생 이름을 일반 객체 키로 쓰면 `toString`·`constructor`·`__proto__`가 룩업을 깨뜨림 → `Object.create(null)` + `Object.hasOwn`. 타입은 유지. Task 12의 `studentGenders[name]` 등 이름 키 접근도 hasOwn 안전 접근.

## 보류(deferred minor)
- 품질 경미 5건은 모두 수정 라운드 1에 접어 해소. 남은 주의: 이름 키 맵 소비자는 `map.hasOwnProperty(k)`가 아니라 `Object.hasOwn(map, k)`를 써야 함(null 프로토타입).

커밋: af91bf3, 3a2d147
에스컬레이션: 없음
