// 모둠대형: N명씩 클러스터 배치 (자동 배치 + 드래그 미세조정)
import { manhattanDistance, escapeHTML } from './layout-engine.js';

function getClusterDims(groupSize) {
  if (groupSize <= 4) return { cols: 2, rows: Math.ceil(groupSize / 2) };
  if (groupSize <= 6) return { cols: 3, rows: Math.ceil(groupSize / 3) };
  return { cols: 4, rows: Math.ceil(groupSize / 4) };
}

// 자동 배치 좌표 계산
function calcAutoPositions(groupCount, groupSize) {
  const { cols: cCols, rows: cRows } = getClusterDims(groupSize);
  const seatW = 64, seatH = 48, seatGap = 4;
  const blockW = cCols * (seatW + seatGap) + 12;
  const blockH = cRows * (seatH + seatGap) + 24;
  const gap = 24;

  const gridCols = Math.ceil(Math.sqrt(groupCount));
  const positions = [];
  for (let g = 0; g < groupCount; g++) {
    positions.push({
      groupIndex: g,
      x: 10 + (g % gridCols) * (blockW + gap),
      y: 10 + Math.floor(g / gridCols) * (blockH + gap)
    });
  }
  return positions;
}

export const groupLayout = {
  getSeatPositions(settings) {
    const groupSize = this.getGroupSize(settings);
    const totalSeats = this.getSeatCount(settings);
    const groupCount = Math.ceil(totalSeats / groupSize);
    const { cols: cCols, rows: cRows } = getClusterDims(groupSize);

    const saved = settings.groupPositions || [];
    const auto = calcAutoPositions(groupCount, groupSize);
    const positions = [];

    // 모둠 간 충분한 간격을 둔 그리드 좌표 생성
    // 각 모둠이 고유한 row/col 영역을 갖도록 모둠 크기 기반으로 오프셋 계산
    for (let g = 0; g < groupCount; g++) {
      const gp = saved.find(p => p.groupIndex === g) || auto[g] || { x: 0, y: 0 };
      // 픽셀 좌표를 블록 단위로 변환 (모둠 간 겹침 방지)
      const seatW = 64, seatH = 48, seatGap = 4;
      const blockW = cCols * (seatW + seatGap) + 36;
      const blockH = cRows * (seatH + seatGap) + 36;
      const baseRow = Math.round(gp.y / blockH) * (cRows + 1);
      const baseCol = Math.round(gp.x / blockW) * (cCols + 1);
      for (let s = 0; s < groupSize; s++) {
        const idx = g * groupSize + s;
        if (idx >= totalSeats) break;
        const r = Math.floor(s / cCols);
        const c = s % cCols;
        positions.push({ index: idx, row: baseRow + r, col: baseCol + c });
      }
    }
    return positions;
  },

  getSeatCount(settings) {
    const groupSize = this.getGroupSize(settings);
    const saved = settings.groupPositions;
    if (saved && saved.length > 0) {
      return saved.length * groupSize;
    }
    return (settings.columns || 6) * (settings.rows || 5);
  },

  getGroupSize(settings) {
    return Math.max(3, Math.min(8, settings.groupSize || 4));
  },

  getGroupIndex(seatIdx, settings) {
    return Math.floor(seatIdx / this.getGroupSize(settings));
  },

  getGroupCount(settings) {
    return Math.ceil(this.getSeatCount(settings) / this.getGroupSize(settings));
  },

  distance(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render(container, settings, assignment, options = {}) {
    const groupSize = this.getGroupSize(settings);
    const totalSeats = this.getSeatCount(settings);
    const groupCount = Math.ceil(totalSeats / groupSize);
    const tv = options.teacherView;
    const { cols: clusterCols } = getClusterDims(groupSize);

    // 저장된 위치 or 자동 계산
    const saved = settings.groupPositions || [];
    const auto = calcAutoPositions(groupCount, groupSize);

    const positions = [];
    for (let g = 0; g < groupCount; g++) {
      positions.push(saved.find(p => p.groupIndex === g) || auto[g]);
    }

    // 캔버스 크기 계산
    const seatW = 64, seatH = 48, seatGap = 4, pad = 12;
    const blockW = clusterCols * (seatW + seatGap) + pad;
    const blockH = getClusterDims(groupSize).rows * (seatH + seatGap) + 28;
    let maxX = 300, maxY = 200;
    positions.forEach(gp => {
      if (!gp) return;
      maxX = Math.max(maxX, gp.x + blockW + 10);
      maxY = Math.max(maxY, gp.y + blockH + 10);
    });

    let html = tv ? '' : '<div class="blackboard">칠  판</div>';
    html += '<div class="group-layout-canvas" style="position:relative; min-height:' + maxY + 'px; width:100%;">';

    let animIdx = 0;
    const order = tv ? [...positions].reverse() : positions;

    for (const gp of order) {
      if (!gp) continue;
      const g = gp.groupIndex;
      const groupStart = g * groupSize;
      const displayX = tv ? (maxX - gp.x - blockW) : gp.x;
      const displayY = tv ? (maxY - gp.y - blockH) : gp.y;

      html += '<div class="group-cluster" data-group-index="' + g + '" style="position:absolute; left:' + displayX + 'px; top:' + displayY + 'px;">';
      html += '<div class="group-label">' + (g + 1) + '모둠</div>';
      html += '<div class="group-cluster-seats" style="display:grid; grid-template-columns:repeat(' + clusterCols + ',1fr); gap:' + seatGap + 'px;">';

      for (let s = 0; s < groupSize; s++) {
        const idx = groupStart + s;
        if (idx >= totalSeats) {
          html += '<div class="seat empty" style="visibility:hidden"></div>';
          continue;
        }
        const name = assignment ? assignment[idx] : null;
        const cls = name ? 'seat assigned' : 'seat empty';
        const fixedCls = (options.fixedSeats || []).some(f => f.seatIndex === idx) ? ' fixed' : '';
        const revealCls = options.animate ? ' reveal' : '';
        const delay = options.animate ? 'animation-delay:' + (animIdx * 60) + 'ms' : '';
        const safeName = escapeHTML(name);

        html += '<div class="' + cls + fixedCls + revealCls + '" data-seat="' + idx + '" style="' + delay + '" tabindex="0" role="button">';
        html += '<span class="seat-number">' + (idx + 1) + '</span>';
        html += '<span class="seat-name">' + safeName + '</span>';
        html += '</div>';
        animIdx++;
      }
      html += '</div></div>';
    }

    html += '</div>';
    if (tv) html += '<div class="blackboard podium">교  탁</div>';
    container.innerHTML = html;
  }
};

// === 미리보기 패널에서 모둠 드래그 활성화 ===
let _groupDragCleanup = null;
export function enableGroupDrag(container, settings, onChange) {
  // 이전 리스너 정리
  if (_groupDragCleanup) {
    _groupDragCleanup();
    _groupDragCleanup = null;
  }
  const clusters = container.querySelectorAll('.group-cluster[data-group-index]');
  if (clusters.length === 0) return;

  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  const canvas = container.querySelector('.group-layout-canvas');
  if (!canvas) return;

  clusters.forEach(block => {
    block.style.cursor = 'grab';
  });

  const onDown = (e) => {
    const block = e.target.closest('.group-cluster[data-group-index]');
    if (!block) return;
    e.preventDefault();
    dragging = block;
    block.style.cursor = 'grabbing';
    block.style.zIndex = '10';
    block.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
    block.style.opacity = '0.92';

    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragOffset.x = cx - rect.left - parseInt(block.style.left || 0);
    dragOffset.y = cy - rect.top - parseInt(block.style.top || 0);
  };

  const onMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;

    let newX = Math.round((cx - rect.left - dragOffset.x) / 10) * 10;
    let newY = Math.round((cy - rect.top - dragOffset.y) / 10) * 10;
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    dragging.style.left = newX + 'px';
    dragging.style.top = newY + 'px';
  };

  const onUp = () => {
    if (!dragging) return;
    dragging.style.cursor = 'grab';
    dragging.style.zIndex = '';
    dragging.style.boxShadow = '';
    dragging.style.opacity = '';

    // 현재 위치를 수집하여 저장
    const allClusters = canvas.querySelectorAll('.group-cluster[data-group-index]');
    const positions = [];
    allClusters.forEach(cl => {
      positions.push({
        groupIndex: parseInt(cl.getAttribute('data-group-index')),
        x: parseInt(cl.style.left) || 0,
        y: parseInt(cl.style.top) || 0
      });
    });
    positions.sort((a, b) => a.groupIndex - b.groupIndex);

    dragging = null;
    if (onChange) onChange(positions);
  };

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);

  // 정리 함수 저장
  _groupDragCleanup = () => {
    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('touchstart', onDown);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchend', onUp);
  };
}
