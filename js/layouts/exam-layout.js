// 시험대형: 개별 책상 그리드
import { chebyshevDistance, escapeHTML } from './layout-engine.js';

export const examLayout = {
  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        positions.push({ index: r * columns + c, row: r, col: c });
      }
    }
    return positions;
  },

  getSeatCount(settings) {
    return settings.columns * settings.rows;
  },

  // 가로·세로·대각선 모두 동일하게 1칸 (king's move)
  distance(pos1, pos2) {
    return chebyshevDistance(pos1, pos2);
  },

  render(container, settings, assignment, options = {}) {
    const { columns, rows } = settings;
    const positions = this.getSeatPositions(settings);
    const tv = options.teacherView;

    // teacherView: 행 역순, 열 역순 → 교탁에서 바라보는 배치
    const ordered = tv ? [...positions].sort((a, b) => {
      if (a.row !== b.row) return b.row - a.row;
      return b.col - a.col;
    }) : positions;

    let html = tv
      ? ''
      : '<div class="blackboard">칠  판</div>';

    html += `<div class="seat-grid" style="grid-template-columns: repeat(${columns}, auto);">`;

    const disabled = new Set(settings.disabledSeats || []);
    let animIdx = 0;
    for (const pos of ordered) {
      if (disabled.has(pos.index)) {
        html += `<div class="seat disabled" data-seat="${pos.index}" aria-hidden="true"></div>`;
        continue;
      }
      const name = assignment ? assignment[pos.index] : null;
      const cls = name ? 'seat assigned' : 'seat empty';
      const extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      const revealCls = options.animate ? ' reveal' : '';
      const delay = options.animate ? `animation-delay: ${animIdx * 60}ms` : '';
      const safeName = escapeHTML(name);
      const label = name ? `${pos.index + 1}번 자리: ${safeName}` : `${pos.index + 1}번 자리 (비어있음)`;

      html += `<div class="${cls}${extraCls}${revealCls}" data-seat="${pos.index}" style="${delay}"
        tabindex="0" role="button" aria-label="${label}">
        <span class="seat-number">${pos.index + 1}</span>
        <span class="seat-name">${safeName}</span>
      </div>`;
      animIdx++;
    }

    html += '</div>';
    if (tv) html += '<div class="blackboard podium">교  탁</div>';
    container.innerHTML = html;
  }
};
