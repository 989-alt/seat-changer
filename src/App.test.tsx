import { render, screen } from '@testing-library/react';
import { App, resolveRoute } from './App';
import { resolveRoute as viaAlias } from '@/App';

describe('@ 별칭', () => {
  it("'@/App'과 './App'이 같은 resolveRoute를 가리킨다", () => {
    expect(viaAlias).toBe(resolveRoute);
  });
});

describe('resolveRoute', () => {
  it('루트는 교사 화면', () => expect(resolveRoute('/')).toBe('teacher'));
  it('/present는 발표 화면', () => expect(resolveRoute('/present')).toBe('present'));
  it('/present/ (trailing slash)도 발표 화면', () => expect(resolveRoute('/present/')).toBe('present'));
  it('/presentations는 세그먼트 불일치라 교사 화면', () => expect(resolveRoute('/presentations')).toBe('teacher'));
  it('/dev/cork는 갤러리', () => expect(resolveRoute('/dev/cork')).toBe('dev-cork'));
  it('/dev/cork/ (trailing slash)도 갤러리', () => expect(resolveRoute('/dev/cork/')).toBe('dev-cork'));
  it('/dev/corks는 세그먼트 불일치라 교사 화면', () => expect(resolveRoute('/dev/corks')).toBe('teacher'));
  it('모르는 경로는 교사 화면', () => expect(resolveRoute('/foo')).toBe('teacher'));
  it("('/', '#student')는 v1 학생화면 호환으로 발표 화면", () =>
    expect(resolveRoute('/', '#student')).toBe('present'));
  it("('/present', '#student')도 발표 화면", () =>
    expect(resolveRoute('/present', '#student')).toBe('present'));
  it("('/', '#teacher')는 교사 화면", () => expect(resolveRoute('/', '#teacher')).toBe('teacher'));
});

describe('App', () => {
  it('pathname이 /present면 발표 화면을 렌더한다', () => {
    render(<App pathname="/present" />);
    expect(screen.getByRole('main')).toHaveAttribute('data-page', 'present');
  });

  it('pathname이 /면 교사 화면을 렌더한다', () => {
    render(<App pathname="/" />);
    expect(screen.getByRole('main')).toHaveAttribute('data-page', 'teacher');
  });

  it('pathname이 /dev/cork면 갤러리를 렌더한다', () => {
    render(<App pathname="/dev/cork" />);
    expect(screen.getByRole('main')).toHaveAttribute('data-page', 'dev-cork');
  });
});
