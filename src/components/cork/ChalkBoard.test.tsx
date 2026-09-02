import { render, screen } from '@testing-library/react';
import { ChalkBoard, BOARD_BG } from './ChalkBoard';

describe('ChalkBoard', () => {
  it('기본은 칠판', () => {
    render(<ChalkBoard />);
    expect(screen.getByText('칠 판')).toHaveAttribute('data-kind', 'board');
  });
  it('교탁', () => {
    render(<ChalkBoard kind="podium" />);
    expect(screen.getByText('교 탁')).toHaveAttribute('data-kind', 'podium');
  });

  // R34: 배경색은 Tailwind가 보간할 수 없어 클래스는 리터럴로 유지하되, BOARD_BG
  // 상수와 값이 어긋나지 않는지 테스트로 대조한다(contrast.test.ts도 같은 상수를 쓴다).
  it('R34: 루트 클래스가 BOARD_BG 리터럴을 포함한다', () => {
    render(<ChalkBoard />);
    expect(screen.getByText('칠 판').className).toContain(`bg-[${BOARD_BG}]`);
  });
});
