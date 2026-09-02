import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WoodButton, WOOD_TEXT } from './WoodButton';

describe('WoodButton', () => {
  it('클릭이 전달된다', async () => {
    const onClick = vi.fn();
    render(<WoodButton onClick={onClick}>규칙 검사</WoodButton>);
    await userEvent.click(screen.getByRole('button', { name: '규칙 검사' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('variant·size 클래스', () => {
    render(<WoodButton variant="danger" size="lg">자리 뽑기</WoodButton>);
    const b = screen.getByRole('button');
    expect(b).toHaveAttribute('data-variant', 'danger');
    expect(b).toHaveAttribute('data-size', 'lg');
  });
  it('disabled면 aria-disabled', () => {
    render(<WoodButton disabled>저장</WoodButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('danger 버튼 텍스트 색은 WOOD_TEXT 상수와 일치한다 (R28 드리프트 방지)', () => {
    render(<WoodButton variant="danger">자리 뽑기</WoodButton>);
    expect(screen.getByRole('button').className).toContain(`text-[${WOOD_TEXT}]`);
  });
});
