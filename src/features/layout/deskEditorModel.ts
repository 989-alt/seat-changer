// 자유배치 편집기의 순수 계산. 화면(React)에서 떼어내 단위 테스트한다.
//
// 좌표계가 둘이다.
//   - 저장 좌표: layoutSettings.customDesks에 들어가는 값. 원점이 어디든 상관없다
//     (배치도·인쇄는 책상들을 감싼 상자를 기준으로 다시 축척한다).
//   - 화면 좌표: 편집기 캔버스 안의 위치. 저장 좌표 + 뷰포트 오프셋(dx, dy).
// v1은 캔버스 크기가 가변이라(legacy _fitCanvas) 저장 좌표의 원점이 제각각이다.
// 그래서 편집기는 책상을 감싼 상자를 캔버스 한가운데 놓는 오프셋을 만들어 쓰고,
// 저장 좌표 자체는 건드리지 않는다.
import type { Desk } from '@/core/model/types';

export const DESK_W = 60;
export const DESK_H = 40;
export const GRID_SIZE = 20;
// 레거시 _canvasW/_canvasH 기본값과 같은 최소 캔버스.
export const MIN_CANVAS_W = 600;
export const MIN_CANVAS_H = 400;
// 책상 상자와 캔버스 가장자리 사이 최소 여백.
export const CANVAS_PAD = GRID_SIZE;

export const snap = (v: number): number => Math.round(v / GRID_SIZE) * GRID_SIZE;
const ceilGrid = (v: number): number => Math.ceil(v / GRID_SIZE) * GRID_SIZE;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 캔버스 크기와 가운데 정렬 오프셋. 편집을 시작할 때 한 번 정해 고정한다. */
export interface Viewport {
  w: number;
  h: number;
  dx: number;
  dy: number;
}

export const EMPTY_VIEWPORT: Viewport = { w: MIN_CANVAS_W, h: MIN_CANVAS_H, dx: 0, dy: 0 };

/** 책상 전체를 감싸는 상자(저장 좌표). 책상이 없으면 null. */
export function deskBounds(desks: Desk[]): Rect | null {
  if (desks.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of desks) {
    x0 = Math.min(x0, d.x);
    y0 = Math.min(y0, d.y);
    x1 = Math.max(x1, d.x + DESK_W);
    y1 = Math.max(y1, d.y + DESK_H);
  }
  return { x0, y0, x1, y1 };
}

/**
 * 책상을 모두 담고 가운데에 놓는 뷰포트.
 * 오프셋은 격자에 맞춰 떨어뜨려(snap) 스냅된 책상이 격자 점 위에 그대로 남게 한다.
 */
export function computeViewport(desks: Desk[]): Viewport {
  const b = deskBounds(desks);
  if (!b) return EMPTY_VIEWPORT;
  const contentW = b.x1 - b.x0;
  const contentH = b.y1 - b.y0;
  const w = Math.max(MIN_CANVAS_W, ceilGrid(contentW + CANVAS_PAD * 2));
  const h = Math.max(MIN_CANVAS_H, ceilGrid(contentH + CANVAS_PAD * 2));
  return {
    w,
    h,
    dx: snap((w - contentW) / 2 - b.x0),
    dy: snap((h - contentH) / 2 - b.y0),
  };
}

/** 책상 하나가 캔버스 안에 머무는 저장 좌표 범위. */
export function deskLimits(vp: Viewport): { minX: number; maxX: number; minY: number; maxY: number } {
  // `|| 0`: dx가 0이면 -0이 나와 계산 결과에 -0이 섞인다(값은 같지만 비교에서 튄다).
  return {
    minX: -vp.dx || 0,
    maxX: vp.w - DESK_W - vp.dx,
    minY: -vp.dy || 0,
    maxY: vp.h - DESK_H - vp.dy,
  };
}

/** 책상 하나를 캔버스 안으로 접는다(저장 좌표). */
export function clampDesk(vp: Viewport, x: number, y: number): Desk {
  const l = deskLimits(vp);
  return {
    x: Math.max(l.minX, Math.min(l.maxX, x)),
    y: Math.max(l.minY, Math.min(l.maxY, y)),
  };
}

/** 고른 책상 전부가 캔버스 안에 남도록 이동량을 접는다. */
export function clampDelta(
  desks: Desk[],
  indices: number[],
  vp: Viewport,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const l = deskLimits(vp);
  let lo = -Infinity;
  let hi = Infinity;
  let top = -Infinity;
  let bottom = Infinity;
  for (const i of indices) {
    const d = desks[i];
    if (!d) continue;
    lo = Math.max(lo, l.minX - d.x);
    hi = Math.min(hi, l.maxX - d.x);
    top = Math.max(top, l.minY - d.y);
    bottom = Math.min(bottom, l.maxY - d.y);
  }
  if (lo === -Infinity) return { dx: 0, dy: 0 };
  return {
    dx: Math.max(lo, Math.min(hi, dx)),
    dy: Math.max(top, Math.min(bottom, dy)),
  };
}

/**
 * 고른 책상을 옮긴 결과.
 * 하나만 골랐으면 옮긴 자리를 격자에 스냅하고(원래 편집기 동작),
 * 여럿이면 이동량을 스냅한다 — 그래야 책상 사이 간격이 그대로 유지된다.
 */
export function moveSelection(
  desks: Desk[],
  indices: number[],
  dx: number,
  dy: number,
  vp: Viewport,
): Desk[] {
  if (indices.length === 0) return desks;
  if (indices.length === 1) {
    const i = indices[0]!;
    const d = desks[i];
    if (!d) return desks;
    const next = clampDesk(vp, snap(d.x + dx), snap(d.y + dy));
    return desks.map((cur, j) => (j === i ? next : cur));
  }
  const moved = clampDelta(desks, indices, vp, snap(dx), snap(dy));
  const chosen = new Set(indices);
  return desks.map((d, j) => (chosen.has(j) ? { x: d.x + moved.dx, y: d.y + moved.dy } : d));
}

/** 사각형(저장 좌표)과 조금이라도 겹치는 책상 번호. */
export function desksInRect(desks: Desk[], rect: Rect): number[] {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  const hit: number[] = [];
  desks.forEach((d, i) => {
    if (d.x < x1 && d.x + DESK_W > x0 && d.y < y1 && d.y + DESK_H > y0) hit.push(i);
  });
  return hit;
}

/** Shift+클릭 범위 선택. 방향과 무관하게 두 번호 사이를 모두 고른다. */
export function indexRange(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/** Ctrl+클릭 토글. 이미 골라 둔 것이면 빼고, 아니면 더한다. */
export function toggleIndex(selected: number[], i: number): number[] {
  return selected.includes(i) ? selected.filter((v) => v !== i) : [...selected, i];
}

/** 여러 개를 지운 뒤 남는 책상. 번호는 앞에서부터 다시 매겨진다. */
export function removeIndices(desks: Desk[], indices: number[]): Desk[] {
  const gone = new Set(indices);
  return desks.filter((_, i) => !gone.has(i));
}
