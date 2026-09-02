// 자유배치: DOM 기반 드래그앤드롭 + 스냅/선택/Undo
import { escapeHTML } from './layout-engine.js';

const DESK_W = 60;
const DESK_H = 40;
const GRID_SIZE = 20;
const MAX_HISTORY = 50;
// 분리 규칙 거리 환산: 책상 폭 + 그리드 = 책상 1개 간격(픽셀)을 "1칸"으로 계산
const CELL_PX_W = DESK_W + GRID_SIZE; // 80
const CELL_PX_H = DESK_H + GRID_SIZE; // 60

export const customLayout = {
  _canvas: null,
  _ctx: null,
  _desks: [],
  _selected: null,
  _dragging: null,
  _dragOffset: { x: 0, y: 0 },
  _dragMoved: false,
  _onUpdate: null,
  _history: [],
  _redoStack: [],
  _canvasW: 600,
  _canvasH: 400,
  _resizeBound: null,

  init(canvas, desks, onUpdate, onSeatPick) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._desks = desks.map((d, i) => ({ ...d, id: d.id ?? i }));
    this._onUpdate = onUpdate;
    this._onSeatPick = onSeatPick || null;
    this._selected = null;
    this._history = [];
    this._redoStack = [];
    this._bindEvents();
    this._fitCanvas();
    this._pushHistory();
    this._draw();

    // 패널 layout이 안정화된 다음 프레임에 재측정 (init 시점에 wrap 폭이 0/작은 경우 보정)
    requestAnimationFrame(() => {
      if (this._canvas.clientWidth && this._canvas.clientWidth !== this._canvasW) {
        this._fitCanvas();
        this._draw();
      }
    });

    // 패널 리사이즈/탭 전환 시 캔버스 폭 동기화 (영구 보정)
    if (this._wrapResizeObserver) this._wrapResizeObserver.disconnect();
    if (typeof ResizeObserver !== 'undefined' && this._canvas.parentNode) {
      this._wrapResizeObserver = new ResizeObserver(() => {
        if (this._canvas.clientWidth && this._canvas.clientWidth !== this._canvasW) {
          this._fitCanvas();
          this._draw();
        }
      });
      this._wrapResizeObserver.observe(this._canvas.parentNode);
    }
  },

  // --- Snap to grid ---
  _snap(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  },

  // --- Fit canvas to container (no ResizeObserver) ---
  // 캔버스를 충분히 크게 만들어 책상을 자유롭게 배치 가능.
  // 부모(#custom-editor)가 overflow:auto이므로 캔버스가 패널보다 크면 자동 스크롤.
  _fitCanvas() {
    const canvas = this._canvas;
    const w = canvas.clientWidth || 560;
    const dpr = window.devicePixelRatio || 1;
    // 너비의 1.1배 또는 최소 760px — 책상 6~8행 충분히 들어가는 크기
    const h = Math.max(760, Math.floor(w * 1.1));

    this._canvasW = w;
    this._canvasH = h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  // --- History (Undo/Redo) ---
  _pushHistory() {
    this._history.push(JSON.stringify(this._desks));
    if (this._history.length > MAX_HISTORY) this._history.shift();
    this._redoStack = [];
    this._updateToolbarState();
  },

  undo() {
    if (this._history.length <= 1) return;
    this._redoStack.push(this._history.pop());
    this._desks = JSON.parse(this._history[this._history.length - 1]);
    this._selected = null;
    this._draw();
    this._notify();
    this._updateToolbarState();
  },

  redo() {
    if (this._redoStack.length === 0) return;
    const state = this._redoStack.pop();
    this._history.push(state);
    this._desks = JSON.parse(state);
    this._selected = null;
    this._draw();
    this._notify();
    this._updateToolbarState();
  },

  _updateToolbarState() {
    const undoBtn = document.getElementById('btn-undo-desk');
    const redoBtn = document.getElementById('btn-redo-desk');
    if (undoBtn) undoBtn.disabled = this._history.length <= 1;
    if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;

    const delBtn = document.getElementById('btn-delete-desk');
    if (delBtn) delBtn.disabled = this._selected === null;

    const countEl = document.getElementById('desk-count');
    if (countEl) countEl.textContent = `${this._desks.length}개`;
  },

  // --- Add desks ---
  addDesk() {
    const id = this._desks.length;
    const x = this._snap(50 + (id % 8) * 70);
    const y = this._snap(50 + Math.floor(id / 8) * 55);
    this._desks.push({
      id,
      x: Math.min(x, this._canvasW - DESK_W),
      y: Math.min(y, this._canvasH - DESK_H),
      seatIndex: id
    });
    this._pushHistory();
    this._draw();
    this._notify();
  },

  addDesks(count) {
    if (count <= 0) return;
    // Clear existing and create grid
    this._desks = [];
    const cols = Math.ceil(Math.sqrt(count * (this._canvasW / this._canvasH)));
    const gapX = Math.max(DESK_W + 10, Math.floor((this._canvasW - 40) / cols));
    const gapY = DESK_H + 15;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this._desks.push({
        id: i,
        x: this._snap(20 + col * gapX),
        y: this._snap(20 + row * gapY),
        seatIndex: i
      });
    }
    this._selected = null;
    this._pushHistory();
    this._draw();
    this._notify();
  },

  // --- Delete desk ---
  deleteDesk(index) {
    if (index < 0 || index >= this._desks.length) return;
    this._desks.splice(index, 1);
    this._desks.forEach((d, i) => { d.id = i; d.seatIndex = i; });
    if (this._selected === index) this._selected = null;
    else if (this._selected !== null && this._selected > index) this._selected--;
    this._pushHistory();
    this._draw();
    this._notify();
  },

  deleteSelected() {
    if (this._selected !== null) {
      this.deleteDesk(this._selected);
    }
  },

  clearDesks() {
    this._desks = [];
    this._selected = null;
    this._pushHistory();
    this._draw();
    this._notify();
  },

  getDesks() {
    return this._desks.map((d, i) => ({ ...d, seatIndex: i }));
  },

  getSelected() {
    return this._selected;
  },

  getSeatPositions(settings) {
    const desks = settings.customDesks || [];
    // 픽셀 좌표를 그대로 보존하면서, 격자가 필요한 알고리즘(성별 체커보드 등)을 위해
    // 양자화된 row/col도 함께 제공
    return desks.map((d, i) => ({
      index: i,
      row: Math.round(d.y / CELL_PX_H),
      col: Math.round(d.x / CELL_PX_W),
      px: d.x,
      py: d.y
    }));
  },

  getSeatCount(settings) {
    return (settings.customDesks || []).length;
  },

  // 책상의 실제 픽셀 좌표로 chebyshev 거리 계산.
  // 1칸 = "책상 한 개 + 그리드 갭" 만큼 떨어진 거리.
  // 사선·자유 배치에서도 시각적 거리에 정확히 비례.
  distance(pos1, pos2) {
    if (pos1.px != null && pos2.px != null) {
      const dx = Math.abs(pos1.px - pos2.px) / CELL_PX_W;
      const dy = Math.abs(pos1.py - pos2.py) / CELL_PX_H;
      return Math.round(Math.max(dx, dy));
    }
    return Math.max(Math.abs(pos1.row - pos2.row), Math.abs(pos1.col - pos2.col));
  },

  // --- Render for preview/student (normalized coordinates) ---
  render(container, settings, assignment, options = {}) {
    const desks = settings.customDesks || [];
    if (desks.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:2rem">
        <svg class="empty-icon-svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 14h20"/><path d="M6 18v2M18 18v2"/></svg>
        <p class="empty-text">자유배치 책상이 없습니다</p>
        <p class="hint">교사 설정에서 책상을 추가하세요</p>
      </div>`;
      return;
    }

    // Normalize: find bounding box and scale to fit container
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    desks.forEach(d => {
      minX = Math.min(minX, d.x);
      minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + DESK_W);
      maxY = Math.max(maxY, d.y + DESK_H);
    });

    const srcW = maxX - minX || 1;
    const srcH = maxY - minY || 1;

    // Target container dimensions
    const isStudentView = container.classList.contains('student-grid');
    const targetW = isStudentView ? Math.min(container.clientWidth || 700, 900) : Math.min(container.clientWidth || 500, 600);
    const seatW = isStudentView ? 80 : 64;
    const seatH = isStudentView ? 56 : 48;
    const scale = Math.min(
      (targetW - 40) / srcW,
      400 / srcH,
      seatW / DESK_W
    );

    const scaledW = srcW * scale + 40;
    const scaledH = srcH * scale + 40;

    const tv = options.teacherView;

    let html = tv ? '' : '<div class="blackboard">칠  판</div>';
    html += `<div class="custom-preview" style="position:relative;width:${scaledW}px;height:${scaledH}px;margin:0 auto;">`;

    desks.forEach((d, i) => {
      const name = assignment ? assignment[i] : null;
      const cls = name ? 'seat assigned' : 'seat empty';
      const extraCls = options.highlightSeat === i ? ' highlight' : '';
      const revealCls = options.animate ? ' reveal' : '';
      const delay = options.animate ? `animation-delay: ${i * 60}ms` : '';
      const safeName = escapeHTML(name);
      const label = name ? `${i + 1}번 자리: ${safeName}` : `${i + 1}번 자리 (비어있음)`;

      let sx = (d.x - minX) * scale + 20;
      let sy = (d.y - minY) * scale + 20;
      const sw = DESK_W * scale;
      const sh = DESK_H * scale;

      // teacherView: 좌표 180도 반전
      if (tv) {
        sx = scaledW - sx - sw;
        sy = scaledH - sy - sh;
      }

      html += `<div class="${cls}${extraCls}${revealCls}" data-seat="${i}"
        style="position:absolute;left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;${delay}"
        tabindex="0" role="button" aria-label="${label}">
        <span class="seat-number">${i + 1}</span>
        <span class="seat-name">${safeName}</span>
      </div>`;
    });

    html += '</div>';
    if (tv) html += '<div class="blackboard podium">교  탁</div>';
    container.innerHTML = html;
  },

  // --- Events ---
  _bindEvents() {
    const c = this._canvas;
    const newCanvas = c.cloneNode(true);
    c.parentNode.replaceChild(newCanvas, c);
    this._canvas = newCanvas;
    this._ctx = newCanvas.getContext('2d');

    // Re-apply DPR transform
    const dpr = window.devicePixelRatio || 1;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    newCanvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
    newCanvas.addEventListener('mousemove', (e) => this._onPointerMove(e));
    newCanvas.addEventListener('mouseup', (e) => this._onPointerUp(e));

    // Right-click to delete
    newCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pos = this._getPos(e);
      const idx = this._hitTest(pos);
      if (idx !== -1) {
        this.deleteDesk(idx);
      }
    });

    // Double-click to delete
    newCanvas.addEventListener('dblclick', (e) => {
      const pos = this._getPos(e);
      const idx = this._hitTest(pos);
      if (idx !== -1) {
        this.deleteDesk(idx);
      }
    });

    // Touch support
    newCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onPointerDown(e.touches[0]);
    }, { passive: false });
    newCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._onPointerMove(e.touches[0]);
    }, { passive: false });
    newCanvas.addEventListener('touchend', (e) => {
      this._onPointerUp(e);
    });

    // Keyboard: Delete selected, Undo/Redo
    newCanvas.setAttribute('tabindex', '0');
    newCanvas.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this._selected !== null) {
          e.preventDefault();
          this.deleteSelected();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        this.redo();
      }
    });

    // Window resize handler (no ResizeObserver to avoid feedback loop)
    if (this._resizeBound) {
      window.removeEventListener('resize', this._resizeBound);
    }
    this._resizeBound = () => {
      this._fitCanvas();
      this._draw();
    };
    window.addEventListener('resize', this._resizeBound);
  },

  _getPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: rect.width ? (e.clientX - rect.left) * (this._canvasW / rect.width) : 0,
      y: rect.height ? (e.clientY - rect.top) * (this._canvasH / rect.height) : 0
    };
  },

  _hitTest(pos) {
    for (let i = this._desks.length - 1; i >= 0; i--) {
      const d = this._desks[i];
      if (pos.x >= d.x && pos.x <= d.x + DESK_W && pos.y >= d.y && pos.y <= d.y + DESK_H) {
        return i;
      }
    }
    return -1;
  },

  _onPointerDown(e) {
    const pos = this._getPos(e);
    const idx = this._hitTest(pos);

    if (idx !== -1) {
      this._dragging = idx;
      this._dragMoved = false;
      this._dragOffset = { x: pos.x - this._desks[idx].x, y: pos.y - this._desks[idx].y };
      this._canvas.style.cursor = 'grabbing';
    } else {
      // Click on empty area: deselect
      this._selected = null;
      this._draw();
      this._updateToolbarState();
    }
  },

  _onPointerMove(e) {
    if (this._dragging === null) {
      // Hover cursor
      const pos = this._getPos(e);
      const idx = this._hitTest(pos);
      this._canvas.style.cursor = idx !== -1 ? 'grab' : 'crosshair';
      return;
    }

    this._dragMoved = true;
    const pos = this._getPos(e);
    const d = this._desks[this._dragging];
    d.x = Math.max(0, Math.min(this._canvasW - DESK_W, pos.x - this._dragOffset.x));
    d.y = Math.max(0, Math.min(this._canvasH - DESK_H, pos.y - this._dragOffset.y));
    this._draw();
  },

  _onPointerUp(e) {
    if (this._dragging !== null) {
      const idx = this._dragging;
      this._dragging = null;
      this._canvas.style.cursor = 'crosshair';

      if (this._dragMoved) {
        // Snap to grid on drop
        const d = this._desks[idx];
        d.x = this._snap(d.x);
        d.y = this._snap(d.y);
        this._selected = idx;
        this._pushHistory();
        this._draw();
        this._notify();
      } else {
        // Click without drag — 고정자리 모드면 픽업, 아니면 선택 토글
        let handledByPick = false;
        if (typeof this._onSeatPick === 'function') {
          // seatIndex는 desks 배열의 인덱스
          handledByPick = this._onSeatPick(idx) === true;
        }
        if (!handledByPick) {
          this._selected = this._selected === idx ? null : idx;
          this._draw();
          this._updateToolbarState();
        }
      }
    }
  },

  _notify() {
    if (this._onUpdate) this._onUpdate(this.getDesks());
  },

  _draw() {
    const ctx = this._ctx;
    const w = this._canvasW;
    const h = this._canvasH;
    ctx.clearRect(0, 0, w, h);

    // Grid dots (더 진하게)
    for (let x = 0; x < w; x += GRID_SIZE) {
      for (let y = 0; y < h; y += GRID_SIZE) {
        const isMajor = x % (GRID_SIZE * 5) === 0 && y % (GRID_SIZE * 5) === 0;
        ctx.fillStyle = isMajor ? '#CBD5E1' : '#E2E8F0';
        ctx.beginPath();
        ctx.arc(x, y, isMajor ? 1.5 : 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 빈 상태 온보딩
    if (this._desks.length === 0) {
      ctx.save();
      ctx.fillStyle = '#94A3B8';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('왼쪽 패널에서 책상을 추가하거나', w / 2, h / 2 - 16);
      ctx.fillText('"학생 수만큼 자동 배치"를 눌러 시작하세요', w / 2, h / 2 + 16);
      ctx.restore();
      this._updateToolbarState();
      return;
    }

    // Snap guides for selected desk
    if (this._selected !== null && this._dragging === null) {
      const sel = this._desks[this._selected];
      if (sel) {
        ctx.save();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, sel.y + DESK_H / 2);
        ctx.lineTo(w, sel.y + DESK_H / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sel.x + DESK_W / 2, 0);
        ctx.lineTo(sel.x + DESK_W / 2, h);
        ctx.stroke();
        ctx.restore();

        // Alignment guides to nearby desks
        this._desks.forEach((other, oi) => {
          if (oi === this._selected) return;
          if (Math.abs(other.y - sel.y) < 2) {
            ctx.save();
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(Math.min(sel.x, other.x), sel.y + DESK_H / 2);
            ctx.lineTo(Math.max(sel.x + DESK_W, other.x + DESK_W), sel.y + DESK_H / 2);
            ctx.stroke();
            ctx.restore();
          }
        });
      }
    }

    // Desks
    this._desks.forEach((d, i) => {
      const isDragging = this._dragging === i;
      const isSelected = this._selected === i;

      ctx.save();

      // Shadow
      if (isDragging) {
        ctx.shadowColor = 'rgba(99, 102, 241, 0.3)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
      } else if (isSelected) {
        ctx.shadowColor = 'rgba(99, 102, 241, 0.2)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
      }

      // Fill
      if (isDragging) {
        ctx.fillStyle = '#DBEAFE';
      } else if (isSelected) {
        ctx.fillStyle = '#EEF2FF';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }

      ctx.beginPath();
      ctx.roundRect(d.x, d.y, DESK_W, DESK_H, 6);
      ctx.fill();

      // Reset shadow for border
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Border
      if (isSelected) {
        ctx.strokeStyle = '#6366F1';
        ctx.lineWidth = 2.5;
      } else if (isDragging) {
        ctx.strokeStyle = '#818CF8';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
      }
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(d.x, d.y, DESK_W, DESK_H, 6);
      ctx.stroke();

      // Label
      ctx.fillStyle = isSelected ? '#6366F1' : '#475569';
      ctx.font = `${isSelected ? 'bold ' : ''}11px "Noto Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, d.x + DESK_W / 2, d.y + DESK_H / 2);

      ctx.restore();
    });

    this._updateToolbarState();
  }
};
