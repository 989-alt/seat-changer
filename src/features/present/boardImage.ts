// 이미지 저장 그리기 (legacy/js/screens/student-screen.js:1074-1155 renderToCanvas 이식).
// 여백·제목 높이·2배 스케일·둥근 모서리·제목 문구·파일명 규칙은 레거시 그대로다.
// 색만 v1 팔레트(#F8FAFC 등)에서 v2 코르크 팔레트로 바꿨다 — v2에는 그 색이 없다.
// 개선 스펙 3-5: 글자 크기는 이름표 상자 크기에 비례하고, 고정 자리 전용 색은 없다
// (학생이 보는 결과물에 고정 자리를 드러내지 않는다). 이름은 data-seat-name에서 읽는다.
const PADDING = 40;
const TITLE_HEIGHT = 50;
// 저장 파일 확장자. G4 스캐너(scripts/scan-emoji.mjs)는 소스에 이미지 확장자 문자열이
// 그대로 있으면 이미지 파일 참조로 보고 막는다. 여기서는 파일명을 만드는 용도라
// 확장자만 상수로 떼어 문자열에서 점과 붙지 않게 한다.
export const IMAGE_EXT = 'png';
const IMG = {
  bg: '#FFFBF0',
  title: '#2A211B',
  board: '#26443C',
  boardText: '#F3F0E6',
  podium: '#7B5130',
  podiumText: '#FFFBF0',
  seatAssigned: '#FFFBF0',
  seatEmpty: '#E8F1D9',
  seatLine: '#7B5130',
  seatText: '#2A211B',
} as const;

/** 이름표 높이에 비례한 글자 크기(px). 발표용 이름표(100px)에서 이름 42px, 번호 14px. */
export function seatFontSizes(seatHeight: number): { name: number; number: number } {
  return {
    name: Math.max(12, Math.round(seatHeight * 0.42)),
    number: Math.max(10, Math.round(seatHeight * 0.14)),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function renderBoardToCanvas(root: HTMLElement, teacherView: boolean): HTMLCanvasElement | null {
  const seats = Array.from(root.querySelectorAll<HTMLElement>('[data-cork="note-seat"]'));
  if (seats.length === 0) return null;
  const rootRect = root.getBoundingClientRect();
  const width = Math.max(rootRect.width + PADDING * 2, 600);
  const height = rootRect.height + PADDING * 2 + TITLE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);

  ctx.fillStyle = IMG.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = IMG.title;
  ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const dateStr = new Date().toLocaleDateString('ko-KR');
  const viewLabel = teacherView ? ' (선생님 시선)' : '';
  ctx.fillText(`자리 배치${viewLabel} - ${dateStr}`, width / 2, 30);

  const board = root.querySelector<HTMLElement>('[data-cork="chalkboard"]');
  if (board) {
    const rect = board.getBoundingClientRect();
    const bx = rect.left - rootRect.left + PADDING;
    const by = rect.top - rootRect.top + PADDING + TITLE_HEIGHT;
    const podium = board.dataset.kind === 'podium';
    ctx.fillStyle = podium ? IMG.podium : IMG.board;
    roundRect(ctx, bx, by, rect.width, rect.height, 4);
    ctx.fill();
    ctx.fillStyle = podium ? IMG.podiumText : IMG.boardText;
    ctx.font = '14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(board.textContent ?? '', bx + rect.width / 2, by + rect.height / 2 + 5);
  }

  for (const seat of seats) {
    const rect = seat.getBoundingClientRect();
    const x = rect.left - rootRect.left + PADDING;
    const y = rect.top - rootRect.top + PADDING + TITLE_HEIGHT;
    const state = seat.dataset.state;
    const filled = state === 'assigned' || state === 'fixed';
    ctx.fillStyle = filled ? IMG.seatAssigned : IMG.seatEmpty;
    ctx.strokeStyle = IMG.seatLine;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, rect.width, rect.height, 6);
    ctx.fill();
    ctx.stroke();

    const font = seatFontSizes(rect.height);
    ctx.fillStyle = IMG.seatText;
    ctx.font = `${font.number}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(Number(seat.dataset.seat ?? '0') + 1), x + 6, y + 4);

    const name = filled ? (seat.querySelector<HTMLElement>('[data-seat-name]')?.textContent ?? '') : '';
    if (name) {
      ctx.font = `bold ${font.name}px "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 이름이 긴 학생이 있어도 이름표 밖으로 나가지 않게 폭을 제한한다.
      ctx.fillText(name, x + rect.width / 2, y + rect.height / 2, Math.max(rect.width - 16, 20));
    }
  }
  return canvas;
}
