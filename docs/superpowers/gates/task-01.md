# Task 01 — 레거시 격리와 Vite 스캐폴드

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 예외 | 2026-09-02 13:58 | 스캐폴드 Task라 계획이 선행 실패 면제 |
| G2 정적 검사 | 통과 | 14:10 | typecheck(두 tsconfig 각각 --noEmit), lint는 Task 2에서 도입 |
| G3 단위 테스트 | 통과 | 14:10 | App.test.tsx 15/15 (라우팅 11 + 렌더 3 + alias 1) |
| G4 스캔 | 수동 | 14:05 | src/ 이모지·이미지 import 없음(리뷰어 확인). 스크립트는 Task 2 |
| G5 스펙 리뷰 | 통과 | 14:02 | 루프 0회. 지적 없음 |
| G6 품질 리뷰 | 통과 | 14:05 | 루프 1회. 마지막 지적: tsconfig.node.json 미연결 → 수정 |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 14:20 | 루프 1회(needs-attention→approve). 수용 4·기각 0·보류 0 |

## G9 1차 지적과 판정

1. `@` alias가 tsconfig에만 있고 Vite/Vitest resolve에 없음 — 수용(R4). vite.config.ts resolve.alias + alias 회귀 테스트.
2. 루트 `"type":"module"`이 legacy/build.js(CommonJS)를 깨뜨림 — 수용(R5). `legacy/package.json {type:commonjs}`만 추가. 번들 재생성 시 빈 줄 1개 차이 → 커밋하지 않음(R8: legacy 번들은 동결, 골든 테스트는 모듈을 import).
3. 라우팅 prefix 과포착(/presentations) + v1 `/#student` 북마크 호환 — 수용(R6). 세그먼트 정확 매칭, `resolveRoute(pathname, hash)`, 테스트 11건.
4. Vite 7.1.9 취약(GHSA-fx2h-pf6j-xcff 등) — 수용(R7). vite 7.3.6, vitest 3.2.7, audit 0건.

품질 리뷰 Important: tsconfig.node.json이 어디에도 참조되지 않음 — 수용(R3). references 추가 + typecheck 스크립트가 두 설정을 각각 검사. `noEmit`을 참조 대상 composite 설정 안에 두는 것은 TS6310 오류라 CLI `--noEmit`로 대체(R3 수정).

## 보류(deferred minor)
- resolveRoute 관련은 해결됨. 남은 것: test:cov가 core 없을 때 빈 집합으로 실패(Task 9 이후 자연 해소), isolatedModules 미설정, CLI --noEmit 의존 취약성에 주석 필요.

커밋: b7a4611, 0ccd4ac, 8e3013f
에스컬레이션: 없음
