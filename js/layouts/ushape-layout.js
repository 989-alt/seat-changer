// U대형 레이아웃
import { manhattanDistance, escapeHTML } from './layout-engine.js';

export const ushapeLayout = {
  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions = [];
    let idx = 0;

    // 윗줄 (칠판쪽) - row 0
    for (let c = 0; c < columns; c++) {
      positions.push({ index: idx++, row: 0, col: c });
    }

    // 왼쪽 줄 - col 0, row 1~rows
    for (let r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: 0 });
    }

    // 오른쪽 줄 - col columns-1, row 1~rows
    for (let r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: columns - 1 });
    }

    return positions;
  },

  getSeatCount(settings) {
    const { columns, rows } = settings;
    return columns + rows * 2;
  },

  distance(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render(container, settings, assignment, options = {}) {
    const { columns, rows } = settings;
    const positions = this.getSeatPositions(settings);

    const topSeats = positions.filter(p => p.row === 0);
    const leftSeats = positions.filter(p => p.row > 0 && p.col === 0);
    const rightSeats = positions.filter(p => p.row > 0 && p.col === columns - 1);

    function renderSeat(pos) {
      const name = assignment ? assignment[pos.index] : null;
      const cls = name ? 'seat assigned' : 'seat empty';
      const extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      const revealCls = options.animate ? ' reveal' : '';
      const delay = options.animate ? `animation-delay: ${pos.index * 60}ms` : '';
      const safeName = escapeHTML(name);
      const label = name ? `${pos.index + 1}번 자리: ${safeName}` : `${pos.index + 1}번 자리 (비어있음)`;

      return `<div class="${cls}${extraCls}${revealCls}" data-seat="${pos.index}" style="${delay}"
        tabindex="0" role="button" aria-label="${label}">
        <span class="seat-number">${pos.index + 1}</span>
        <span class="seat-name">${safeName}</span>
      </div>`;
    }

    let html = '<div class="blackboard">칠 판</div>';
    html += '<div class="ushape-grid">';

    // 윗줄
    html += '<div class="ushape-row">';
    topSeats.forEach(p => html += renderSeat(p));
    html += '</div>';

    // 양쪽
    html += '<div class="ushape-side-wrapper">';
    html += '<div class="ushape-side">';
    leftSeats.forEach(p => html += renderSeat(p));
    html += '</div>';
    html += '<div class="ushape-side">';
    rightSeats.forEach(p => html += renderSeat(p));
    html += '</div>';
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }
};
