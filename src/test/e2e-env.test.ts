import { shouldReuseServer } from '../../scripts/e2e-env.mjs';

describe('shouldReuseServer', () => {
  it("센티널 '1'일 때만 재사용한다", () => {
    expect(shouldReuseServer({ PW_REUSE_SERVER: '1' })).toBe(true);
  });

  it.each(['false', '0', 'true', 'yes', '', ' 1', '11'])('%o 는 재사용하지 않는다', (value) => {
    expect(shouldReuseServer({ PW_REUSE_SERVER: value })).toBe(false);
  });

  it('설정되지 않으면 재사용하지 않는다', () => {
    expect(shouldReuseServer({})).toBe(false);
    expect(shouldReuseServer()).toBe(false);
  });
});
