// 인쇄 용지 방향과 배율(개선 스펙 3-3). A4 인쇄 영역을 CSS px(96dpi)로 환산해
// 배치도가 더 크게 들어가는 방향을 고르고, 그 방향에서 한 장에 꽉 차는 배율을 돌려준다.
export type PrintOrientation = 'landscape' | 'portrait';

export interface PrintFit {
  orientation: PrintOrientation;
  zoom: number;
}

/** 용지 여백(mm). PresentPage의 @page 규칙과 같은 값을 쓴다. */
export const PRINT_MARGIN_MM = 10;
/** 인쇄 페이지 제목 줄("[ 6-5 · 학생 시선 ]")과 아래 간격이 차지하는 높이(px). present.css와 같다. */
export const PRINT_TITLE_PX = 40;

const PX_PER_MM = 96 / 25.4;
const SHORT = (210 - PRINT_MARGIN_MM * 2) * PX_PER_MM; // 약 718px
const LONG = (297 - PRINT_MARGIN_MM * 2) * PX_PER_MM; // 약 1047px
/** 아주 작은 반이 종이에서 지나치게 커지지 않게 묶는 위쪽 한계. */
const MAX_ZOOM = 2;
/** 브라우저마다 다른 글꼴·반올림 차이로 한 장을 넘기지 않게 남기는 여유. */
const SAFETY = 0.96;

export function fitPrintPage(boardW: number, boardH: number): PrintFit {
  if (!(boardW > 0) || !(boardH > 0)) return { orientation: 'landscape', zoom: 1 };
  const landscape = Math.min(LONG / boardW, (SHORT - PRINT_TITLE_PX) / boardH);
  const portrait = Math.min(SHORT / boardW, (LONG - PRINT_TITLE_PX) / boardH);
  const orientation: PrintOrientation = landscape >= portrait ? 'landscape' : 'portrait';
  const best = orientation === 'landscape' ? landscape : portrait;
  const zoom = Math.min(MAX_ZOOM, best * SAFETY);
  return { orientation, zoom: Math.round(zoom * 1000) / 1000 };
}
