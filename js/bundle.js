// ============================================================
// 자리바꾸기 - 번들 (file:// 호환)
// ============================================================
(function() {
'use strict';

// === data/models.js ===
function createDefaultData() {
  return {
    students: [],
    classSize: 0,
    layoutType: 'exam',
    layoutSettings: {
      columns: 6,
      rows: 5,
      customDesks: []
    },
    fixedSeats: [],
    separationRules: [],
    lastAssignment: null,
    studentGenders: {},
    genderRule: 'none',
    assignmentHistory: [],
    historyExcludeCount: 1,
    useHistoryExclusion: true
  };
}

function validateStudents(students) {
  if (!Array.isArray(students)) return [];
  return students
    .filter(function(s) { return typeof s === 'string'; })
    .map(function(s) { return s.trim().slice(0, 50); })
    .filter(function(s) { return s.length > 0; })
    .slice(0, 100);
}

function validateFixedSeat(fixedSeat, students, totalSeats) {
  if (!fixedSeat.studentName || fixedSeat.seatIndex === undefined) return false;
  if (!students.includes(fixedSeat.studentName)) return false;
  if (fixedSeat.seatIndex < 0 || fixedSeat.seatIndex >= totalSeats) return false;
  return true;
}

function validateSeparationRule(rule, students) {
  if (!rule.studentA || !rule.studentB) return false;
  if (rule.studentA === rule.studentB) return false;
  if (!students.includes(rule.studentA) || !students.includes(rule.studentB)) return false;
  if (rule.minDistance < 1 || rule.minDistance > 5) return false;
  return true;
}

function getTotalSeats(data) {
  if (data.layoutType === 'custom') {
    return data.layoutSettings.customDesks.length;
  }
  return data.layoutSettings.columns * data.layoutSettings.rows;
}

// === data/store.js ===
var STORAGE_KEY = 'seat-changer-data';
var _cache = null;
var _listeners = [];

var store = {
  load: function() {
    if (_cache) return _cache;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      _cache = raw ? Object.assign({}, createDefaultData(), JSON.parse(raw)) : createDefaultData();
    } catch(e) {
      _cache = createDefaultData();
    }
    return _cache;
  },

  save: function(data) {
    _cache = Object.assign({}, data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
    _listeners.forEach(function(fn) { fn(_cache); });
  },

  update: function(partial) {
    var current = this.load();
    this.save(Object.assign({}, current, partial));
  },

  onChange: function(fn) {
    _listeners.push(fn);
  },

  exportJSON: function() {
    return JSON.stringify(this.load(), null, 2);
  },

  importJSON: function(json) {
    try {
      var parsed = JSON.parse(json);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
      var defaults = createDefaultData();
      var data = {
        students: validateStudents(parsed.students || []),
        classSize: defaults.classSize,
        layoutType: ['exam','pair','ushape','custom'].indexOf(parsed.layoutType) !== -1 ? parsed.layoutType : defaults.layoutType,
        layoutSettings: Object.assign({}, defaults.layoutSettings, parsed.layoutSettings || {}),
        fixedSeats: Array.isArray(parsed.fixedSeats) ? parsed.fixedSeats : [],
        separationRules: Array.isArray(parsed.separationRules) ? parsed.separationRules : [],
        lastAssignment: null,
        studentGenders: (typeof parsed.studentGenders === 'object' && parsed.studentGenders) ? parsed.studentGenders : {},
        genderRule: ['none','same','mixed'].indexOf(parsed.genderRule) !== -1 ? parsed.genderRule : 'none',
        assignmentHistory: Array.isArray(parsed.assignmentHistory) ? parsed.assignmentHistory : [],
        historyExcludeCount: [1,2,3].indexOf(parsed.historyExcludeCount) !== -1 ? parsed.historyExcludeCount : 1,
        useHistoryExclusion: parsed.useHistoryExclusion !== false
      };
      data.classSize = data.students.length;
      this.save(data);
      return true;
    } catch(e) {
      return false;
    }
  },

  initSync: function(callback) {
    var self = this;
    window.addEventListener('storage', function(e) {
      if (e.key === STORAGE_KEY) {
        _cache = null;
        var data = self.load();
        callback(data);
      }
    });
  }
};

// === utils/toast.js ===
function showToast(message, type, duration) {
  if (!type) type = 'success';
  if (!duration) duration = 2500;
  var container = document.getElementById('toast-container');
  if (!container) return;

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  var icons = { success: '\u2713', error: '\u2715', warning: '\u26A0', info: '\u2139' };
  var iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icons[type] || '';
  var msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);

  container.appendChild(toast);
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { toast.classList.add('show'); });
  });

  setTimeout(function() {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', function() { toast.remove(); });
  }, duration);
}

function showConfirm(message) {
  return new Promise(function(resolve) {
    var overlay = document.getElementById('confirm-modal');
    var msgEl = overlay.querySelector('.confirm-message');
    var yesBtn = overlay.querySelector('.confirm-yes');
    var noBtn = overlay.querySelector('.confirm-no');

    msgEl.textContent = message;
    overlay.classList.add('active');

    function cleanup(result) {
      overlay.classList.remove('active');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      overlay.removeEventListener('click', onOverlay);
      resolve(result);
    }

    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onOverlay(e) {
      if (e.target === overlay) cleanup(false);
    }

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    overlay.addEventListener('click', onOverlay);
  });
}

// === layouts/layout-engine.js ===
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function manhattanDistance(pos1, pos2) {
  return Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
}

// === layouts/exam-layout.js ===
var examLayout = {
  getSeatPositions: function(settings) {
    var columns = settings.columns;
    var rows = settings.rows;
    var positions = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < columns; c++) {
        positions.push({ index: r * columns + c, row: r, col: c });
      }
    }
    return positions;
  },

  getSeatCount: function(settings) {
    return settings.columns * settings.rows;
  },

  distance: function(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render: function(container, settings, assignment, options) {
    if (!options) options = {};
    var columns = settings.columns;
    var rows = settings.rows;
    var positions = this.getSeatPositions(settings);

    var html = '<div class="blackboard">\uCE60 \uD310</div>';
    html += '<div class="seat-grid" style="grid-template-columns: repeat(' + columns + ', 1fr);">';

    for (var p = 0; p < positions.length; p++) {
      var pos = positions[p];
      var name = assignment ? assignment[pos.index] : null;
      var safeName = escapeHTML(name);
      var cls = name ? 'seat assigned' : 'seat empty';
      var extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      var revealCls = options.animate ? ' reveal' : '';
      var delay = options.animate ? 'animation-delay: ' + (pos.index * 60) + 'ms' : '';
      var label = name ? (pos.index + 1) + '\uBC88 \uC790\uB9AC: ' + safeName : (pos.index + 1) + '\uBC88 \uC790\uB9AC (\uBE44\uC5B4\uC788\uC74C)';

      html += '<div class="' + cls + extraCls + revealCls + '" data-seat="' + pos.index + '" style="' + delay + '"'
        + ' tabindex="0" role="button" aria-label="' + label + '">'
        + '<span class="seat-number">' + (pos.index + 1) + '</span>'
        + '<span class="seat-name">' + safeName + '</span>'
        + '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }
};

// === layouts/pair-layout.js ===
var pairLayout = {
  getSeatPositions: function(settings) {
    var columns = settings.columns;
    var rows = settings.rows;
    var positions = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < columns; c++) {
        positions.push({ index: r * columns + c, row: r, col: c });
      }
    }
    return positions;
  },

  getSeatCount: function(settings) {
    return settings.columns * settings.rows;
  },

  distance: function(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render: function(container, settings, assignment, options) {
    if (!options) options = {};
    var columns = settings.columns;
    var rows = settings.rows;
    var pairCols = Math.ceil(columns / 2);

    var html = '<div class="blackboard">\uCE60 \uD310</div>';
    html += '<div class="pair-grid" style="grid-template-columns: repeat(' + pairCols + ', auto);">';

    for (var r = 0; r < rows; r++) {
      for (var pc = 0; pc < pairCols; pc++) {
        html += '<div class="seat-pair-group">';
        for (var i = 0; i < 2; i++) {
          var c = pc * 2 + i;
          if (c >= columns) break;
          var idx = r * columns + c;
          var name = assignment ? assignment[idx] : null;
          var safeName = escapeHTML(name);
          var cls = name ? 'seat assigned' : 'seat empty';
          var extraCls = options.highlightSeat === idx ? ' highlight' : '';
          var revealCls = options.animate ? ' reveal' : '';
          var delay = options.animate ? 'animation-delay: ' + (idx * 60) + 'ms' : '';
          var label = name ? (idx + 1) + '\uBC88 \uC790\uB9AC: ' + safeName : (idx + 1) + '\uBC88 \uC790\uB9AC (\uBE44\uC5B4\uC788\uC74C)';

          html += '<div class="' + cls + extraCls + revealCls + '" data-seat="' + idx + '" style="' + delay + '"'
            + ' tabindex="0" role="button" aria-label="' + label + '">'
            + '<span class="seat-number">' + (idx + 1) + '</span>'
            + '<span class="seat-name">' + safeName + '</span>'
            + '</div>';
        }
        html += '</div>';
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }
};

// === layouts/ushape-layout.js ===
var ushapeLayout = {
  getSeatPositions: function(settings) {
    var columns = settings.columns;
    var rows = settings.rows;
    var positions = [];
    var idx = 0;

    for (var c = 0; c < columns; c++) {
      positions.push({ index: idx++, row: 0, col: c });
    }

    for (var r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: 0 });
    }

    for (var r2 = 1; r2 <= rows; r2++) {
      positions.push({ index: idx++, row: r2, col: columns - 1 });
    }

    return positions;
  },

  getSeatCount: function(settings) {
    var columns = settings.columns;
    var rows = settings.rows;
    return columns + rows * 2;
  },

  distance: function(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render: function(container, settings, assignment, options) {
    if (!options) options = {};
    var columns = settings.columns;
    var rows = settings.rows;
    var positions = this.getSeatPositions(settings);

    var topSeats = positions.filter(function(p) { return p.row === 0; });
    var leftSeats = positions.filter(function(p) { return p.row > 0 && p.col === 0; });
    var rightSeats = positions.filter(function(p) { return p.row > 0 && p.col === columns - 1; });

    function renderSeat(pos) {
      var name = assignment ? assignment[pos.index] : null;
      var safeName = escapeHTML(name);
      var cls = name ? 'seat assigned' : 'seat empty';
      var extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      var revealCls = options.animate ? ' reveal' : '';
      var delay = options.animate ? 'animation-delay: ' + (pos.index * 60) + 'ms' : '';
      var label = name ? (pos.index + 1) + '\uBC88 \uC790\uB9AC: ' + safeName : (pos.index + 1) + '\uBC88 \uC790\uB9AC (\uBE44\uC5B4\uC788\uC74C)';

      return '<div class="' + cls + extraCls + revealCls + '" data-seat="' + pos.index + '" style="' + delay + '"'
        + ' tabindex="0" role="button" aria-label="' + label + '">'
        + '<span class="seat-number">' + (pos.index + 1) + '</span>'
        + '<span class="seat-name">' + safeName + '</span>'
        + '</div>';
    }

    var html = '<div class="blackboard">\uCE60 \uD310</div>';
    html += '<div class="ushape-grid">';

    html += '<div class="ushape-row">';
    topSeats.forEach(function(p) { html += renderSeat(p); });
    html += '</div>';

    html += '<div class="ushape-side-wrapper">';
    html += '<div class="ushape-side">';
    leftSeats.forEach(function(p) { html += renderSeat(p); });
    html += '</div>';
    html += '<div class="ushape-side">';
    rightSeats.forEach(function(p) { html += renderSeat(p); });
    html += '</div>';
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }
};

// === layouts/custom-layout.js ===
var DESK_W = 60;
var DESK_H = 40;
var GRID_SIZE = 20;
var MAX_HISTORY = 50;

var customLayout = {
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

  init: function(canvas, desks, onUpdate) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._desks = desks.map(function(d, i) { return Object.assign({}, d, { id: d.id != null ? d.id : i }); });
    this._onUpdate = onUpdate;
    this._selected = null;
    this._history = [];
    this._redoStack = [];
    this._bindEvents();
    this._fitCanvas();
    this._pushHistory();
    this._draw();
  },

  _snap: function(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  },

  _fitCanvas: function() {
    var canvas = this._canvas;
    var w = canvas.clientWidth || 560;
    var dpr = window.devicePixelRatio || 1;
    var h = Math.max(300, Math.min(500, Math.floor(w * 0.65)));

    this._canvasW = w;
    this._canvasH = h;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _pushHistory: function() {
    this._history.push(JSON.stringify(this._desks));
    if (this._history.length > MAX_HISTORY) this._history.shift();
    this._redoStack = [];
    this._updateToolbarState();
  },

  undo: function() {
    if (this._history.length <= 1) return;
    this._redoStack.push(this._history.pop());
    this._desks = JSON.parse(this._history[this._history.length - 1]);
    this._selected = null;
    this._draw();
    this._notify();
    this._updateToolbarState();
  },

  redo: function() {
    if (this._redoStack.length === 0) return;
    var state = this._redoStack.pop();
    this._history.push(state);
    this._desks = JSON.parse(state);
    this._selected = null;
    this._draw();
    this._notify();
    this._updateToolbarState();
  },

  _updateToolbarState: function() {
    var undoBtn = document.getElementById('btn-undo-desk');
    var redoBtn = document.getElementById('btn-redo-desk');
    if (undoBtn) undoBtn.disabled = this._history.length <= 1;
    if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;

    var delBtn = document.getElementById('btn-delete-desk');
    if (delBtn) delBtn.disabled = this._selected === null;

    var countEl = document.getElementById('desk-count');
    if (countEl) countEl.textContent = this._desks.length + '\uAC1C';
  },

  addDesk: function() {
    var id = this._desks.length;
    var x = this._snap(50 + (id % 8) * 70);
    var y = this._snap(50 + Math.floor(id / 8) * 55);
    this._desks.push({
      id: id,
      x: Math.min(x, this._canvasW - DESK_W),
      y: Math.min(y, this._canvasH - DESK_H),
      seatIndex: id
    });
    this._pushHistory();
    this._draw();
    this._notify();
  },

  addDesks: function(count) {
    if (count <= 0) return;
    this._desks = [];
    var cols = Math.ceil(Math.sqrt(count * (this._canvasW / this._canvasH)));
    var gapX = Math.max(DESK_W + 10, Math.floor((this._canvasW - 40) / cols));
    var gapY = DESK_H + 15;

    for (var i = 0; i < count; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
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

  deleteDesk: function(index) {
    if (index < 0 || index >= this._desks.length) return;
    this._desks.splice(index, 1);
    this._desks.forEach(function(d, i) { d.id = i; d.seatIndex = i; });
    if (this._selected === index) this._selected = null;
    else if (this._selected !== null && this._selected > index) this._selected--;
    this._pushHistory();
    this._draw();
    this._notify();
  },

  deleteSelected: function() {
    if (this._selected !== null) {
      this.deleteDesk(this._selected);
    }
  },

  clearDesks: function() {
    this._desks = [];
    this._selected = null;
    this._pushHistory();
    this._draw();
    this._notify();
  },

  getDesks: function() {
    return this._desks.map(function(d, i) { return Object.assign({}, d, { seatIndex: i }); });
  },

  getSelected: function() {
    return this._selected;
  },

  getSeatPositions: function(settings) {
    var desks = settings.customDesks || [];
    return desks.map(function(d, i) {
      return {
        index: i,
        row: Math.round(d.y / DESK_H),
        col: Math.round(d.x / DESK_W)
      };
    });
  },

  getSeatCount: function(settings) {
    return (settings.customDesks || []).length;
  },

  distance: function(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render: function(container, settings, assignment, options) {
    if (!options) options = {};
    var desks = settings.customDesks || [];
    if (desks.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:2rem">'
        + '<svg class="empty-icon-svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 14h20"/><path d="M6 18v2M18 18v2"/></svg>'
        + '<p class="empty-text">\uC790\uC720\uBC30\uCE58 \uCC45\uC0C1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</p>'
        + '<p class="hint">\uAD50\uC0AC \uC124\uC815\uC5D0\uC11C \uCC45\uC0C1\uC744 \uCD94\uAC00\uD558\uC138\uC694</p>'
        + '</div>';
      return;
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    desks.forEach(function(d) {
      minX = Math.min(minX, d.x);
      minY = Math.min(minY, d.y);
      maxX = Math.max(maxX, d.x + DESK_W);
      maxY = Math.max(maxY, d.y + DESK_H);
    });

    var srcW = maxX - minX || 1;
    var srcH = maxY - minY || 1;

    var isStudentView = container.classList.contains('student-grid');
    var targetW = isStudentView ? Math.min(container.clientWidth || 700, 900) : Math.min(container.clientWidth || 500, 600);
    var seatW = isStudentView ? 80 : 64;
    var seatH = isStudentView ? 56 : 48;
    var scale = Math.min(
      (targetW - 40) / srcW,
      400 / srcH,
      seatW / DESK_W
    );

    var scaledW = srcW * scale + 40;
    var scaledH = srcH * scale + 40;

    var html = '<div class="blackboard">\uCE60 \uD310</div>';
    html += '<div class="custom-preview" style="position:relative;width:' + scaledW + 'px;height:' + scaledH + 'px;margin:0 auto;">';

    desks.forEach(function(d, i) {
      var name = assignment ? assignment[i] : null;
      var safeName = escapeHTML(name);
      var cls = name ? 'seat assigned' : 'seat empty';
      var extraCls = options.highlightSeat === i ? ' highlight' : '';
      var revealCls = options.animate ? ' reveal' : '';
      var delay = options.animate ? 'animation-delay: ' + (i * 60) + 'ms' : '';
      var label = name ? (i + 1) + '\uBC88 \uC790\uB9AC: ' + safeName : (i + 1) + '\uBC88 \uC790\uB9AC (\uBE44\uC5B4\uC788\uC74C)';

      var sx = (d.x - minX) * scale + 20;
      var sy = (d.y - minY) * scale + 20;
      var sw = DESK_W * scale;
      var sh = DESK_H * scale;

      html += '<div class="' + cls + extraCls + revealCls + '" data-seat="' + i + '"'
        + ' style="position:absolute;left:' + sx + 'px;top:' + sy + 'px;width:' + sw + 'px;height:' + sh + 'px;' + delay + '"'
        + ' tabindex="0" role="button" aria-label="' + label + '">'
        + '<span class="seat-number">' + (i + 1) + '</span>'
        + '<span class="seat-name">' + safeName + '</span>'
        + '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  },

  _bindEvents: function() {
    var self = this;
    var c = this._canvas;
    var newCanvas = c.cloneNode(true);
    c.parentNode.replaceChild(newCanvas, c);
    this._canvas = newCanvas;
    this._ctx = newCanvas.getContext('2d');

    var dpr = window.devicePixelRatio || 1;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    newCanvas.addEventListener('mousedown', function(e) { self._onPointerDown(e); });
    newCanvas.addEventListener('mousemove', function(e) { self._onPointerMove(e); });
    newCanvas.addEventListener('mouseup', function(e) { self._onPointerUp(e); });

    newCanvas.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      var pos = self._getPos(e);
      var idx = self._hitTest(pos);
      if (idx !== -1) {
        self.deleteDesk(idx);
      }
    });

    newCanvas.addEventListener('dblclick', function(e) {
      var pos = self._getPos(e);
      var idx = self._hitTest(pos);
      if (idx !== -1) {
        self.deleteDesk(idx);
      }
    });

    newCanvas.addEventListener('touchstart', function(e) {
      e.preventDefault();
      self._onPointerDown(e.touches[0]);
    }, { passive: false });
    newCanvas.addEventListener('touchmove', function(e) {
      e.preventDefault();
      self._onPointerMove(e.touches[0]);
    }, { passive: false });
    newCanvas.addEventListener('touchend', function(e) {
      self._onPointerUp(e);
    });

    newCanvas.setAttribute('tabindex', '0');
    newCanvas.addEventListener('keydown', function(e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self._selected !== null) {
          e.preventDefault();
          self.deleteSelected();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) self.redo();
        else self.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        self.redo();
      }
    });

    if (this._resizeBound) {
      window.removeEventListener('resize', this._resizeBound);
    }
    var self2 = this;
    this._resizeBound = function() {
      self2._fitCanvas();
      self2._draw();
    };
    window.addEventListener('resize', this._resizeBound);
  },

  _getPos: function(e) {
    var rect = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this._canvasW / rect.width),
      y: (e.clientY - rect.top) * (this._canvasH / rect.height)
    };
  },

  _hitTest: function(pos) {
    for (var i = this._desks.length - 1; i >= 0; i--) {
      var d = this._desks[i];
      if (pos.x >= d.x && pos.x <= d.x + DESK_W && pos.y >= d.y && pos.y <= d.y + DESK_H) {
        return i;
      }
    }
    return -1;
  },

  _onPointerDown: function(e) {
    var pos = this._getPos(e);
    var idx = this._hitTest(pos);

    if (idx !== -1) {
      this._dragging = idx;
      this._dragMoved = false;
      this._dragOffset = { x: pos.x - this._desks[idx].x, y: pos.y - this._desks[idx].y };
      this._canvas.style.cursor = 'grabbing';
    } else {
      this._selected = null;
      this._draw();
      this._updateToolbarState();
    }
  },

  _onPointerMove: function(e) {
    if (this._dragging === null) {
      var pos = this._getPos(e);
      var idx = this._hitTest(pos);
      this._canvas.style.cursor = idx !== -1 ? 'grab' : 'crosshair';
      return;
    }

    this._dragMoved = true;
    var pos2 = this._getPos(e);
    var d = this._desks[this._dragging];
    d.x = Math.max(0, Math.min(this._canvasW - DESK_W, pos2.x - this._dragOffset.x));
    d.y = Math.max(0, Math.min(this._canvasH - DESK_H, pos2.y - this._dragOffset.y));
    this._draw();
  },

  _onPointerUp: function(e) {
    if (this._dragging !== null) {
      var idx = this._dragging;
      this._dragging = null;
      this._canvas.style.cursor = 'crosshair';

      if (this._dragMoved) {
        var d = this._desks[idx];
        d.x = this._snap(d.x);
        d.y = this._snap(d.y);
        this._selected = idx;
        this._pushHistory();
        this._draw();
        this._notify();
      } else {
        this._selected = this._selected === idx ? null : idx;
        this._draw();
        this._updateToolbarState();
      }
    }
  },

  _notify: function() {
    if (this._onUpdate) this._onUpdate(this.getDesks());
  },

  _draw: function() {
    var ctx = this._ctx;
    var w = this._canvasW;
    var h = this._canvasH;
    var self = this;
    ctx.clearRect(0, 0, w, h);

    // Grid dots
    for (var x = 0; x < w; x += GRID_SIZE) {
      for (var y = 0; y < h; y += GRID_SIZE) {
        var isMajor = x % (GRID_SIZE * 5) === 0 && y % (GRID_SIZE * 5) === 0;
        ctx.fillStyle = isMajor ? '#CBD5E1' : '#E2E8F0';
        ctx.beginPath();
        ctx.arc(x, y, isMajor ? 1.5 : 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Empty state onboarding
    if (this._desks.length === 0) {
      ctx.save();
      ctx.fillStyle = '#94A3B8';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\uC67C\uCABD \uD328\uB110\uC5D0\uC11C \uCC45\uC0C1\uC744 \uCD94\uAC00\uD558\uAC70\uB098', w / 2, h / 2 - 16);
      ctx.fillText('"\uD559\uC0DD \uC218\uB9CC\uD07C \uC790\uB3D9 \uBC30\uCE58"\uB97C \uB20C\uB7EC \uC2DC\uC791\uD558\uC138\uC694', w / 2, h / 2 + 16);
      ctx.restore();
      this._updateToolbarState();
      return;
    }

    // Snap guides for selected desk
    if (this._selected !== null && this._dragging === null) {
      var sel = this._desks[this._selected];
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
        this._desks.forEach(function(other, oi) {
          if (oi === self._selected) return;
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
    this._desks.forEach(function(d, i) {
      var isDragging = self._dragging === i;
      var isSelected = self._selected === i;

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
      ctx.font = (isSelected ? 'bold ' : '') + '11px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('' + (i + 1), d.x + DESK_W / 2, d.y + DESK_H / 2);

      ctx.restore();
    });

    this._updateToolbarState();
  }
};

// === components/seat-grid.js ===
var layoutMap = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout
};

function getLayout(type) {
  return layoutMap[type] || examLayout;
}

function renderSeatGrid(container, data, assignment, options) {
  if (!options) options = {};
  var layout = getLayout(data.layoutType);
  layout.render(container, data.layoutSettings, assignment, {
    fixedSeats: data.fixedSeats,
    animate: options.animate,
    highlightSeat: options.highlightSeat
  });

  if (options.onSeatClick) {
    container.querySelectorAll('[data-seat]').forEach(function(el) {
      el.addEventListener('click', function() {
        var seatIndex = parseInt(el.dataset.seat);
        options.onSeatClick(seatIndex);
      });
    });
  }
}

function getTotalSeatsForLayout(data) {
  var layout = getLayout(data.layoutType);
  return layout.getSeatCount(data.layoutSettings);
}

// === components/student-roster.js ===
function initRoster() {
  var textarea = document.getElementById('roster-input');
  var countEl = document.getElementById('student-count');
  var saveBtn = document.getElementById('btn-save-roster');

  var data = store.load();
  if (data.students.length > 0) {
    textarea.value = data.students.join('\n');
    countEl.textContent = data.students.length + '\uBA85';
  }

  textarea.addEventListener('input', function() {
    var names = validateStudents(textarea.value.split('\n'));
    countEl.textContent = names.length + '\uBA85';
  });

  // Gender list
  var genderListEl = document.getElementById('gender-list');

  function renderGenderList() {
    if (!genderListEl) return;
    var data2 = store.load();
    if (data2.students.length === 0) {
      genderListEl.innerHTML = '';
      return;
    }
    var genders = data2.studentGenders || {};
    var html = '<h3 class="gender-list-title">\uC131\uBCC4 \uC9C0\uC815</h3>';
    data2.students.forEach(function(name) {
      var g = genders[name] || '';
      html += '<div class="gender-row" data-student="' + escapeHTML(name) + '">'
        + '<span class="gender-student-name">' + escapeHTML(name) + '</span>'
        + '<label class="gender-radio"><input type="radio" name="gender-' + escapeHTML(name) + '" value="M"' + (g === 'M' ? ' checked' : '') + '> \uB0A8</label>'
        + '<label class="gender-radio"><input type="radio" name="gender-' + escapeHTML(name) + '" value="F"' + (g === 'F' ? ' checked' : '') + '> \uB140</label>'
        + '<label class="gender-radio"><input type="radio" name="gender-' + escapeHTML(name) + '" value=""' + (g === '' ? ' checked' : '') + '> \uBBF8\uC9C0\uC815</label>'
        + '</div>';
    });
    genderListEl.innerHTML = html;

    genderListEl.querySelectorAll('input[type="radio"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var d = store.load();
        var studentGenders = Object.assign({}, d.studentGenders || {});
        var studentName = radio.closest('.gender-row').dataset.student;
        if (radio.value) {
          studentGenders[studentName] = radio.value;
        } else {
          delete studentGenders[studentName];
        }
        store.update({ studentGenders: studentGenders });
      });
    });
  }

  saveBtn.addEventListener('click', function() {
    var names = validateStudents(textarea.value.split('\n'));

    if (names.length === 0) {
      showToast('\uD559\uC0DD \uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.', 'warning');
      return;
    }

    var duplicates = names.filter(function(n, i) { return names.indexOf(n) !== i; });
    if (duplicates.length > 0) {
      var uniqueDups = [];
      duplicates.forEach(function(d) { if (uniqueDups.indexOf(d) === -1) uniqueDups.push(d); });
      showToast('\uC911\uBCF5\uB41C \uC774\uB984\uC774 \uC788\uC2B5\uB2C8\uB2E4: ' + uniqueDups.join(', '), 'warning', 3500);
    }

    var seen = {};
    var uniqueNames = [];
    names.forEach(function(n) {
      if (!seen[n]) {
        seen[n] = true;
        uniqueNames.push(n);
      }
    });

    // Clean up gender info for removed students
    var currentGenders = store.load().studentGenders || {};
    var cleanedGenders = {};
    uniqueNames.forEach(function(name) {
      if (currentGenders[name]) cleanedGenders[name] = currentGenders[name];
    });

    store.update({
      students: uniqueNames,
      classSize: uniqueNames.length,
      fixedSeats: store.load().fixedSeats.filter(function(f) { return uniqueNames.indexOf(f.studentName) !== -1; }),
      separationRules: store.load().separationRules.filter(function(r) {
        return uniqueNames.indexOf(r.studentA) !== -1 && uniqueNames.indexOf(r.studentB) !== -1;
      }),
      studentGenders: cleanedGenders
    });
    countEl.textContent = uniqueNames.length + '\uBA85';
    window.dispatchEvent(new CustomEvent('roster-updated'));
    renderGenderList();
    showToast(uniqueNames.length + '\uBA85\uC758 \uD559\uC0DD \uBA85\uB2E8\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'success');
  });

  renderGenderList();
  window.addEventListener('roster-updated', renderGenderList);
}

// === components/fixed-seat-editor.js ===
function initFixedSeatEditor(onUpdate) {
  var select = document.getElementById('fixed-student-select');
  var seatInput = document.getElementById('fixed-seat-number');
  var addBtn = document.getElementById('btn-add-fixed');
  var list = document.getElementById('fixed-seat-list');

  function refresh() {
    var data = store.load();
    populateFixedSelect(select, data.students, data.fixedSeats.map(function(f) { return f.studentName; }));
    renderFixedList(list, data.fixedSeats, onUpdate);
    var totalSeats = getTotalSeats(data);
    seatInput.max = totalSeats;
  }

  addBtn.addEventListener('click', function() {
    var data = store.load();
    var studentName = select.value;
    var seatNumber = parseInt(seatInput.value);

    if (!studentName) {
      showToast('\uD559\uC0DD\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.', 'warning');
      return;
    }
    if (!seatNumber || seatNumber < 1) {
      showToast('\uC790\uB9AC \uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.', 'warning');
      return;
    }

    var totalSeats = getTotalSeats(data);
    var seatIndex = seatNumber - 1;

    if (seatIndex >= totalSeats) {
      showToast('\uC790\uB9AC \uBC88\uD638\uB294 ' + totalSeats + ' \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4.', 'warning');
      return;
    }

    var filtered = data.fixedSeats.filter(function(f) { return f.seatIndex !== seatIndex && f.studentName !== studentName; });
    filtered.push({ studentName: studentName, seatIndex: seatIndex });

    store.update({ fixedSeats: filtered });
    showToast(studentName + ' \u2192 ' + seatNumber + '\uBC88 \uC790\uB9AC\uC5D0 \uACE0\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'success');
    select.value = '';
    seatInput.value = '';
    refresh();
    if (onUpdate) onUpdate();
    select.focus();
  });

  window.addEventListener('roster-updated', refresh);
  refresh();

  return { refresh: refresh };
}

function populateFixedSelect(select, students, usedStudents) {
  var current = select.value;
  select.innerHTML = '<option value="">\uD559\uC0DD \uC120\uD0DD...</option>';
  students.forEach(function(s) {
    if (usedStudents.indexOf(s) !== -1) return;
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (current) {
    var opts = select.options;
    for (var oi = 0; oi < opts.length; oi++) {
      if (opts[oi].value === current) { select.value = current; break; }
    }
  }
}

function renderFixedList(list, fixedSeats, onUpdate) {
  list.innerHTML = '';
  fixedSeats.forEach(function(fs) {
    var li = document.createElement('li');
    var span = document.createElement('span');
    var strong = document.createElement('strong');
    strong.textContent = (fs.seatIndex + 1) + '\uBC88';
    span.appendChild(document.createTextNode(fs.studentName + ' \u2192 '));
    span.appendChild(strong);
    span.appendChild(document.createTextNode(' \uC790\uB9AC'));
    li.appendChild(span);
    var btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '\u2715';
    btn.setAttribute('aria-label', fs.studentName + ' \uACE0\uC815 \uC790\uB9AC \uD574\uC81C');
    btn.addEventListener('click', function() {
      var data = store.load();
      store.update({
        fixedSeats: data.fixedSeats.filter(function(f) { return f.studentName !== fs.studentName; })
      });
      renderFixedList(list, store.load().fixedSeats, onUpdate);
      if (onUpdate) onUpdate();
      showToast(fs.studentName + '\uC758 \uACE0\uC815 \uC790\uB9AC\uAC00 \uD574\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'info');
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// === components/constraint-editor.js ===
function initConstraintEditor() {
  var selectA = document.getElementById('sep-student-a');
  var bWrap = document.getElementById('sep-student-b-wrap');
  var bToggle = document.getElementById('sep-student-b-toggle');
  var bDropdown = document.getElementById('sep-student-b-dropdown');
  var distInput = document.getElementById('sep-distance');
  var addBtn = document.getElementById('btn-add-sep');
  var list = document.getElementById('sep-rule-list');

  function refresh() {
    var data = store.load();
    populateConstraintSelect(selectA, data.students);
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
    renderConstraintList(list, data.separationRules);
  }

  bToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    bDropdown.style.display = bDropdown.style.display === 'block' ? 'none' : 'block';
  });

  document.addEventListener('click', function(e) {
    if (bWrap && !bWrap.contains(e.target)) {
      bDropdown.style.display = 'none';
    }
  });

  selectA.addEventListener('change', function() {
    var data = store.load();
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
  });

  // Distance hint
  var distHint = document.createElement('p');
  distHint.className = 'hint';
  distHint.style.margin = '0';
  distHint.textContent = '(\uAC00\uB85C\xB7\uC138\uB85C \uCE78 \uC218 \uD569, \uB300\uAC01\uC120=2\uCE78)';
  distInput.parentElement.parentElement.appendChild(distHint);

  addBtn.addEventListener('click', function() {
    var data = store.load();
    var studentA = selectA.value;
    var selectedBs = getSelectedStudents(bDropdown);
    var minDistance = parseInt(distInput.value) || 2;

    if (!studentA) {
      showToast('\uD559\uC0DD A\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.', 'warning');
      return;
    }
    if (selectedBs.length === 0) {
      showToast('\uD559\uC0DD B\uB97C \uD558\uB098 \uC774\uC0C1 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.', 'warning');
      return;
    }

    var newRules = [];
    var skipped = 0;
    for (var bi = 0; bi < selectedBs.length; bi++) {
      var studentB = selectedBs[bi];
      if (studentA === studentB) { skipped++; continue; }
      var rule = { studentA: studentA, studentB: studentB, minDistance: minDistance };
      if (!validateSeparationRule(rule, data.students)) { skipped++; continue; }
      var dup = data.separationRules.some(function(r) {
        return (r.studentA === rule.studentA && r.studentB === rule.studentB) ||
               (r.studentA === rule.studentB && r.studentB === rule.studentA);
      });
      if (dup) { skipped++; continue; }
      newRules.push(rule);
    }

    if (newRules.length === 0) {
      showToast('\uCD94\uAC00\uD560 \uC0C8\uB85C\uC6B4 \uADDC\uCE59\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', 'warning');
      return;
    }

    for (var ni = 0; ni < newRules.length; ni++) {
      data.separationRules.push(newRules[ni]);
    }
    store.update({ separationRules: data.separationRules });
    selectA.value = '';
    populateMultiSelect(bDropdown, bToggle, data.students, '');
    refresh();
    showToast(newRules.length + '\uAC74\uC758 \uBD84\uB9AC \uADDC\uCE59\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'success');
  });

  window.addEventListener('roster-updated', refresh);
  refresh();

  return { refresh: refresh };
}

function populateConstraintSelect(select, students) {
  var current = select.value;
  select.innerHTML = '<option value="">\uD559\uC0DD \uC120\uD0DD</option>';
  students.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (current) {
    var opts = select.options;
    for (var oi = 0; oi < opts.length; oi++) {
      if (opts[oi].value === current) { select.value = current; break; }
    }
  }
}

function populateMultiSelect(dropdown, toggle, students, excludeStudent) {
  dropdown.innerHTML = '';
  var filtered = students.filter(function(s) { return s !== excludeStudent; });
  for (var si = 0; si < filtered.length; si++) {
    var label = document.createElement('label');
    label.style.display = 'block';
    label.style.padding = '4px 8px';
    label.style.cursor = 'pointer';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = filtered[si];
    cb.style.marginRight = '6px';
    cb.addEventListener('change', (function(dd, tg) {
      return function() { updateToggleText(dd, tg); };
    })(dropdown, toggle));
    label.appendChild(cb);
    label.appendChild(document.createTextNode(filtered[si]));
    dropdown.appendChild(label);
  }
  updateToggleText(dropdown, toggle);
}

function getSelectedStudents(dropdown) {
  var checks = dropdown.querySelectorAll('input[type="checkbox"]:checked');
  var result = [];
  for (var ci = 0; ci < checks.length; ci++) {
    result.push(checks[ci].value);
  }
  return result;
}

function updateToggleText(dropdown, toggle) {
  var selected = getSelectedStudents(dropdown);
  if (selected.length === 0) {
    toggle.textContent = '\uD559\uC0DD \uC120\uD0DD';
  } else {
    toggle.textContent = selected.length + '\uBA85 \uC120\uD0DD';
  }
}

function renderConstraintList(list, rules) {
  list.innerHTML = '';
  rules.forEach(function(rule, i) {
    var li = document.createElement('li');
    var span = document.createElement('span');
    span.appendChild(document.createTextNode(rule.studentA + ' \u2194 ' + rule.studentB + ' '));
    var em = document.createElement('em');
    em.style.cssText = 'color:var(--text-light);font-size:0.8em';
    em.textContent = '(\uCD5C\uC18C ' + rule.minDistance + '\uCE78)';
    span.appendChild(em);
    li.appendChild(span);
    var btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '\u2715';
    btn.setAttribute('aria-label', rule.studentA + '-' + rule.studentB + ' \uADDC\uCE59 \uC0AD\uC81C');
    btn.addEventListener('click', function() {
      var data = store.load();
      data.separationRules.splice(i, 1);
      store.update({ separationRules: data.separationRules });
      renderConstraintList(list, store.load().separationRules);
      showToast('\uADDC\uCE59\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'info');
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// === algorithm/verify-assignment.js ===
function verifyAssignment(result, data) {
  var layout = layoutMap[data.layoutType] || examLayout;
  var positions = layout.getSeatPositions(data.layoutSettings);
  var posMap = {};
  positions.forEach(function(p) { posMap[p.index] = p; });
  var violations = [];

  // Check fixed seats
  for (var fi = 0; fi < data.fixedSeats.length; fi++) {
    var fs = data.fixedSeats[fi];
    if (data.students.indexOf(fs.studentName) === -1) continue;
    if (result[fs.seatIndex] !== fs.studentName) {
      violations.push('\uACE0\uC815 \uC790\uB9AC \uC704\uBC18: ' + fs.studentName + ' \u2192 ' + (fs.seatIndex + 1) + '\uBC88 \uC790\uB9AC');
    }
  }

  // Check separation rules
  for (var ri = 0; ri < data.separationRules.length; ri++) {
    var rule = data.separationRules[ri];
    var seatA = null, seatB = null;
    var keys = Object.keys(result);
    for (var ki = 0; ki < keys.length; ki++) {
      if (result[keys[ki]] === rule.studentA) seatA = Number(keys[ki]);
      if (result[keys[ki]] === rule.studentB) seatB = Number(keys[ki]);
    }
    if (seatA !== null && seatB !== null) {
      var posA = posMap[seatA];
      var posB = posMap[seatB];
      if (posA && posB) {
        var dist = layout.distance(posA, posB);
        if (dist <= rule.minDistance) {
          violations.push('\uBD84\uB9AC \uC704\uBC18: ' + rule.studentA + ' \u2194 ' + rule.studentB + ' (\uAC70\uB9AC ' + dist + ', \uCD5C\uC18C ' + rule.minDistance + ')');
        }
      }
    }
  }

  return violations;
}

// === algorithm/seat-randomizer.js ===
var randomizerLayoutMap = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout
};

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function randomizeSeats(data) {
  var students = data.students;
  var layoutType = data.layoutType;
  var layoutSettings = data.layoutSettings;
  var fixedSeats = data.fixedSeats;
  var separationRules = data.separationRules;
  var layout = randomizerLayoutMap[layoutType];
  if (!layout) return null;

  var positions = layout.getSeatPositions(layoutSettings);
  var totalSeats = positions.length;

  if (students.length === 0) return null;
  if (students.length > totalSeats) return null;

  var posMap = {};
  positions.forEach(function(p) { posMap[p.index] = p; });

  var MAX_ATTEMPTS = 100;

  // 1st pass: all constraints including history
  for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    var result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data);
    if (result) return result;
  }

  // 2nd pass fallback: without history constraint
  if (data.useHistoryExclusion !== false && (data.assignmentHistory || []).length > 0) {
    var fallbackData = Object.assign({}, data, { useHistoryExclusion: false });
    for (var attempt2 = 0; attempt2 < MAX_ATTEMPTS; attempt2++) {
      var result2 = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, fallbackData);
      if (result2) {
        result2._historyFallback = true;
        return result2;
      }
    }
  }

  return null;
}

function tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data) {
  var assignment = {};
  var assignedStudents = {};
  var usedSeats = {};

  for (var fi = 0; fi < fixedSeats.length; fi++) {
    var fs = fixedSeats[fi];
    if (students.indexOf(fs.studentName) === -1) continue;
    if (fs.seatIndex >= totalSeats) continue;
    assignment[fs.seatIndex] = fs.studentName;
    assignedStudents[fs.studentName] = true;
    usedSeats[fs.seatIndex] = true;
  }

  var remaining = students.filter(function(s) { return !assignedStudents[s]; });
  var freeSeats = positions
    .map(function(p) { return p.index; })
    .filter(function(idx) { return !usedSeats[idx]; });

  var constraintCount = {};
  remaining.forEach(function(s) { constraintCount[s] = 0; });
  separationRules.forEach(function(rule) {
    if (constraintCount[rule.studentA] !== undefined) constraintCount[rule.studentA]++;
    if (constraintCount[rule.studentB] !== undefined) constraintCount[rule.studentB]++;
  });

  remaining.sort(function(a, b) { return constraintCount[b] - constraintCount[a]; });

  shuffle(freeSeats);

  var success = backtrack(0, remaining, freeSeats, assignment, posMap, separationRules, layout, data);
  return success ? assignment : null;
}

function backtrack(studentIdx, students, freeSeats, assignment, posMap, rules, layout, data) {
  if (studentIdx >= students.length) return true;

  var student = students[studentIdx];
  var shuffledSeats = freeSeats.slice();
  shuffle(shuffledSeats);

  for (var si = 0; si < shuffledSeats.length; si++) {
    var seatIdx = shuffledSeats[si];
    if (assignment[seatIdx] !== undefined) continue;

    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout)) continue;
    if (!checkGenderConstraint(student, seatIdx, assignment, posMap, layout, data)) continue;
    if (!checkHistoryConstraint(student, seatIdx, data)) continue;

    assignment[seatIdx] = student;

    if (backtrack(studentIdx + 1, students, freeSeats, assignment, posMap, rules, layout, data)) {
      return true;
    }

    delete assignment[seatIdx];
  }

  return false;
}

function checkConstraints(student, seatIdx, assignment, posMap, rules, layout) {
  var pos = posMap[seatIdx];
  if (!pos) return false;

  for (var ri = 0; ri < rules.length; ri++) {
    var rule = rules[ri];
    var otherStudent = null;
    if (rule.studentA === student) otherStudent = rule.studentB;
    else if (rule.studentB === student) otherStudent = rule.studentA;
    else continue;

    var assignedKeys = Object.keys(assignment);
    for (var ki = 0; ki < assignedKeys.length; ki++) {
      var assignedSeat = assignedKeys[ki];
      var assignedName = assignment[assignedSeat];
      if (assignedName === otherStudent) {
        var otherPos = posMap[Number(assignedSeat)];
        if (otherPos && layout.distance(pos, otherPos) <= rule.minDistance) {
          return false;
        }
      }
    }
  }

  return true;
}

function checkGenderConstraint(student, seatIdx, assignment, posMap, layout, data) {
  var genderRule = data.genderRule || 'none';
  if (genderRule === 'none') return true;

  var genders = data.studentGenders || {};
  var myGender = genders[student];
  if (!myGender) return true;

  var pos = posMap[seatIdx];
  if (!pos) return true;

  var adjacentSeats = [];
  var assignedKeys = Object.keys(assignment);

  if (data.layoutType === 'pair') {
    var partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
    for (var ki = 0; ki < assignedKeys.length; ki++) {
      var otherPos = posMap[Number(assignedKeys[ki])];
      if (otherPos && otherPos.row === pos.row && otherPos.col === partnerCol) {
        adjacentSeats.push(assignment[assignedKeys[ki]]);
      }
    }
  } else {
    for (var ki2 = 0; ki2 < assignedKeys.length; ki2++) {
      var otherPos2 = posMap[Number(assignedKeys[ki2])];
      if (otherPos2) {
        var dist = Math.abs(pos.row - otherPos2.row) + Math.abs(pos.col - otherPos2.col);
        if (dist === 1) adjacentSeats.push(assignment[assignedKeys[ki2]]);
      }
    }
  }

  for (var ai = 0; ai < adjacentSeats.length; ai++) {
    var neighborGender = genders[adjacentSeats[ai]];
    if (!neighborGender) continue;
    if (genderRule === 'same' && myGender !== neighborGender) return false;
    if (genderRule === 'mixed' && myGender === neighborGender) return false;
  }

  return true;
}

function checkHistoryConstraint(student, seatIdx, data) {
  if (data.useHistoryExclusion === false) return true;

  var history = data.assignmentHistory || [];
  var excludeCount = data.historyExcludeCount || 1;

  var recordsToCheck = [];
  if (data.lastAssignment && data.lastAssignment.mapping) {
    recordsToCheck.push(data.lastAssignment.mapping);
  }
  var recentHistory = history.slice(-excludeCount);
  for (var hi = 0; hi < recentHistory.length; hi++) {
    if (recentHistory[hi].mapping) recordsToCheck.push(recentHistory[hi].mapping);
  }

  for (var ri = 0; ri < recordsToCheck.length; ri++) {
    if (recordsToCheck[ri][seatIdx] === student) return false;
  }

  return true;
}

// === screens/teacher-screen.js ===
function initTeacherScreen() {
  initRoster();

  var previewTitle = document.getElementById('preview-title');
  var seatGrid = document.getElementById('teacher-seat-grid');
  var customEditor = document.getElementById('custom-editor');

  function refreshPreview() {
    var data = store.load();
    var assignment = (data.lastAssignment && data.lastAssignment.mapping) ? data.lastAssignment.mapping : null;

    if (data.layoutType === 'custom') {
      seatGrid.style.display = 'none';
      customEditor.style.display = 'block';
      previewTitle.textContent = '\uC790\uC720\uBC30\uCE58 \uD3B8\uC9D1\uAE30';
    } else {
      seatGrid.style.display = 'block';
      customEditor.style.display = 'none';
      previewTitle.textContent = '\uBC30\uCE58\uB3C4 \uBBF8\uB9AC\uBCF4\uAE30';
      renderSeatGrid(seatGrid, data, assignment, {
        fixedSeats: data.fixedSeats
      });
    }
    checkSeatWarning();
    updateCustomStatus();
  }

  function checkSeatWarning() {
    var data = store.load();
    var warningEl = document.getElementById('seat-warning');
    var totalSeats2 = getTotalSeats(data);
    var studentCount = data.students.length;

    if (studentCount === 0 || totalSeats2 === 0) {
      warningEl.style.display = 'none';
      return;
    }

    if (studentCount > totalSeats2) {
      warningEl.style.display = 'flex';
      warningEl.textContent = '\uD559\uC0DD \uC218(' + studentCount + '\uBA85)\uAC00 \uC88C\uC11D \uC218(' + totalSeats2 + '\uC11D)\uBCF4\uB2E4 \uB9CE\uC2B5\uB2C8\uB2E4. \uC88C\uC11D\uC744 \uCD94\uAC00\uD558\uAC70\uB098 \uBA85\uB2E8\uC744 \uC870\uC815\uD558\uC138\uC694.';
    } else if (totalSeats2 - studentCount > totalSeats2 * 0.5) {
      warningEl.style.display = 'flex';
      warningEl.textContent = '\uC88C\uC11D(' + totalSeats2 + '\uC11D)\uC774 \uD559\uC0DD \uC218(' + studentCount + '\uBA85)\uBCF4\uB2E4 \uB9CE\uC774 \uB0A8\uC2B5\uB2C8\uB2E4. \uD589/\uC5F4 \uC218\uB97C \uC870\uC815\uD574 \uBCF4\uC138\uC694.';
    } else {
      warningEl.style.display = 'none';
    }
  }

  function updateCustomStatus() {
    var data = store.load();
    var deskCountEl = document.getElementById('desk-count');
    var studentCountEl = document.getElementById('custom-student-count');
    var warningEl = document.getElementById('custom-seat-warning');
    if (!deskCountEl) return;

    var deskCount = (data.layoutSettings.customDesks || []).length;
    var studentCount = data.students.length;
    deskCountEl.textContent = deskCount;
    studentCountEl.textContent = studentCount;

    if (data.layoutType !== 'custom' || studentCount === 0 || deskCount === 0) {
      warningEl.style.display = 'none';
      return;
    }

    warningEl.style.display = 'block';
    if (studentCount > deskCount) {
      warningEl.className = 'custom-seat-warning warning-over';
      warningEl.textContent = '\uCC45\uC0C1\uC774 ' + (studentCount - deskCount) + '\uAC1C \uBD80\uC871\uD569\uB2C8\uB2E4';
    } else if (deskCount > studentCount) {
      warningEl.className = 'custom-seat-warning warning-under';
      warningEl.textContent = '\uBE48 \uCC45\uC0C1\uC774 ' + (deskCount - studentCount) + '\uAC1C \uB0A8\uC2B5\uB2C8\uB2E4';
    } else {
      warningEl.className = 'custom-seat-warning warning-ok';
      warningEl.textContent = '\uB531 \uB9DE\uC2B5\uB2C8\uB2E4!';
    }
  }

  initFixedSeatEditor(refreshPreview);
  initConstraintEditor();

  // Layout tabs
  var tabs = document.querySelectorAll('.layout-tabs .tab');
  var gridOptions = document.getElementById('grid-options');
  var customOptions = document.getElementById('custom-options');

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      var type = tab.dataset.layout;

      if (type === 'custom') {
        gridOptions.style.display = 'none';
        customOptions.style.display = 'block';
        initCustomCanvas();
      } else {
        gridOptions.style.display = 'flex';
        customOptions.style.display = 'none';
      }

      store.update({ layoutType: type });
      refreshPreview();
    });
  });

  // Initial tab state
  var data = store.load();
  var activeTab = document.querySelector('.tab[data-layout="' + data.layoutType + '"]');
  if (activeTab) {
    tabs.forEach(function(t) {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    if (data.layoutType === 'custom') {
      gridOptions.style.display = 'none';
      customOptions.style.display = 'block';
    }
  }

  // Row/column settings
  var colInput = document.getElementById('col-count');
  var rowInput = document.getElementById('row-count');
  colInput.value = data.layoutSettings.columns;
  rowInput.value = data.layoutSettings.rows;

  var previewDebounce = null;
  function onGridChange() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(function() {
      var current = store.load();
      var cols = parseInt(colInput.value) || 6;
      var rows2 = parseInt(rowInput.value) || 5;
      store.update({
        layoutSettings: Object.assign({}, current.layoutSettings, {
          columns: Math.max(1, Math.min(12, cols)),
          rows: Math.max(1, Math.min(12, rows2))
        })
      });
      refreshPreview();
    }, 300);
  }
  colInput.addEventListener('input', onGridChange);
  rowInput.addEventListener('input', onGridChange);

  // Save layout
  document.getElementById('btn-save-layout').addEventListener('click', function() {
    var current = store.load();
    var cols = parseInt(colInput.value) || 6;
    var rows2 = parseInt(rowInput.value) || 5;
    store.update({
      layoutSettings: Object.assign({}, current.layoutSettings, {
        columns: Math.max(1, Math.min(12, cols)),
        rows: Math.max(1, Math.min(12, rows2))
      })
    });
    refreshPreview();
    showToast('\uBC30\uCE58\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'success');
  });

  // Custom canvas
  function initCustomCanvas() {
    var canvas = document.getElementById('custom-canvas');
    var current = store.load();
    customLayout.init(canvas, current.layoutSettings.customDesks || [], function(desks) {
      var d = store.load();
      store.update({
        layoutSettings: Object.assign({}, d.layoutSettings, { customDesks: desks })
      });
      updateCustomStatus();
    });
  }

  document.getElementById('btn-add-desk').addEventListener('click', function() {
    customLayout.addDesk();
  });

  document.getElementById('btn-add-desks-auto').addEventListener('click', function() {
    var current = store.load();
    var count = current.students.length;
    if (count === 0) {
      showToast('\uD559\uC0DD \uBA85\uB2E8\uC744 \uBA3C\uC800 \uC785\uB825\uD558\uC138\uC694.', 'warning');
      return;
    }
    customLayout.addDesks(count);
    showToast(count + '\uAC1C \uCC45\uC0C1\uC744 \uC790\uB3D9 \uBC30\uCE58\uD588\uC2B5\uB2C8\uB2E4.', 'success');
  });

  document.getElementById('btn-undo-desk').addEventListener('click', function() {
    customLayout.undo();
  });
  document.getElementById('btn-redo-desk').addEventListener('click', function() {
    customLayout.redo();
  });
  document.getElementById('btn-delete-desk').addEventListener('click', function() {
    customLayout.deleteSelected();
  });

  document.getElementById('btn-clear-desks').addEventListener('click', function() {
    var current = store.load();
    var deskCount = (current.layoutSettings.customDesks || []).length;
    if (deskCount === 0) return;
    showConfirm('\uCC45\uC0C1 ' + deskCount + '\uAC1C\uB97C \uBAA8\uB450 \uC0AD\uC81C\uD569\uB2C8\uB2E4.\n\uC815\uB9D0 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC5B4\uC694?').then(function(confirmed) {
      if (!confirmed) return;
      customLayout.clearDesks();
      showToast('\uBAA8\uB4E0 \uCC45\uC0C1\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'info');
    });
  });

  // Preview randomize
  document.getElementById('btn-preview-randomize').addEventListener('click', function() {
    var current = store.load();

    if (current.students.length === 0) {
      showToast('\uD559\uC0DD \uBA85\uB2E8\uC744 \uBA3C\uC800 \uC785\uB825\uD558\uC138\uC694.', 'warning');
      return;
    }

    var totalSeats2 = getTotalSeats(current);
    if (current.students.length > totalSeats2) {
      showToast('\uD559\uC0DD \uC218(' + current.students.length + '\uBA85)\uAC00 \uC88C\uC11D \uC218(' + totalSeats2 + '\uC11D)\uBCF4\uB2E4 \uB9CE\uC2B5\uB2C8\uB2E4.', 'error');
      return;
    }

    var result = randomizeSeats(current);
    if (result) {
      if (current.layoutType === 'custom') {
        seatGrid.style.display = 'block';
      }
      renderSeatGrid(seatGrid, current, result, { fixedSeats: current.fixedSeats, animate: true });
      var violations = verifyAssignment(result, current);
      if (violations.length > 0) {
        showToast('\uADDC\uCE59 \uC704\uBC18 ' + violations.length + '\uAC74: ' + violations.join(' / '), 'error', 5000);
      } else {
        var checks = [];
        if (current.fixedSeats.length > 0) checks.push('\uACE0\uC815 ' + current.fixedSeats.length + '\uAC74');
        if (current.separationRules.length > 0) checks.push('\uBD84\uB9AC ' + current.separationRules.length + '\uAC74');
        var detail = checks.length > 0 ? ' (' + checks.join(', ') + ' \uC801\uC6A9\uB428)' : '';
        showToast('\uD14C\uC2A4\uD2B8 \uBC30\uCE58 \uC644\uB8CC!' + detail, 'success');
      }
    } else {
      showToast('\uC790\uB9AC \uBC30\uCE58\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uBD84\uB9AC \uADDC\uCE59\uC774 \uCDA9\uB3CC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.', 'error', 3500);
    }
  });

  // Export/Import
  document.getElementById('btn-export').addEventListener('click', function() {
    var json = store.exportJSON();
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '\uC790\uB9AC\uBC30\uCE58_\uC124\uC815_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('\uC124\uC815\uC744 \uB0B4\uBCF4\uB0C8\uC2B5\uB2C8\uB2E4.', 'success');
  });

  var importInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', function() { importInput.click(); });
  importInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var parsed = JSON.parse(reader.result);

        if (parsed.type === 'seat-result') {
          store.update({
            students: parsed.students || [],
            classSize: (parsed.students || []).length,
            layoutType: parsed.layoutType || 'exam',
            layoutSettings: parsed.layoutSettings || { columns: 6, rows: 5, customDesks: [] },
            fixedSeats: parsed.fixedSeats || [],
            separationRules: parsed.separationRules || [],
            lastAssignment: parsed.assignment
              ? { mapping: parsed.assignment, timestamp: parsed.timestamp || Date.now() }
              : null
          });
          showToast('\uC774\uC804 \uBC30\uCE58 \uACB0\uACFC\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.', 'success');
          location.reload();
          return;
        }

        if (store.importJSON(reader.result)) {
          showToast('\uC124\uC815\uC744 \uAC00\uC838\uC654\uC2B5\uB2C8\uB2E4.', 'success');
          location.reload();
        } else {
          showToast('\uC798\uBABB\uB41C \uC124\uC815 \uD30C\uC77C\uC785\uB2C8\uB2E4.', 'error');
        }
      } catch(ex) {
        showToast('\uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Gender rule init
  var genderRuleRadios = document.querySelectorAll('input[name="gender-rule"]');
  var savedGenderRule = data.genderRule || 'none';
  genderRuleRadios.forEach(function(radio) {
    if (radio.value === savedGenderRule) radio.checked = true;
    radio.addEventListener('change', function() {
      store.update({ genderRule: radio.value });
    });
  });

  // History settings init
  var historyCheckbox = document.getElementById('use-history-exclusion');
  var historyCountSelect = document.getElementById('history-exclude-count');
  var historyInfo = document.getElementById('history-info');
  var clearHistoryBtn = document.getElementById('btn-clear-history');

  historyCheckbox.checked = data.useHistoryExclusion !== false;
  historyCountSelect.value = data.historyExcludeCount || 1;

  function updateHistoryInfo() {
    var d = store.load();
    var count = (d.assignmentHistory || []).length;
    historyInfo.textContent = '\uC800\uC7A5\uB41C \uAE30\uB85D: ' + count + '\uAC74';
  }
  updateHistoryInfo();

  historyCheckbox.addEventListener('change', function() {
    store.update({ useHistoryExclusion: historyCheckbox.checked });
  });
  historyCountSelect.addEventListener('change', function() {
    store.update({ historyExcludeCount: parseInt(historyCountSelect.value) });
  });
  clearHistoryBtn.addEventListener('click', function() {
    store.update({ assignmentHistory: [] });
    updateHistoryInfo();
    showToast('\uAE30\uB85D\uC774 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'info');
  });

  window.addEventListener('roster-updated', function() {
    refreshPreview();
    updateCustomStatus();
  });

  refreshPreview();

  if (data.layoutType === 'custom') {
    setTimeout(initCustomCanvas, 0);
  }
}

// === screens/student-screen.js ===
function initStudentScreen() {
  var container = document.getElementById('student-seat-grid');
  var drawBtn = document.getElementById('btn-draw');
  var redrawBtn = document.getElementById('btn-redraw');
  var emptyState = document.getElementById('student-empty-state');
  var toolbar = document.querySelector('.student-toolbar');
  var printBtn = document.getElementById('btn-print');
  var fullscreenBtn = document.getElementById('btn-fullscreen');
  var saveResultBtn = document.getElementById('btn-save-result');
  var saveImageBtn = document.getElementById('btn-save-image');
  var loadResultBtn = document.getElementById('btn-load-result');
  var resultImportFile = document.getElementById('result-import-file');

  function updateEmptyState(data) {
    if (data.students.length === 0) {
      emptyState.style.display = 'block';
      container.style.display = 'none';
      drawBtn.style.display = 'none';
      toolbar.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      container.style.display = 'block';
    }
  }

  function showResultToolbar(visible) {
    toolbar.style.display = visible ? 'flex' : 'none';
  }

  function createRosterOrder(data) {
    var mapping = {};
    data.students.forEach(function(s, i) { mapping[i] = s; });
    return mapping;
  }

  function renderCurrent(animate) {
    var data = store.load();
    var assignment = (data.lastAssignment && data.lastAssignment.mapping) ? data.lastAssignment.mapping : null;
    renderSeatGrid(container, data, assignment, { animate: !!animate });
  }

  var data = store.load();
  updateEmptyState(data);

  if (data.students.length > 0) {
    store.update({ lastAssignment: null });
    var rosterOrder = createRosterOrder(data);
    renderSeatGrid(container, data, rosterOrder);
    drawBtn.style.display = 'inline-flex';
    redrawBtn.style.display = 'none';
    showResultToolbar(false);
  }

  // Draw seats
  function doDraw(isRedraw) {
    var current = store.load();
    if (current.students.length === 0) {
      showToast('\uD559\uC0DD \uBA85\uB2E8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uAD50\uC0AC \uC124\uC815\uC5D0\uC11C \uBA85\uB2E8\uC744 \uC785\uB825\uD558\uC138\uC694.', 'warning');
      return;
    }

    var totalSeats2 = getTotalSeatsForLayout(current);
    if (current.students.length > totalSeats2) {
      showToast('\uD559\uC0DD \uC218(' + current.students.length + '\uBA85)\uAC00 \uC88C\uC11D \uC218(' + totalSeats2 + '\uC11D)\uBCF4\uB2E4 \uB9CE\uC2B5\uB2C8\uB2E4.', 'error');
      return;
    }

    if (isRedraw) {
      showConfirm('\uD604\uC7AC \uC790\uB9AC \uBC30\uCE58 \uACB0\uACFC\uAC00 \uC0AC\uB77C\uC9D1\uB2C8\uB2E4.\n\uC815\uB9D0 \uB2E4\uC2DC \uBF51\uC73C\uC2DC\uACA0\uC5B4\uC694?').then(function(confirmed) {
        if (!confirmed) return;
        performDraw(current);
      });
    } else {
      performDraw(current);
    }
  }

  function performDraw(current) {
    drawBtn.disabled = true;
    redrawBtn.disabled = true;
    drawBtn.classList.add('loading');

    slotAnimation(container, current).then(function() {
      var result = randomizeSeats(current);
      if (!result) {
        showToast('\uC790\uB9AC \uBC30\uCE58\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC870\uAC74\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.', 'error', 3500);
        drawBtn.disabled = false;
        redrawBtn.disabled = false;
        drawBtn.classList.remove('loading');
        return;
      }

      // Save history
      var prevAssignment = current.lastAssignment;
      var historyUpdate = {};
      if (prevAssignment && prevAssignment.mapping) {
        var history = (current.assignmentHistory || []).slice();
        history.push({
          mapping: prevAssignment.mapping,
          timestamp: prevAssignment.timestamp,
          date: new Date(prevAssignment.timestamp).toISOString().slice(0, 10)
        });
        while (history.length > 5) history.shift();
        historyUpdate.assignmentHistory = history;
      }

      var historyFallback = result._historyFallback;
      if (historyFallback) delete result._historyFallback;

      store.update(Object.assign({ lastAssignment: { mapping: result, timestamp: Date.now() } }, historyUpdate));

      renderSeatGrid(container, current, result, { animate: true });

      drawBtn.style.display = 'none';
      redrawBtn.style.display = 'inline-flex';
      drawBtn.disabled = false;
      redrawBtn.disabled = false;
      drawBtn.classList.remove('loading');
      showResultToolbar(true);

      var violations = verifyAssignment(result, current);
      if (violations.length > 0) {
        showToast('\uADDC\uCE59 \uC704\uBC18 ' + violations.length + '\uAC74 \uBC1C\uACAC', 'error', 4000);
      } else if (historyFallback) {
        showToast('\uC774\uC804 \uC790\uB9AC\uB97C \uC644\uC804\uD788 \uD53C\uD560 \uC218 \uC5C6\uC5B4 \uC77C\uBD80 \uC911\uBCF5\uC774 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.', 'warning', 4000);
      } else {
        showToast('\uC790\uB9AC \uBC30\uCE58 \uC644\uB8CC!', 'success');
      }
    });
  }

  drawBtn.addEventListener('click', function() { doDraw(false); });
  redrawBtn.addEventListener('click', function() { doDraw(true); });

  // Save result JSON
  saveResultBtn.addEventListener('click', function() {
    var current = store.load();
    if (!current.lastAssignment) {
      showToast('\uC800\uC7A5\uD560 \uBC30\uCE58 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.', 'warning');
      return;
    }

    var exportData = {
      version: 1,
      type: 'seat-result',
      timestamp: current.lastAssignment.timestamp,
      date: new Date(current.lastAssignment.timestamp).toISOString().slice(0, 10),
      students: current.students,
      layoutType: current.layoutType,
      layoutSettings: current.layoutSettings,
      fixedSeats: current.fixedSeats,
      separationRules: current.separationRules,
      assignment: current.lastAssignment.mapping
    };

    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '\uC790\uB9AC\uBC30\uCE58_\uACB0\uACFC_' + exportData.date + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('\uACB0\uACFC\uB97C JSON \uD30C\uC77C\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.', 'success');
  });

  // Save image
  saveImageBtn.addEventListener('click', function() {
    var current = store.load();
    if (!current.lastAssignment) {
      showToast('\uC800\uC7A5\uD560 \uBC30\uCE58 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.', 'warning');
      return;
    }

    try {
      renderToCanvas(container, current).then(function(canvas) {
        canvas.toBlob(function(blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          var dateStr = new Date().toISOString().slice(0, 10);
          a.download = '\uC790\uB9AC\uBC30\uCE58_' + dateStr + '.png';
          a.click();
          URL.revokeObjectURL(url);
          showToast('\uC774\uBBF8\uC9C0\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.', 'success');
        }, 'image/png');
      });
    } catch(err) {
      showToast('\uC774\uBBF8\uC9C0 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.', 'error');
    }
  });

  // Load result
  loadResultBtn.addEventListener('click', function() { resultImportFile.click(); });
  resultImportFile.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var imported = JSON.parse(reader.result);

        if (imported.type !== 'seat-result' || !imported.assignment) {
          showToast('\uC62C\uBC14\uB978 \uC790\uB9AC \uBC30\uCE58 \uACB0\uACFC \uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4.', 'error');
          return;
        }

        store.update({
          students: imported.students || [],
          classSize: (imported.students || []).length,
          layoutType: imported.layoutType || 'exam',
          layoutSettings: imported.layoutSettings || { columns: 6, rows: 5, customDesks: [] },
          fixedSeats: imported.fixedSeats || [],
          separationRules: imported.separationRules || [],
          lastAssignment: {
            mapping: imported.assignment,
            timestamp: imported.timestamp || Date.now()
          }
        });

        var dateStr = imported.date || '(\uC54C \uC218 \uC5C6\uC74C)';
        showToast(dateStr + ' \uC790\uB9AC \uBC30\uCE58\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.', 'success');

        renderCurrent(true);
        drawBtn.style.display = 'none';
        redrawBtn.style.display = 'inline-flex';
        showResultToolbar(true);
        updateEmptyState(store.load());
      } catch(ex) {
        showToast('\uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Print
  printBtn.addEventListener('click', function() {
    window.print();
  });

  // Fullscreen
  fullscreenBtn.addEventListener('click', function() {
    var screen = document.getElementById('student-screen');
    if (!document.fullscreenElement) {
      screen.requestFullscreen().catch(function() {
        screen.classList.toggle('fullscreen');
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', function() {
    var screen = document.getElementById('student-screen');
    if (document.fullscreenElement) {
      fullscreenBtn.textContent = '\u26F6 \uC804\uCCB4 \uD654\uBA74 \uC885\uB8CC';
    } else {
      fullscreenBtn.textContent = '\u26F6 \uC804\uCCB4 \uD654\uBA74';
      screen.classList.remove('fullscreen');
    }
  });

  // Tab sync
  store.initSync(function() {
    var d = store.load();
    updateEmptyState(d);
    if (d.students.length === 0) return;

    var rosterOrder = createRosterOrder(d);
    renderSeatGrid(container, d, rosterOrder);
    drawBtn.style.display = 'inline-flex';
    redrawBtn.style.display = 'none';
    showResultToolbar(false);
  });
}

// Slot machine animation
function slotAnimation(container, data) {
  return new Promise(function(resolve) {
    var seats = container.querySelectorAll('.seat');
    var names = data.students;
    if (seats.length === 0 || names.length === 0) {
      resolve();
      return;
    }

    var frame = 0;
    var totalFrames = 15;
    var interval = setInterval(function() {
      seats.forEach(function(seat) {
        var nameEl = seat.querySelector('.seat-name');
        if (nameEl) {
          nameEl.textContent = names[Math.floor(Math.random() * names.length)];
          nameEl.style.opacity = '0.6';
          seat.style.background = frame % 2 === 0 ? 'var(--seat-highlight)' : 'var(--seat-empty)';
        }
      });
      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        seats.forEach(function(seat) {
          var nameEl = seat.querySelector('.seat-name');
          if (nameEl) {
            nameEl.textContent = '';
            nameEl.style.opacity = '1';
          }
          seat.style.background = '';
        });
        setTimeout(resolve, 200);
      }
    }, 80);
  });
}

// Render to canvas for image export
function renderToCanvas(container) {
  return new Promise(function(resolve) {
    var gridEl = container.querySelector('.seat-grid, .pair-grid, .ushape-grid, [style*="position:relative"]');
    var blackboardEl = container.querySelector('.blackboard');

    var seats = container.querySelectorAll('.seat');
    if (seats.length === 0) {
      throw new Error('No seats');
    }

    var containerRect = container.getBoundingClientRect();
    var padding = 40;
    var titleHeight = 50;
    var canvasWidth = Math.max(containerRect.width + padding * 2, 600);
    var canvasHeight = containerRect.height + padding * 2 + titleHeight;

    var canvas = document.createElement('canvas');
    canvas.width = canvasWidth * 2;
    canvas.height = canvasHeight * 2;
    var ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    var dateStr = new Date().toLocaleDateString('ko-KR');
    ctx.fillText('\uC790\uB9AC \uBC30\uCE58 - ' + dateStr, canvasWidth / 2, 30);

    if (blackboardEl) {
      var bbRect = blackboardEl.getBoundingClientRect();
      var bbX = bbRect.left - containerRect.left + padding;
      var bbY = titleHeight;
      ctx.fillStyle = '#2D5016';
      bundleRoundRect(ctx, bbX, bbY, bbRect.width, bbRect.height, 4);
      ctx.fill();
      ctx.fillStyle = '#D1FAE5';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('\uCE60 \uD310', bbX + bbRect.width / 2, bbY + bbRect.height / 2 + 5);
    }

    seats.forEach(function(seat) {
      var seatRect = seat.getBoundingClientRect();
      var x = seatRect.left - containerRect.left + padding;
      var y = seatRect.top - containerRect.top + padding + titleHeight;

      var isAssigned = seat.classList.contains('assigned');
      var isFixed = seat.classList.contains('fixed');
      ctx.fillStyle = isFixed ? '#FEF3C7' : isAssigned ? '#D1FAE5' : '#F1F5F9';
      ctx.strokeStyle = isFixed ? '#FCD34D' : isAssigned ? '#6EE7B7' : '#E2E8F0';
      ctx.lineWidth = 1.5;
      bundleRoundRect(ctx, x, y, seatRect.width, seatRect.height, 6);
      ctx.fill();
      ctx.stroke();

      var numEl = seat.querySelector('.seat-number');
      if (numEl) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(numEl.textContent, x + 4, y + 12);
      }

      var nameEl = seat.querySelector('.seat-name');
      if (nameEl && nameEl.textContent) {
        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(nameEl.textContent, x + seatRect.width / 2, y + seatRect.height / 2 + 5);
      }
    });

    resolve(canvas);
  });
}

function bundleRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// === app.js ===
function route() {
  var hash = location.hash.replace('#', '') || 'teacher';
  var teacherEl = document.getElementById('teacher-screen');
  var studentEl = document.getElementById('student-screen');

  teacherEl.style.display = 'none';
  studentEl.style.display = 'none';

  if (hash === 'teacher') {
    teacherEl.style.display = 'block';
    initTeacherScreen();
  } else {
    studentEl.style.display = 'block';
    initStudentScreen();
  }
}

window.addEventListener('hashchange', function() {
  route();
});

route();

})();
