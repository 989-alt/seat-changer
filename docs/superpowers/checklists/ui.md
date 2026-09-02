# UI 시각 체크리스트 (G7)

스크린샷은 1920×1080, `npx playwright test e2e/<page>.spec.ts`가 `test-results/`에 남긴다.

- [ ] 이모지가 한 글자도 없다 (아이콘은 lucide 선 아이콘)
- [ ] 발표 화면 이름표 글자 28px 이상, 칠판 글자 32px 이상
- [ ] 글자·배경 대비비 4.5:1 이상 (paper 위 ink, chalk 위 chalk-text)
- [ ] 텍스트 잘림·겹침 없음 (이름 5자 "황보아리랑" 기준)
- [ ] 코르크 질감·종이 줄·테이프·압정이 CSS로만 그려졌다 (네트워크 탭에 이미지 요청 없음)
- [ ] 포커스 링이 보인다 (Tab 이동)
- [ ] prefers-reduced-motion에서 동작이 깨지지 않는다
