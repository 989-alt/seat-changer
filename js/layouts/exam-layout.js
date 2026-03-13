// 시험대형: 개별 책상 그리드
import { manhattanDistance, escapeHTML } from './layout-engine.js';

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

  distance(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render(container, settings, assignment, options = {}) {
    const { columns, rows } = settings;
    const positions = this.getSeatPositions(settings);

    let html = '<div class="blackboard">칠 판</div>';
    html += `<div class="seat-grid" style="grid-template-columns: repeat(${columns}, 1fr);">`;

    for (const pos of positions) {
      const name = assignment ? assignment[pos.index] : null;
      const cls = name ? 'seat assigned' : 'seat empty';
      const extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      const revealCls = options.animate ? ' reveal' : '';
      const delay = options.animate ? `animation-delay: ${pos.index * 60}ms` : '';
      const safeName = escapeHTML(name);
      const label = name ? `${pos.index + 1}번 자리: ${safeName}` : `${pos.index + 1}번 자리 (비어있음)`;

      html += `<div class="${cls}${extraCls}${revealCls}" data-seat="${pos.index}" style="${delay}"
        tabindex="0" role="button" aria-label="${label}">
        <span class="seat-number">${pos.index + 1}</span>
        <span class="seat-name">${safeName}</span>
      </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
  }
};
