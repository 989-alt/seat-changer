import { render, screen } from '@testing-library/react';
import { ChalkBoard } from './ChalkBoard';

describe('ChalkBoard', () => {
  it('기본은 칠판', () => {
    render(<ChalkBoard />);
    expect(screen.getByText('칠 판')).toHaveAttribute('data-kind', 'board');
  });
  it('교탁', () => {
    render(<ChalkBoard kind="podium" />);
    expect(screen.getByText('교 탁')).toHaveAttribute('data-kind', 'podium');
  });
});
