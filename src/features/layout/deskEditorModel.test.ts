import { describe, it, expect } from 'vitest';
import {
  DESK_W,
  DESK_H,
  MIN_CANVAS_W,
  MIN_CANVAS_H,
  clampDelta,
  clampDesk,
  computeViewport,
  deskBounds,
  desksInRect,
  indexRange,
  moveSelection,
  removeIndices,
  toggleIndex,
} from './deskEditorModel';
import type { Desk } from '@/core/model/types';

const desk = (x: number, y: number): Desk => ({ x, y });

describe('deskBounds', () => {
  it('책상이 없으면 null이다', () => {
    expect(deskBounds([])).toBeNull();
  });

  it('책상 크기까지 포함한 상자를 준다', () => {
    expect(deskBounds([desk(100, 100), desk(200, 60)])).toEqual({
      x0: 100,
      y0: 60,
      x1: 200 + DESK_W,
      y1: 100 + DESK_H,
    });
  });
});

describe('computeViewport', () => {
  it('책상이 없으면 최소 캔버스에 오프셋 없음', () => {
    expect(computeViewport([])).toEqual({ w: MIN_CANVAS_W, h: MIN_CANVAS_H, dx: 0, dy: 0 });
  });

  it('책상이 캔버스 가운데 오도록 좌우 여백을 맞춘다', () => {
    const desks = [desk(100, 100), desk(200, 100)];
    const vp = computeViewport(desks);
    const contentW = 200 + DESK_W - 100;
    const left = 100 + vp.dx;
    const right = vp.w - (left + contentW);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(10); // 오프셋을 격자에 스냅한 만큼만 어긋난다
  });

  it('v1처럼 원점이 치우친 좌표도 가운데로 온다', () => {
    // 4열 21개. x는 155부터 155씩, y는 62부터 68씩(스냅 안 된 v1 드래그 좌표).
    const desks = Array.from({ length: 21 }, (_, i) =>
      desk(155 + (i % 4) * 155, 62 + Math.floor(i / 4) * 68),
    );
    const vp = computeViewport(desks);
    const b = deskBounds(desks)!;
    const left = b.x0 + vp.dx;
    const right = vp.w - (b.x1 + vp.dx);
    const top = b.y0 + vp.dy;
    const bottom = vp.h - (b.y1 + vp.dy);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(10);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(10);
  });

  it('책상이 최소 캔버스보다 넓게 퍼지면 캔버스를 키운다', () => {
    const desks = [desk(0, 0), desk(900, 500)];
    const vp = computeViewport(desks);
    expect(vp.w).toBeGreaterThanOrEqual(900 + DESK_W);
    expect(vp.h).toBeGreaterThanOrEqual(500 + DESK_H);
  });
});

describe('clampDesk', () => {
  it('오프셋이 걸려 있어도 화면 안에 머문다', () => {
    const vp = { w: 600, h: 400, dx: -120, dy: -40 };
    // 화면 좌표 0..540 = 저장 좌표 120..660
    expect(clampDesk(vp, 0, 0)).toEqual({ x: 120, y: 40 });
    expect(clampDesk(vp, 9999, 9999)).toEqual({ x: 660, y: 400 });
    expect(clampDesk(vp, 300, 200)).toEqual({ x: 300, y: 200 });
  });
});

describe('clampDelta', () => {
  const vp = { w: 600, h: 400, dx: 0, dy: 0 };

  it('가장 먼저 벽에 닿는 책상 기준으로 이동량을 접는다', () => {
    const desks = [desk(0, 0), desk(500, 300)];
    // 왼쪽 책상이 이미 왼쪽 벽이라 왼쪽으로는 못 간다
    expect(clampDelta(desks, [0, 1], vp, -100, 0).dx).toBe(0);
    // 오른쪽 책상이 540(=600-60)에서 멈춘다
    expect(clampDelta(desks, [0, 1], vp, 100, 0).dx).toBe(40);
  });

  it('고른 책상이 없으면 움직이지 않는다', () => {
    expect(clampDelta([], [], vp, 50, 50)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('moveSelection', () => {
  const vp = { w: 600, h: 400, dx: 0, dy: 0 };

  it('하나만 골랐으면 옮긴 자리를 격자에 스냅한다', () => {
    const desks = [desk(155, 62)];
    expect(moveSelection(desks, [0], 5, 5, vp)).toEqual([desk(160, 60)]);
  });

  it('여럿이면 이동량을 스냅해 간격을 그대로 지킨다', () => {
    const desks = [desk(155, 62), desk(310, 62)];
    const next = moveSelection(desks, [0, 1], 25, 0, vp);
    expect(next).toEqual([desk(175, 62), desk(330, 62)]);
    expect(next[1]!.x - next[0]!.x).toBe(155);
  });

  it('고르지 않은 책상은 그대로 둔다', () => {
    const desks = [desk(100, 100), desk(200, 100), desk(300, 100)];
    const next = moveSelection(desks, [0, 2], 20, 0, vp);
    expect(next[1]).toEqual(desk(200, 100));
  });
});

describe('desksInRect', () => {
  const desks = [desk(0, 0), desk(200, 0), desk(400, 200)];

  it('조금이라도 겹치는 책상을 고른다', () => {
    expect(desksInRect(desks, { x0: 190, y0: -10, x1: 210, y1: 10 })).toEqual([1]);
  });

  it('사각형을 어느 방향으로 그려도 같다', () => {
    const a = desksInRect(desks, { x0: 0, y0: 0, x1: 300, y1: 100 });
    const b = desksInRect(desks, { x0: 300, y0: 100, x1: 0, y1: 0 });
    expect(a).toEqual([0, 1]);
    expect(b).toEqual(a);
  });

  it('닿지 않으면 아무것도 안 고른다', () => {
    expect(desksInRect(desks, { x0: 100, y0: 100, x1: 150, y1: 150 })).toEqual([]);
  });
});

describe('선택 목록', () => {
  it('indexRange는 방향과 무관하게 사이를 모두 고른다', () => {
    expect(indexRange(2, 5)).toEqual([2, 3, 4, 5]);
    expect(indexRange(5, 2)).toEqual([2, 3, 4, 5]);
    expect(indexRange(3, 3)).toEqual([3]);
  });

  it('toggleIndex는 있으면 빼고 없으면 더한다', () => {
    expect(toggleIndex([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleIndex([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('removeIndices는 고른 책상을 모두 지운다', () => {
    const desks = [desk(0, 0), desk(100, 0), desk(200, 0)];
    expect(removeIndices(desks, [0, 2])).toEqual([desk(100, 0)]);
  });
});
