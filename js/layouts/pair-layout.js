// 짝대형: 2인 1조 그리드
import { manhattanDistance, escapeHTML } from './layout-engine.js';

export const pairLayout = {
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
    const pairCols = Math.ceil(columns / 2);

    let html = '<div class="blackboard">칠 판</div>';
    html += `<div class="pair-grid" style="grid-template-columns: repeat(${pairCols}, auto);">`;

    for (let r = 0; r < rows; r++) {
      for (let pc = 0; pc < pairCols; pc++) {
        html += '<div class="seat-pair-group">';
        for (let i = 0; i < 2; i++) {
          const c = pc * 2 + i;
          if (c >= columns) break;
          const idx = r * columns + c;
          const name = assignment ? assignment[idx] : null;
          const cls = name ? 'seat assigned' : 'seat empty';
          const extraCls = options.highlightSeat === idx ? ' highlight' : '';
          const revealCls = options.animate ? ' reveal' : '';
          const delay = options.animate ? `animation-delay: ${idx * 60}ms` : '';
          const safeName = escapeHTML(name);
          const label = name ? `${idx + 1}번 자리: ${safeName}` : `${idx + 1}번 자리 (비어있음)`;

          html += `<div class="${cls}${extraCls}${revealCls}" data-seat="${idx}" style="${delay}"
            tabindex="0" role="button" aria-label="${label}">
            <span class="seat-number">${idx + 1}</span>
            <span class="seat-name">${safeName}</span>
          </div>`;
        }
        html += '</div>';
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }
};
