import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { SeatBoard } from './SeatBoard';

function makeData(patch: Partial<ClassData> = {}): ClassData {
  const base = createDefaultData();
  return {
    ...base,
    ...patch,
    layoutSettings: { ...base.layoutSettings, ...(patch.layoutSettings ?? {}) },
  };
}

function seatNodes(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-cork="note-seat"]'));
}

describe('SeatBoard 배치별 좌석 개수', () => {
  it('exam: columns x rows 만큼 렌더한다', () => {
    const { container } = render(
      <SeatBoard data={makeData({ layoutType: 'exam', layoutSettings: { columns: 3, rows: 2 } as never })} />,
    );
    expect(seatNodes(container)).toHaveLength(6);
    expect(screen.getByTestId('seat-board')).toHaveAttribute('data-layout', 'exam');
  });

  it('pair: 짝 묶음으로 나누어도 좌석 총수는 columns x rows 다', () => {
    const { container } = render(
      <SeatBoard data={makeData({ layoutType: 'pair', layoutSettings: { columns: 4, rows: 2 } as never })} />,
    );
    expect(seatNodes(container)).toHaveLength(8);
    // 짝 2칸이 한 묶음: 4열 -> 묶음 2개 x 2행 = 4묶음
    expect(container.querySelectorAll('[data-pair-group]')).toHaveLength(4);
  });

  it('ushape: columns + rows*2 만큼 절대 배치로 렌더한다', () => {
    const { container } = render(
      <SeatBoard data={makeData({ layoutType: 'ushape', layoutSettings: { columns: 4, rows: 2 } as never })} />,
    );
    expect(seatNodes(container)).toHaveLength(8);
    const slots = container.querySelectorAll<HTMLElement>('[data-abs-slot]');
    expect(slots).toHaveLength(8);
    expect(slots[0]!.style.left).not.toBe('');
  });

  it('custom: 책상 개수만큼 렌더한다', () => {
    const data = makeData({
      layoutType: 'custom',
      layoutSettings: {
        customDesks: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 0, y: 80 },
        ],
      } as never,
    });
    const { container } = render(<SeatBoard data={data} />);
    expect(seatNodes(container)).toHaveLength(3);
  });

  it('group: 모둠 크기 합만큼 렌더하고 모둠 이름 팻말을 붙인다', () => {
    const data = makeData({ layoutType: 'group', layoutSettings: { groupSizes: [4, 3] } as never });
    const { container } = render(<SeatBoard data={data} groupNames={{ 0: '사자', 1: '호랑이' }} />);
    expect(seatNodes(container)).toHaveLength(7);
    expect(container.querySelectorAll('[data-group-index]')).toHaveLength(2);
    expect(screen.getByText('사자')).toBeInTheDocument();
    expect(screen.getByText('호랑이')).toBeInTheDocument();
  });
});

describe('SeatBoard 모둠 블록 위치(groupPositions)', () => {
  // 코어(group.ts)가 groupPositions를 px/py에 반영한다. 배치도는 그 좌표를
  // 그대로 절대 배치해야 하며, 자체 격자로 다시 그려서는 안 된다.
  const makeGroup = (groupPositions: { groupIndex: number; x: number; y: number }[]) =>
    makeData({
      layoutType: 'group',
      layoutSettings: { groupSizes: [2, 2], groupLayoutMode: 'manual', groupPositions } as never,
    });

  const leftOf = (container: HTMLElement, index: number) =>
    Number.parseFloat(container.querySelector<HTMLElement>(`[data-abs-slot="${index}"]`)!.style.left);

  it('저장된 모둠 위치를 좌석 좌표로 그대로 따른다', () => {
    const { container } = render(
      <SeatBoard
        data={makeGroup([
          { groupIndex: 0, x: 0, y: 0 },
          { groupIndex: 1, x: 400, y: 0 },
        ])}
      />,
    );
    // 좌석 원본 px: 0, 68, 400, 468. 원본 좌석 한 칸(64px)이 이름표 한 칸(sm 84px)이
    // 되도록 축척하고, 좌석 중심으로 놓으므로 왼쪽 여백은 84/2 = 42px다.
    const k = 84 / 64; // 이름표 폭 / 모둠 좌석 폭(core/layouts/group.ts seatW)
    const at = (px: number) => px * k + 42;
    expect(leftOf(container, 0)).toBeCloseTo(at(0), 3);
    expect(leftOf(container, 1)).toBeCloseTo(at(68), 3);
    expect(leftOf(container, 2)).toBeCloseTo(at(400), 3);
    expect(leftOf(container, 3)).toBeCloseTo(at(468), 3);
    // 이웃한 좌석은 최소한 이름표 한 칸만큼 떨어져 겹치지 않는다
    expect(leftOf(container, 1) - leftOf(container, 0)).toBeGreaterThanOrEqual(84);
  });

  it('모둠 위치를 맞바꾸면 좌석 좌표의 좌우도 따라 바뀐다', () => {
    const a = render(
      <SeatBoard
        data={makeGroup([
          { groupIndex: 0, x: 0, y: 0 },
          { groupIndex: 1, x: 400, y: 0 },
        ])}
      />,
    ).container;
    const b = render(
      <SeatBoard
        data={makeGroup([
          { groupIndex: 0, x: 400, y: 0 },
          { groupIndex: 1, x: 0, y: 0 },
        ])}
      />,
    ).container;
    expect(leftOf(a, 0)).toBeLessThan(leftOf(a, 2));
    expect(leftOf(b, 0)).toBeGreaterThan(leftOf(b, 2));
  });

  it('교사 시선이면 좌석 좌표가 180도 뒤집힌다', () => {
    const data = makeGroup([
      { groupIndex: 0, x: 0, y: 0 },
      { groupIndex: 1, x: 400, y: 120 },
    ]);
    const student = render(<SeatBoard data={data} />).container;
    const teacher = render(<SeatBoard data={data} perspective="teacher" />).container;
    // 캔버스 폭 = (원본 span) * 축척 + 이름표 한 칸. 두 시선의 좌표 합이 그 폭이다.
    const width = 468 * (84 / 64) + 84;
    expect(leftOf(student, 0) + leftOf(teacher, 0)).toBeCloseTo(width, 3);
  });
});

describe('SeatBoard 시선(perspective)', () => {
  const data = makeData({ layoutType: 'exam', layoutSettings: { columns: 3, rows: 2 } as never });

  it('학생 시선은 칠판을 위에 두고 좌석을 인덱스 순으로 놓는다', () => {
    const { container } = render(<SeatBoard data={data} />);
    expect(seatNodes(container).map((n) => n.dataset.seat)).toEqual(['0', '1', '2', '3', '4', '5']);
    const board = screen.getByTestId('seat-board');
    expect(board.firstElementChild).toHaveAttribute('data-kind', 'board');
    expect(screen.getByText('칠 판')).toBeInTheDocument();
  });

  it('교사 시선은 행 역순·열 역순이고 교탁이 아래에 온다', () => {
    const { container } = render(<SeatBoard data={data} perspective="teacher" />);
    expect(seatNodes(container).map((n) => n.dataset.seat)).toEqual(['5', '4', '3', '2', '1', '0']);
    const board = screen.getByTestId('seat-board');
    expect(board.lastElementChild).toHaveAttribute('data-kind', 'podium');
    expect(screen.getByText('교 탁')).toBeInTheDocument();
  });

  it('교사 시선의 절대 배치는 좌표가 180도 뒤집힌다', () => {
    const abs = makeData({ layoutType: 'ushape', layoutSettings: { columns: 3, rows: 1 } as never });
    const student = render(<SeatBoard data={abs} />).container.querySelector<HTMLElement>('[data-abs-slot="0"]');
    const teacher = render(<SeatBoard data={abs} perspective="teacher" />).container.querySelector<HTMLElement>(
      '[data-abs-slot="0"]',
    );
    const pct = (v: string) => Number.parseFloat(v);
    expect(pct(student!.style.left) + pct(teacher!.style.left)).toBeCloseTo(100, 3);
    expect(pct(student!.style.top) + pct(teacher!.style.top)).toBeCloseTo(100, 3);
  });
});

describe('SeatBoard 비활성 좌석', () => {
  const data = makeData({
    layoutType: 'exam',
    layoutSettings: { columns: 3, rows: 1, disabledSeats: [1] } as never,
  });

  it('editable이면 되살리기 버튼을 눌러 복구를 요청한다', async () => {
    const onSeatRestore = vi.fn();
    render(<SeatBoard data={data} editable onSeatRestore={onSeatRestore} />);
    await userEvent.click(screen.getByRole('button', { name: '2번 자리 되살리기' }));
    expect(onSeatRestore).toHaveBeenCalledWith(1);
  });

  it('editable이 아니면 좌석 대신 빈 공간을 남겨 격자 흐름을 유지한다', () => {
    const { container } = render(<SeatBoard data={data} />);
    expect(seatNodes(container)).toHaveLength(2);
    const blank = container.querySelector('[data-seat="1"]')!;
    expect(blank).toHaveAttribute('aria-hidden', 'true');
    expect(blank.className).toContain('pointer-events-none');
    // 격자 자리는 유지된다 (좌석 2개 + 빈 공간 1개)
    expect(container.querySelectorAll('[data-seat]')).toHaveLength(3);
  });
});

describe('SeatBoard 공개(revealedSeats)', () => {
  const data = makeData({ layoutType: 'exam', layoutSettings: { columns: 2, rows: 1 } as never });
  const mapping = { 0: '김하람', 1: '이도윤' };

  it('기본값 all이면 모든 이름이 보인다', () => {
    render(<SeatBoard data={data} mapping={mapping} />);
    expect(screen.getByText('김하람')).toBeInTheDocument();
    expect(screen.getByText('이도윤')).toBeInTheDocument();
  });

  it('배열이면 미공개 좌석의 이름은 DOM에 남지 않는다', () => {
    const { container } = render(<SeatBoard data={data} mapping={mapping} revealedSeats={[0]} />);
    expect(screen.getByText('김하람')).toBeInTheDocument();
    expect(screen.queryByText('이도윤')).toBeNull();
    expect(container.textContent).not.toContain('이도윤');
    expect(container.querySelector('[data-seat="1"]')).toHaveAttribute('data-state', 'empty');
  });

  it('미공개 좌석은 역할 라벨도 숨긴다', () => {
    render(<SeatBoard data={data} mapping={mapping} roles={{ 0: '모둠장', 1: '기록이' }} revealedSeats={[0]} />);
    expect(screen.getByText('모둠장')).toBeInTheDocument();
    expect(screen.queryByText('기록이')).toBeNull();
  });
});

describe('SeatBoard 고정 좌석', () => {
  const data = makeData({
    layoutType: 'exam',
    layoutSettings: { columns: 2, rows: 1 } as never,
    fixedSeats: [{ studentName: '김하람', seatIndex: 0 }],
  });

  it('고정 좌석은 fixed 상태로 렌더한다', () => {
    const { container } = render(<SeatBoard data={data} mapping={{ 0: '김하람', 1: '이도윤' }} />);
    expect(container.querySelector('[data-seat="0"]')).toHaveAttribute('data-state', 'fixed');
    expect(container.querySelector('[data-seat="1"]')).toHaveAttribute('data-state', 'assigned');
  });

  it('fixedMode면 고정 좌석을 강조한다', () => {
    const { container } = render(<SeatBoard data={data} fixedMode />);
    expect(container.querySelector('[data-seat="0"]')).toHaveAttribute('data-highlight', 'true');
    expect(container.querySelector('[data-seat="1"]')).not.toHaveAttribute('data-highlight');
  });
});

describe('SeatBoard 상호작용과 크기', () => {
  const data = makeData({ layoutType: 'exam', layoutSettings: { columns: 2, rows: 1 } as never });

  it('onSeatClick이 좌석 인덱스를 넘긴다', async () => {
    const onSeatClick = vi.fn();
    render(<SeatBoard data={data} onSeatClick={onSeatClick} />);
    await userEvent.click(screen.getByRole('button', { name: '2번 자리 (빈 자리)' }));
    expect(onSeatClick).toHaveBeenCalledWith(1);
  });

  it('핸들러가 없으면 좌석 버튼은 네이티브 disabled 다', () => {
    render(<SeatBoard data={data} />);
    expect(screen.getByRole('button', { name: '1번 자리 (빈 자리)' })).toBeDisabled();
  });

  it('size=lg는 발표 화면용 큰 좌석을 쓴다', () => {
    const { container } = render(<SeatBoard data={data} size="lg" />);
    expect(container.querySelector('[data-seat="0"]')).toHaveAttribute('data-size', 'lg');
  });

  it('highlightSeats로 강조 좌석을 지정한다', () => {
    const { container } = render(<SeatBoard data={data} highlightSeats={[1]} />);
    expect(container.querySelector('[data-seat="1"]')).toHaveAttribute('data-highlight', 'true');
  });

  it('flipping이면 연출 표식을 남긴다', () => {
    render(<SeatBoard data={makeData()} flipping />);
    expect(screen.getByTestId('seat-board')).toHaveAttribute('data-flipping', 'true');
  });

  it('자리가 없으면 안내 문구를 보여준다', () => {
    render(<SeatBoard data={makeData({ layoutType: 'custom' })} />);
    expect(screen.getByText('배치할 자리가 없습니다.')).toBeInTheDocument();
  });
});
