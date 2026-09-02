# Task 06 — ChalkBoard·NoteSeat

| 게이트 | 결과 | 시각 | 비고 |
|---|---|---|---|
| G1 테스트 선행 | 통과 | 2026-09-02 18:3x | 모듈 없음 실패 → 구현. 수정 라운드 2회 모두 RED→GREEN |
| G2 정적 검사 | 통과 | 19:3x | |
| G3 단위 테스트 | 통과 | 19:3x | 112/112 (NoteSeat 17, ChalkBoard 3, contrast 20) |
| G4 스캔 | 통과 | 19:3x | |
| G5 스펙 리뷰 | 통과 | 18:5x | 루프 0회 |
| G6 품질 리뷰(Opus) | 통과 | 19:0x | 루프 1회. Critical: 빈 자리 opacity-50 대비 3.0:1; Important 4건 |
| G7 시각 체크 | 이관 | | Task 7: 5자 이름(황보아리랑) lg 이름표 잘림, 장식 배치·클릭 통과 |
| G8 E2E | 해당 없음 | | |
| G9 GPT 적대적 QA | 통과 | 19:4x | 루프 2회(needs-attention→needs-attention→approve). 수용 5·기각 0 |

## 판정 기록
- R20/R29(사전): 삭제 좌석은 불투명 paper + 점선 cork-dark 테두리 + ink 글자. 좌석 번호는 ink(mute는 paper-2 4.25, paper-3 4.46로 미달; 테스트가 미달을 문서화).
- R30(품질 Critical): "빈 자리" opacity-50 제거 → `text-ink font-normal`.
- R31: R20/R29를 지키는 클래스 단언 테스트.
- R32: 해당 상태의 핸들러가 없으면 native `disabled`(흐림 없음). **후속 계약**: 상호작용 좌석에는 반드시 핸들러를 넘길 것(없으면 탭 순서에서 빠짐).
- R33: highlight는 `ring-ink` + `data-highlight="true"`(gold는 cork 1.34:1).
- R34: `BOARD_BG='#26443C'` export, chalk-text 대비 9.33:1 테스트, 허용 조합 주석.
- R35: 지역변수 `disabled`→`isRemoved`.
- R36: empty aria-label `"{n}번 자리 (빈 자리)"`(label-in-name).
- R37: empty 상태는 name이 있어도 "빈 자리" 표시.
- R38(GPT 2차): onRestore 없는 삭제 좌석은 "삭제된 자리"/`(삭제됨)`, canRestore 파라미터.

## 보류(deferred minor)
- highlight+focus 동시일 때 ring-ink가 2색 포커스 링의 paper box-shadow를 덮음(외곽선 ink는 유지).
- "삭제된 자리"가 "(삭제됨)"의 부분 문자열이 아님(비활성 요소라 영향 없음).
- ChalkBoard label/className, NoteSeat variant/className 미테스트.

커밋: 6498cbd, 994fde5, 025004c
에스컬레이션: 없음
