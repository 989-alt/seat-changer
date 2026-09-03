# Task 07 — /dev/cork 갤러리·Playwright 시각 게이트 (Phase 0 게이트)

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-03 09:5x | e2e 스펙이 갤러리 rewrite 전 실패 → 구현 후 통과. 수정 라운드 2회 모두 RED→GREEN |
| G2 정적 검사 | 통과 | 10:4x | typecheck(두 설정 CLI)·lint·scan |
| G3 단위 테스트 | 통과 | 10:4x | 121/121 (e2e-env 9 신규) |
| G4 스캔 | 통과 | 10:4x | 이모지·이미지 경로 없음 |
| G5 스펙 리뷰 | 통과 | 10:0x | 지적 2건(Step 4·5 미수행)은 컨트롤러 소관으로 판결(R41), 코드 결함 없음 |
| G6 품질 리뷰(Opus) | 통과 | 10:0x | 루프 1회. Important 3: 클릭 통과 검증 무의미·reuseExistingServer 상시·스크린샷 최후 실행 |
| G7 시각 체크 | 통과 | 10:0x | `test-results/dev-cork.png`, `dev-cork-1080.png` (1920×1080). 이모지 없음·cork 위 ink·5자 이름 미잘림·압정 중앙·강조 링·삭제 좌석 점선. 포커스 링·reduced-motion은 단위 테스트로 대체(e2e 보류) |
| G8 E2E | 통과 | 10:4x | 4/4 (렌더+스크린샷 / 계산 스타일·폰트 / 장식·클릭 통과·좌석 상태 전수 / 이름 잘림·이미지 요청 0) |
| G9 GPT 적대적 QA | 상한 도달 | 10:5x | 루프 3회(모두 needs-attention, 회차별 4→3→1건으로 수렴). 수용 8·기각 2(픽셀 기준선, 404 스텁 회귀 테스트). 3회 상한으로 마지막 수정은 범위 한정 재리뷰만 |

## 판정 기록
- R39: tsconfig.node.json `skipLibCheck: true`만 채택(DOM lib 불필요, e2e/는 tsconfig.json에서 검사).
- R40: `scripts/run-e2e.mjs` 유지 — Playwright 트랜스폼 캐시가 한글 TEMP 경로에 생기면 0xC0000409 크래시. PWTEST_CACHE_DIR을 저장소 안 ASCII 경로로 고정.
- R41: Step 4(G7 판정)·Step 5(게이트 기록)는 컨트롤러 소관(Task 1~6과 동일).
- R42(품질 Important): 클릭 통과 검증 — Tape·PushPin 계산된 `pointer-events: none` 단언 + tape∩seat 교집합 내부 클릭 + 좌석 enabled/disabled 전수 검사(삭제 불가 좌석만 disabled).
- R43: `reuseExistingServer`는 옵트인 → R48에서 `PW_REUSE_SERVER === '1'` 센티널로 강화(`scripts/e2e-env.mjs` + 단위 테스트).
- R44: 단일 거대 테스트를 4개로 분할, 스크린샷은 가시성 단언 직후 촬영.
- R45(GPT high, 기각): `toHaveScreenshot` 픽셀 기준선은 OS별 폰트·AA 편차로 불안정, G7은 사람이 보는 스크린샷 게이트 → 대체로 h1 색 = ink, 강조 좌석 box-shadow에 ink 포함(비강조엔 없음) 단언.
- R46: 폰트 실측 — `document.fonts.check`는 스타일시트 차단 시에도 true(실측) → FontFace `status === 'loaded'` 확인 + font/stylesheet `requestfailed` 추적. R48에서 폰트 의존 테스트 전부에 공통 헬퍼 적용.
- R47: 빈 PWTEST_CACHE_DIR 무시, win32에서 ASCII 검증(코드포인트 비교; 제어문자 정규식은 eslint `no-control-regex`). R48에서 repoRoot 기준 절대경로로 resolve 후 검사·전달.
- R51(GPT 3차): Gaegu 400만 로드되고 700이 404여도 통과하던 검사 → `document.fonts.load('700 28px Gaegu', '황보아리랑')` 결과 ≥1 + Gaegu face에 `status === 'error'` 없음. 404 스텁 회귀 테스트는 기각(게이트보다 무거움).
- R50: tsconfig.json `references`·tsconfig.node.json `composite` 제거 — typecheck가 두 설정을 CLI로 각각 돌리므로 `tsc -b` 전용 참조는 충돌(TS6305)만 유발.

## 보류(deferred minor)
- 압정 배치 허용 오차(±12px / −14~+4px) 느슨함 — 기울기 수식 주석 또는 무기울기 카드에서 조이기.
- e2e의 INK/CORK rgb 상수는 globals.css 토큰 손복사(tokens.test.ts가 원본을 보호).
- run-e2e.mjs `child.on('error')`·SIGINT 전달 없음.
- R23 reduced-motion e2e 미단언(단위 테스트로 대체).
- e2e는 Google Fonts 네트워크 필요(오프라인 러너 불가) — 의도된 결과.
- R49: `src/test/eslint-core-boundary.test.ts` 첫 케이스 3~5s로 기본 타임아웃 경계 → 20s로 상향(다음 배치에 포함).

커밋: aefd8ea, 3e46850, 15e2931, 8b18535, f841512
에스컬레이션: 없음
