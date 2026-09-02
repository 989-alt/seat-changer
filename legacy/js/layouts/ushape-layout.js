// U대형 레이아웃
import { chebyshevDistance, escapeHTML } from './layout-engine.js';

export const ushapeLayout = {
  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions = [];
    let idx = 0;

    // 윗줄 (칠판쪽) - row 0
    // arcPos: U자 경로 위치 — 왼쪽 줄 가장 아래(rows)부터 시작해서 위로 올라가
    // 윗줄 좌→우, 다시 오른쪽 줄 위→아래까지 1차원 좌표.
    for (let c = 0; c < columns; c++) {
      positions.push({ index: idx++, row: 0, col: c, arcPos: rows + c });
    }

    // 왼쪽 줄 - col 0, row 1~rows (위→아래 순으로 idx 증가, arcPos는 아래일수록 작음)
    for (let r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: 0, arcPos: rows - r });
    }

    // 오른쪽 줄 - col columns-1, row 1~rows
    for (let r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: columns - 1, arcPos: rows + columns - 1 + r });
    }

    return positions;
  },

  getSeatCount(settings) {
    const { columns, rows } = settings;
    return columns + rows * 2;
  },

  // U자 경로상의 호 거리. 양쪽 끝 좌석은 호 길이만큼 떨어진 것으로 계산하여
  // 시각적으로 멀리 있는 학생을 가깝다고 오판하지 않음.
  distance(pos1, pos2) {
    if (pos1.arcPos != null && pos2.arcPos != null) {
      return Math.abs(pos1.arcPos - pos2.arcPos);
    }
    return chebyshevDistance(pos1, pos2);
  },

  render(container, settings, assignment, options = {}) {
    const { columns, rows } = settings;
    const positions = this.getSeatPositions(settings);
    const tv = options.teacherView;

    const topSeats = positions.filter(p => p.row === 0);
    const leftSeats = positions.filter(p => p.row > 0 && p.col === 0);
    const rightSeats = positions.filter(p => p.row > 0 && p.col === columns - 1);

    const disabled = new Set(settings.disabledSeats || []);
    let animIdx = 0;
    function renderSeat(pos) {
      if (disabled.has(pos.index)) {
        return `<div class="seat disabled" data-seat="${pos.index}" aria-hidden="true"></div>`;
      }
      const name = assignment ? assignment[pos.index] : null;
      const cls = name ? 'seat assigned' : 'seat empty';
      const extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      const revealCls = options.animate ? ' reveal' : '';
      const delay = options.animate ? `animation-delay: ${animIdx * 60}ms` : '';
      const safeName = escapeHTML(name);
      const label = name ? `${pos.index + 1}번 자리: ${safeName}` : `${pos.index + 1}번 자리 (비어있음)`;
      animIdx++;

      return `<div class="${cls}${extraCls}${revealCls}" data-seat="${pos.index}" style="${delay}"
        tabindex="0" role="button" aria-label="${label}">
        <span class="seat-number">${pos.index + 1}</span>
        <span class="seat-name">${safeName}</span>
      </div>`;
    }

    let html = tv ? '' : '<div class="blackboard">칠  판</div>';
    html += '<div class="ushape-grid">';

    if (tv) {
      // 선생님 시선: 양쪽 먼저(좌우 반전), 아랫줄(역순)이 위로
      html += '<div class="ushape-side-wrapper">';
      html += '<div class="ushape-side">';
      [...rightSeats].reverse().forEach(p => html += renderSeat(p));
      html += '</div>';
      html += '<div class="ushape-side">';
      [...leftSeats].reverse().forEach(p => html += renderSeat(p));
      html += '</div>';
      html += '</div>';

      html += '<div class="ushape-row">';
      [...topSeats].reverse().forEach(p => html += renderSeat(p));
      html += '</div>';
    } else {
      // 학생 시선: 기존
      html += '<div class="ushape-row">';
      topSeats.forEach(p => html += renderSeat(p));
      html += '</div>';

      html += '<div class="ushape-side-wrapper">';
      html += '<div class="ushape-side">';
      leftSeats.forEach(p => html += renderSeat(p));
      html += '</div>';
      html += '<div class="ushape-side">';
      rightSeats.forEach(p => html += renderSeat(p));
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    if (tv) html += '<div class="blackboard podium">교  탁</div>';
    container.innerHTML = html;
  }
};
