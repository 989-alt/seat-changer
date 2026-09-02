import { render, screen } from '@testing-library/react';
import { App, resolveRoute } from './App';

describe('resolveRoute', () => {
  it('루트는 교사 화면', () => expect(resolveRoute('/')).toBe('teacher'));
  it('/present는 발표 화면', () => expect(resolveRoute('/present')).toBe('present'));
  it('/dev/cork는 갤러리', () => expect(resolveRoute('/dev/cork')).toBe('dev-cork'));
  it('모르는 경로는 교사 화면', () => expect(resolveRoute('/foo')).toBe('teacher'));
});

describe('App', () => {
  it('pathname에 맞는 페이지를 렌더한다', () => {
    render(<App pathname="/present" />);
    expect(screen.getByRole('main')).toHaveAttribute('data-page', 'present');
  });
});
