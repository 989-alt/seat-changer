// 짝대형: 2인 1조 그리드
import { chebyshevDistance, escapeHTML } from './layout-engine.js';

export const pairLayout = {
  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        // pairCol: 짝꿍 묶음 단위 가로 인덱스 (책상 그룹 시각화 반영)
        positions.push({ index: r * columns + c, row: r, col: c, pairCol: Math.floor(c / 2) });
      }
    }
    return positions;
  },

  getSeatCount(settings) {
    return settings.columns * settings.rows;
  },

  // 짝꿍 두 좌석은 시각적으로 한 책상에 붙어 앉음 → 거리 1.
  // 다른 짝 그룹과는 그룹 단위 chebyshev에 +1 (그룹 사이의 시각적 갭 반영).
  distance(pos1, pos2) {
    const samePair = pos1.row === pos2.row && pos1.pairCol === pos2.pairCol;
    if (samePair) return 1;
    const dr = Math.abs(pos1.row - pos2.row);
    const dpc = Math.abs((pos1.pairCol ?? Math.floor(pos1.col / 2)) - (pos2.pairCol ?? Math.floor(pos2.col / 2)));
    return Math.max(dr, dpc) + 1;
  },

  render(container, settings, assignment, options = {}) {
    const { columns, rows } = settings;
    const pairCols = Math.ceil(columns / 2);
    const tv = options.teacherView;

    let html = tv ? '' : '<div class="blackboard">칠  판</div>';
    html += `<div class="pair-grid" style="grid-template-columns: repeat(${pairCols}, auto);">`;

    // teacherView: 행 역순, 짝 그룹 역순, 짝 내부도 역순
    const rowOrder = tv ? Array.from({length: rows}, (_, i) => rows - 1 - i) : Array.from({length: rows}, (_, i) => i);
    const pcOrder = tv ? Array.from({length: pairCols}, (_, i) => pairCols - 1 - i) : Array.from({length: pairCols}, (_, i) => i);

    const disabled = new Set(settings.disabledSeats || []);
    let animIdx = 0;
    for (const r of rowOrder) {
      for (const pc of pcOrder) {
        html += '<div class="seat-pair-group">';
        const innerOrder = tv ? [1, 0] : [0, 1];
        for (const i of innerOrder) {
          const c = pc * 2 + i;
          if (c >= columns) continue;
          const idx = r * columns + c;
          if (disabled.has(idx)) {
            html += `<div class="seat disabled" data-seat="${idx}" aria-hidden="true"></div>`;
            continue;
          }
          const name = assignment ? assignment[idx] : null;
          const cls = name ? 'seat assigned' : 'seat empty';
          const extraCls = options.highlightSeat === idx ? ' highlight' : '';
          const revealCls = options.animate ? ' reveal' : '';
          const delay = options.animate ? `animation-delay: ${animIdx * 60}ms` : '';
          const safeName = escapeHTML(name);
          const label = name ? `${idx + 1}번 자리: ${safeName}` : `${idx + 1}번 자리 (비어있음)`;

          html += `<div class="${cls}${extraCls}${revealCls}" data-seat="${idx}" style="${delay}"
            tabindex="0" role="button" aria-label="${label}">
            <span class="seat-number">${idx + 1}</span>
            <span class="seat-name">${safeName}</span>
          </div>`;
          animIdx++;
        }
        html += '</div>';
      }
    }

    html += '</div>';
    if (tv) html += '<div class="blackboard podium">교  탁</div>';
    container.innerHTML = html;
  }
};
