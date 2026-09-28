import { fitPrintPage, PRINT_MARGIN_MM, PRINT_TITLE_PX } from './printFit';

const PX_PER_MM = 96 / 25.4;
const SHORT = (210 - PRINT_MARGIN_MM * 2) * PX_PER_MM;
const LONG = (297 - PRINT_MARGIN_MM * 2) * PX_PER_MM;

describe('fitPrintPage', () => {
  it('가로로 긴 배치도는 가로 용지를 고르고 폭에 맞춰 줄인다', () => {
    const fit = fitPrintPage(1280, 540);
    expect(fit.orientation).toBe('landscape');
    expect(fit.zoom).toBeCloseTo(0.785, 2);
  });

  it('세로로 긴 배치도는 세로 용지를 고른다', () => {
    const fit = fitPrintPage(400, 900);
    expect(fit.orientation).toBe('portrait');
    expect(fit.zoom).toBeCloseTo(1.074, 2);
  });

  it('작은 배치도는 2배까지만 키운다', () => {
    expect(fitPrintPage(200, 100)).toEqual({ orientation: 'landscape', zoom: 2 });
  });

  it('크기를 모르면(0) 가로 용지·원래 크기', () => {
    expect(fitPrintPage(0, 0)).toEqual({ orientation: 'landscape', zoom: 1 });
  });

  it.each([
    [1280, 540],
    [1700, 700],
    [400, 900],
    [900, 900],
    [3000, 400],
  ])('%i x %i 는 고른 용지 한 장에 들어간다', (w, h) => {
    const { orientation, zoom } = fitPrintPage(w, h);
    const [pageW, pageH] = orientation === 'landscape' ? [LONG, SHORT] : [SHORT, LONG];
    expect(w * zoom).toBeLessThanOrEqual(pageW);
    expect(h * zoom + PRINT_TITLE_PX).toBeLessThanOrEqual(pageH);
  });
});
