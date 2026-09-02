// 모둠대형: N명씩 클러스터 배치 (자동 배치 + 드래그 미세조정)
import { chebyshevDistance, escapeHTML } from './layout-engine.js';

// 분리 규칙 거리 환산용 (좌석 1개 = 64x48 + 4 갭)
const SEAT_PX_W = 68;
const SEAT_PX_H = 52;

function getClusterDims(groupSize) {
  if (groupSize <= 4) return { cols: 2, rows: Math.ceil(groupSize / 2) };
  if (groupSize <= 6) return { cols: 3, rows: Math.ceil(groupSize / 3) };
  return { cols: 4, rows: Math.ceil(groupSize / 4) };
}

// settings.groupSizes (배열)가 있으면 사용, 없으면 groupCount/groupSize에서 만든다.
function getGroupSizes(settings) {
  const fallbackSize = Math.max(2, Math.min(8, settings.groupSize || 4));
  if (Array.isArray(settings.groupSizes) && settings.groupSizes.length > 0) {
    return settings.groupSizes
      .map(n => Math.max(1, Math.min(8, parseInt(n) || fallbackSize)))
      .slice(0, 20);
  }
  // groupCount가 명시되었으면 해당 수만큼 균등
  if (settings.groupCount && settings.groupCount > 0) {
    const c = Math.max(1, Math.min(20, parseInt(settings.groupCount)));
    return Array.from({ length: c }, () => fallbackSize);
  }
  // 마지막 폴백: 기존처럼 cols*rows ÷ groupSize
  const cols = settings.columns || 6;
  const rows = settings.rows || 5;
  const total = cols * rows;
  const count = Math.ceil(total / fallbackSize);
  return Array.from({ length: count }, () => fallbackSize);
}

// 모둠 시작 좌석 인덱스 (가변 크기 모둠 배열 누적합)
function getGroupStartIndex(groupIndex, sizes) {
  let s = 0;
  for (let i = 0; i < groupIndex; i++) s += sizes[i] || 0;
  return s;
}

// 자동 배치 좌표 계산 (가장 큰 모둠 크기 기준 블록 폭/높이로 균일 그리드)
function calcAutoPositions(sizes) {
  const maxSize = sizes.reduce((a, b) => Math.max(a, b), 1);
  const { cols: cCols, rows: cRows } = getClusterDims(maxSize);
  const seatW = 64, seatH = 48, seatGap = 4;
  const blockW = cCols * (seatW + seatGap) + 12;
  const blockH = cRows * (seatH + seatGap) + 24;
  const gap = 24;

  const groupCount = sizes.length;
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
    const sizes = getGroupSizes(settings);
    const totalSeats = sizes.reduce((a, b) => a + b, 0);
    const maxSize = sizes.reduce((a, b) => Math.max(a, b), 1);
    const { cols: cCols, rows: cRows } = getClusterDims(maxSize);

    const saved = settings.groupPositions || [];
    const auto = calcAutoPositions(sizes);
    const positions = [];

    // 모둠 간 충분한 간격을 둔 그리드 좌표 + 실제 픽셀 좌표 보존
    for (let g = 0; g < sizes.length; g++) {
      const gp = saved.find(p => p.groupIndex === g) || auto[g] || { x: 0, y: 0 };
      const seatW = 64, seatH = 48, seatGap = 4;
      const blockW = cCols * (seatW + seatGap) + 36;
      const blockH = cRows * (seatH + seatGap) + 36;
      // 격자 행/열 (성별 알고리즘 등 격자 기반 로직용)
      const baseRow = Math.round(gp.y / blockH) * (cRows + 1);
      const baseCol = Math.round(gp.x / blockW) * (cCols + 1);
      const groupStart = getGroupStartIndex(g, sizes);
      const gSize = sizes[g];
      for (let s = 0; s < gSize; s++) {
        const idx = groupStart + s;
        if (idx >= totalSeats) break;
        const r = Math.floor(s / cCols);
        const c = s % cCols;
        // 픽셀 좌표: 모둠 픽셀 위치 + 클러스터 내부 좌석 오프셋
        const px = gp.x + c * (seatW + seatGap);
        const py = gp.y + r * (seatH + seatGap);
        positions.push({
          index: idx,
          row: baseRow + r,
          col: baseCol + c,
          px,
          py,
          groupIndex: g
        });
      }
    }
    return positions;
  },

  // 좌석의 실제 픽셀 좌표로 chebyshev 거리 계산.
  // 모둠 간 시각적 분리(드래그된 위치)도 정확히 반영.
  distance(pos1, pos2) {
    if (pos1.px != null && pos2.px != null) {
      const dx = Math.abs(pos1.px - pos2.px) / SEAT_PX_W;
      const dy = Math.abs(pos1.py - pos2.py) / SEAT_PX_H;
      return Math.round(Math.max(dx, dy));
    }
    return chebyshevDistance(pos1, pos2);
  },

  getSeatCount(settings) {
    const sizes = getGroupSizes(settings);
    return sizes.reduce((a, b) => a + b, 0);
  },

  getGroupSize(settings) {
    return Math.max(2, Math.min(8, settings.groupSize || 4));
  },

  getGroupSizes(settings) {
    return getGroupSizes(settings);
  },

  getGroupIndex(seatIdx, settings) {
    const sizes = getGroupSizes(settings);
    let acc = 0;
    for (let g = 0; g < sizes.length; g++) {
      acc += sizes[g];
      if (seatIdx < acc) return g;
    }
    return sizes.length - 1;
  },

  getGroupCount(settings) {
    return getGroupSizes(settings).length;
  },

  render(container, settings, assignment, options = {}) {
    const sizes = getGroupSizes(settings);
    const totalSeats = sizes.reduce((a, b) => a + b, 0);
    const maxSize = sizes.reduce((a, b) => Math.max(a, b), 1);
    const tv = options.teacherView;
    const { cols: clusterCols } = getClusterDims(maxSize);

    // 저장된 위치 or 자동 계산
    const saved = settings.groupPositions || [];
    const auto = calcAutoPositions(sizes);

    const positions = [];
    for (let g = 0; g < sizes.length; g++) {
      positions.push(saved.find(p => p.groupIndex === g) || auto[g]);
    }

    // 캔버스 크기 계산
    const baseSeatW = 64, baseSeatH = 48, baseGap = 4, basePad = 12;
    const isStudentView = container.classList.contains('student-grid') || container.closest('.student-grid');
    const scale = isStudentView ? 1.55 : 1;
    const seatW = Math.round(baseSeatW * scale);
    const seatH = Math.round(baseSeatH * scale);
    const seatGap = Math.round(baseGap * scale);
    const pad = Math.round(basePad * scale);

    const blockW = clusterCols * (seatW + seatGap) + pad;
    const blockH = getClusterDims(maxSize).rows * (seatH + seatGap) + Math.round(28 * scale);
    let maxX = Math.round(300 * scale), maxY = Math.round(200 * scale);
    positions.forEach(gp => {
      if (!gp) return;
      maxX = Math.max(maxX, Math.round(gp.x * scale) + blockW + 10);
      maxY = Math.max(maxY, Math.round(gp.y * scale) + blockH + 10);
    });

    const disabled = new Set(settings.disabledSeats || []);
    let html = tv ? '' : '<div class="blackboard">칠  판</div>';
    html += '<div class="group-layout-canvas" style="position:relative; min-height:' + maxY + 'px; width:' + maxX + 'px; margin:0 auto;">';

    let animIdx = 0;
    const order = tv ? [...positions].reverse() : positions;

    for (const gp of order) {
      if (!gp) continue;
      const g = gp.groupIndex;
      const groupStart = getGroupStartIndex(g, sizes);
      const gSize = sizes[g];
      const scaledX = Math.round(gp.x * scale);
      const scaledY = Math.round(gp.y * scale);
      const displayX = tv ? (maxX - scaledX - blockW) : scaledX;
      const displayY = tv ? (maxY - scaledY - blockH) : scaledY;

      html += '<div class="group-cluster" data-group-index="' + g + '" style="position:absolute; left:' + displayX + 'px; top:' + displayY + 'px;">';
      html += '<div class="group-label">' + (g + 1) + '모둠 (' + gSize + '명)</div>';
      html += '<div class="group-cluster-seats" style="display:grid; grid-template-columns:repeat(' + clusterCols + ',' + seatW + 'px); gap:' + seatGap + 'px;">';

      // 선생님 시선: 클러스터 내 좌석을 역순 렌더링
      const seatIndices = [];
      for (let s = 0; s < gSize; s++) seatIndices.push(groupStart + s);
      if (tv) seatIndices.reverse();

      for (const idx of seatIndices) {
        if (idx >= totalSeats) {
          html += '<div class="seat empty" style="visibility:hidden"></div>';
          continue;
        }
        if (disabled.has(idx)) {
          html += '<div class="seat disabled" data-seat="' + idx + '" aria-hidden="true"></div>';
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
  let dragMoved = false;
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
    dragMoved = false;
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

    if (newX !== parseInt(dragging.style.left || 0) || newY !== parseInt(dragging.style.top || 0)) {
      dragMoved = true;
    }
    dragging.style.left = newX + 'px';
    dragging.style.top = newY + 'px';
  };

  const onUp = () => {
    if (!dragging) return;
    dragging.style.cursor = 'grab';
    dragging.style.zIndex = '';
    dragging.style.boxShadow = '';
    dragging.style.opacity = '';

    const wasDragMoved = dragMoved;

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
    // 실제 드래그가 일어났으면 저장. 단순 클릭이면 좌석 클릭(고정 픽업 등)이 정상 동작하도록 무시.
    if (wasDragMoved && onChange) onChange(positions);
    // 드래그 직후 발생할 수 있는 click 이벤트가 좌석 onSeatClick으로 전파되지 않도록 짧은 가드
    if (wasDragMoved) {
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      canvas.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => canvas.removeEventListener('click', swallow, { capture: true }), 50);
    }
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
