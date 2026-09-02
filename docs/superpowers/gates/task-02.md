# Task 02 — 게이트 스크립트와 기록 템플릿

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-02 14:3x | scan-emoji 테스트 먼저(모듈 없음 실패) → 구현. 각 수정 라운드도 RED→GREEN 증거 |
| G2 정적 검사 | 통과 | 15:5x | typecheck·lint 0 error |
| G3 단위 테스트 | 통과 | 15:5x | 44/44 (App 15, scan-emoji 11, eslint-core-boundary 18) |
| G4 스캔 | 통과 | 15:5x | `npm run scan` 위반 없음 |
| G5 스펙 리뷰 | 통과 | 14:5x | 루프 0회. minor: core 글로브 .tsx 누락(→R14에서 해소) |
| G6 품질 리뷰 | 통과 | 15:0x | 루프 1회. 마지막 지적: 허용 범위가 ✅❌⚡☀ 통과(→R11) |
| G7 시각 체크 | 해당 없음 | | |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 16:0x | 루프 3회(needs-attention→needs-attention→approve). 수용 5·기각 1·보류 0 |

## 판정 기록

- R9: 구현자가 CLI 스캔에서 `*.test.*`를 제외한 것 기각 → 테스트도 스캔, 픽스처는 런타임 결합.
- R11(품질): 허용 범위 U+2600~27BF 통째 → 명시적 허용 집합(✓✕✗★☆→←↑↓①~⑩) + `\p{Emoji_Presentation}|\p{Extended_Pictographic}`.
- R12(GPT 1차): 소스의 `\u{1F389}` 이스케이프가 런타임에 이모지 → 디코딩 후 검사. 픽스처는 `String.fromCodePoint`.
- R13(GPT 1차): 이미지 참조 검사 광역화(대소문자·`?url`·`new URL`·CSS `url()`·avif 등), walk에 js/jsx/cjs, src/ 아래 이미지 파일 자체 금지(`image-file`). AST/CSS 파서 도입은 기각(게이트 용도에 과함).
- R14(GPT 1차): core 경계 — 글로브 ts/tsx/js/jsx, 서브패스·상대경로 패턴, `no-restricted-syntax`(ImportExpression, globalThis), lintText 회귀 테스트.
- R15(GPT 2차): 배럴 디렉터리 import(`@/components`, `../../components`) 패턴 추가.
- R16(GPT 2차): 이스케이프 디코딩 백슬래시 홀짝 판정(`/\\\\u2705/` 오탐 제거).
- R17(GPT 2차): 문자열 결합·보간 경로 우회 — **기각**. 정적 텍스트 게이트의 보장 범위를 스크립트 주석·UI 체크리스트에 명시. 런타임 이미지 요청은 G7 네트워크 검사가 담당.

## 보류(deferred minor)
- 정규식 리터럴이 금지 코드포인트를 이스케이프로 참조하면(`/✅/`) 오탐 — 의도된 trade-off.
- `globalThis.x`에 규칙 2개가 동시에 걸려 오류가 2건 보고됨 — 무해.

커밋: 7ed3f8e, 6376a62, eff96a8, 3d3d189, 416c806
에스컬레이션: 없음
