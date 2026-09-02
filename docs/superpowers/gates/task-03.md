# Task 03 — 디자인 토큰·글꼴·코르크 질감 유틸리티

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-02 16:1x | tokens.test 13 fail → 구현. 수정 라운드도 RED→GREEN |
| G2 정적 검사 | 통과 | 16:4x | |
| G3 단위 테스트 | 통과 | 16:4x | 71/71 (styles: tokens 15 + contrast 12) |
| G4 스캔 | 통과 | 16:4x | |
| G5 스펙 리뷰 | 통과 | 16:2x | 루프 0회. minor: .texture-wood border-color 비토큰(#5E3A1B) |
| G6 품질 리뷰 | 통과 | 16:2x | 루프 1회. 마지막 지적: 테스트가 속성명 대소문자 오타 통과(R19), 보고서 오기(R18 정정) |
| G7 시각 체크 | 해당 없음 | | Task 7에서 computed-style 검사로 토큰·질감·글꼴 실적용 확인(R24 이관) |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 16:5x | 루프 2회(needs-attention→approve). 수용 4·부분수용 1·기각 0 |

## 판정 기록

- R18: 구현자 보고서의 "bg-cork가 dist에 없음" 주장은 오류(페이지가 이미 사용) → 보고서에 정정 추가.
- R19(품질): 토큰 테스트 속성명 정확 대소문자 매칭 + 부정 테스트.
- R20(GPT): cork(#C8955A)/paper(#FFFBF0) 대비 2.57:1 → **cork 위 글자는 ink** 규칙. `contrast.test.ts`(WCAG 공식 직접 구현) 허용 조합 7쌍 ≥4.5, 금지 조합 <4.5 단언. globals.css 상단에 허용/금지 조합 주석. 자리표시 페이지 제목 text-ink. **후속 Task에 적용**: T6 NoteSeat disabled 상태는 투명 배경 위 paper 글자 금지, T7 코르크 위 제목은 ink.
- R21(GPT): 포커스 링 gold 1.34:1 → ink 외곽선 3px + paper box-shadow 6px 2색 링. 비텍스트 3:1 단언 4쌍.
- R22(GPT): `@layer utilities` 커스텀 클래스는 Tailwind 4 유틸리티가 아님 → `@utility` 8개로 전환. TeacherPage `<main>`이 texture-cork 소비. 발견: Tailwind content 스캐너가 테스트 파일의 클래스 문자열도 읽어 '사용됨'으로 오판할 수 있음.
- R23(GPT): reduced-motion은 `animation: none; transition: none; scroll-behavior: auto`. **후속 규칙**: 모든 컴포넌트는 애니메이션 없이도 정지 상태가 보여야 함(opacity 0로 대기 금지).
- R24(GPT, 부분): 컴파일 산출물 검증은 Task 7 Playwright computed-style 검사로 이관(body 배경, texture 그라디언트, font-family).

## 보류(deferred minor)
- .texture-wood border-color 비토큰. url() 검사 정규식 i 플래그·data: URI 미검사. __dirname 스타일 불일치. DevCorkPage/PresentPage main은 아직 bg-cork(Task 7에서 texture-cork로).

커밋: c8eea93, b70d121
에스컬레이션: 없음
