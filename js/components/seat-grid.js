// 자리 배치도 렌더링 컴포넌트
import { examLayout } from '../layouts/exam-layout.js';
import { pairLayout } from '../layouts/pair-layout.js';
import { ushapeLayout } from '../layouts/ushape-layout.js';
import { customLayout } from '../layouts/custom-layout.js';

const layoutMap = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout
};

export function getLayout(type) {
  return layoutMap[type] || examLayout;
}

/**
 * 배치도 렌더링
 * @param {HTMLElement} container
 * @param {Object} data - store data
 * @param {Object|null} assignment - { seatIndex: studentName }
 * @param {Object} options - { animate, highlightSeat, onSeatClick }
 */
export function renderSeatGrid(container, data, assignment, options = {}) {
  const layout = getLayout(data.layoutType);
  layout.render(container, data.layoutSettings, assignment, {
    fixedSeats: data.fixedSeats,
    animate: options.animate,
    highlightSeat: options.highlightSeat
  });

  // 자리 클릭 이벤트
  if (options.onSeatClick) {
    container.querySelectorAll('[data-seat]').forEach(el => {
      el.addEventListener('click', () => {
        const seatIndex = parseInt(el.dataset.seat);
        options.onSeatClick(seatIndex);
      });
    });
  }
}

/**
 * 총 자리 수
 */
export function getTotalSeatsForLayout(data) {
  const layout = getLayout(data.layoutType);
  return layout.getSeatCount(data.layoutSettings);
}
