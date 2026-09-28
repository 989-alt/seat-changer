import { seatFontSizes } from './boardImage';

describe('seatFontSizes', () => {
  it('발표용 이름표(100px)에서 이름 42px, 번호 14px', () => {
    expect(seatFontSizes(100)).toEqual({ name: 42, number: 14 });
  });

  it('작은 이름표에서도 읽을 수 있는 최소 크기를 지킨다', () => {
    expect(seatFontSizes(20)).toEqual({ name: 12, number: 10 });
  });
});
