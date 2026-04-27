// localStorage 기반 데이터 저장소 (다반 관리 지원)
import { createDefaultData, validateStudents } from './models.js';

const CLASSES_KEY = 'seat-changer-classes';
const ACTIVE_KEY = 'seat-changer-active';
const DATA_PREFIX = 'seat-changer-data';
const MAX_CLASSES = 15;

let _cache = null;
const _listeners = [];

// Prototype pollution 방지: __proto__, constructor, prototype 키 재귀 제거
function sanitizeObj(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObj);
  const clean = Object.create(null);
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = sanitizeObj(obj[key]);
  }
  return clean;
}

function safeJSONParse(str) {
  return sanitizeObj(JSON.parse(str));
}

function getStorageKey(className) {
  return className ? `${DATA_PREFIX}-${className}` : DATA_PREFIX;
}

// 최초 실행 시 기존 데이터 마이그레이션
function migrateIfNeeded() {
  const classes = localStorage.getItem(CLASSES_KEY);
  if (classes) return; // 이미 마이그레이션됨

  const existingData = localStorage.getItem(DATA_PREFIX);
  const defaultClasses = ['1반'];
  localStorage.setItem(CLASSES_KEY, JSON.stringify(defaultClasses));
  localStorage.setItem(ACTIVE_KEY, '1반');
  if (existingData) {
    localStorage.setItem(getStorageKey('1반'), existingData);
  }
}

// 초기화
migrateIfNeeded();

export const store = {
  // === 반 관리 ===
  getClassList() {
    try {
      const list = JSON.parse(localStorage.getItem(CLASSES_KEY));
      if (!Array.isArray(list)) return ['1반'];
      return list.filter(x => typeof x === 'string' && x.length > 0 && x.length <= 50).slice(0, MAX_CLASSES) || ['1반'];
    } catch {
      return ['1반'];
    }
  },

  getActiveClass() {
    return localStorage.getItem(ACTIVE_KEY) || this.getClassList()[0] || '1반';
  },

  addClass(name) {
    const classes = this.getClassList();
    if (classes.length >= MAX_CLASSES) return false;
    if (classes.includes(name)) return false;
    if (!name || name.trim().length === 0) return false;
    classes.push(name.trim());
    localStorage.setItem(CLASSES_KEY, JSON.stringify(classes));
    // 새 반에 기본 데이터 생성
    localStorage.setItem(getStorageKey(name.trim()), JSON.stringify(createDefaultData()));
    return true;
  },

  renameClass(oldName, newName) {
    if (!newName || newName.trim().length === 0) return false;
    newName = newName.trim();
    const classes = this.getClassList();
    const idx = classes.indexOf(oldName);
    if (idx === -1) return false;
    if (oldName !== newName && classes.includes(newName)) return false;

    // 데이터 이전
    const data = localStorage.getItem(getStorageKey(oldName));
    localStorage.setItem(getStorageKey(newName), data || JSON.stringify(createDefaultData()));
    if (oldName !== newName) {
      localStorage.removeItem(getStorageKey(oldName));
    }

    classes[idx] = newName;
    localStorage.setItem(CLASSES_KEY, JSON.stringify(classes));

    if (this.getActiveClass() === oldName) {
      localStorage.setItem(ACTIVE_KEY, newName);
    }
    return true;
  },

  removeClass(name) {
    const classes = this.getClassList();
    if (classes.length <= 1) return false; // 최소 1개 반 유지
    const idx = classes.indexOf(name);
    if (idx === -1) return false;

    classes.splice(idx, 1);
    localStorage.setItem(CLASSES_KEY, JSON.stringify(classes));
    localStorage.removeItem(getStorageKey(name));

    if (this.getActiveClass() === name) {
      localStorage.setItem(ACTIVE_KEY, classes[0]);
      _cache = null;
    }
    return true;
  },

  switchClass(name) {
    const classes = this.getClassList();
    if (!classes.includes(name)) return false;
    localStorage.setItem(ACTIVE_KEY, name);
    _cache = null; // 캐시 무효화
    return true;
  },

  duplicateClass(srcName, newName) {
    if (!this.addClass(newName)) return false;
    const srcData = localStorage.getItem(getStorageKey(srcName));
    if (srcData) {
      localStorage.setItem(getStorageKey(newName), srcData);
    }
    return true;
  },

  // === 데이터 관리 ===
  load() {
    if (_cache) return _cache;
    const key = getStorageKey(this.getActiveClass());
    try {
      const raw = localStorage.getItem(key);
      _cache = raw ? { ...createDefaultData(), ...safeJSONParse(raw) } : createDefaultData();
    } catch {
      _cache = createDefaultData();
    }
    return _cache;
  },

  save(data) {
    _cache = { ...data };
    const key = getStorageKey(this.getActiveClass());
    localStorage.setItem(key, JSON.stringify(_cache));
    _listeners.forEach(fn => fn(_cache));
  },

  update(partial) {
    const current = this.load();
    this.save({ ...current, ...partial });
  },

  onChange(fn) {
    _listeners.push(fn);
  },

  exportJSON() {
    return JSON.stringify(this.load(), null, 2);
  },

  importJSON(json) {
    try {
      const parsed = safeJSONParse(json);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
      const defaults = createDefaultData();
      const validLayouts = ['exam', 'pair', 'ushape', 'custom', 'group'];
      const data = {
        students: validateStudents(parsed.students || []),
        classSize: 0,
        layoutType: validLayouts.includes(parsed.layoutType) ? parsed.layoutType : defaults.layoutType,
        layoutSettings: {
          columns: Math.max(1, Math.min(12, parseInt(parsed.layoutSettings?.columns) || defaults.layoutSettings.columns)),
          rows: Math.max(1, Math.min(12, parseInt(parsed.layoutSettings?.rows) || defaults.layoutSettings.rows)),
          customDesks: Array.isArray(parsed.layoutSettings?.customDesks) ? parsed.layoutSettings.customDesks.slice(0, 200) : [],
          groupSize: Math.max(2, Math.min(8, parseInt(parsed.layoutSettings?.groupSize) || defaults.layoutSettings.groupSize)),
          groupCount: Math.max(0, Math.min(20, parseInt(parsed.layoutSettings?.groupCount) || 0)),
          groupSizes: Array.isArray(parsed.layoutSettings?.groupSizes)
            ? parsed.layoutSettings.groupSizes
                .map(n => Math.max(1, Math.min(8, parseInt(n) || defaults.layoutSettings.groupSize)))
                .slice(0, 20)
            : [],
          groupLayoutMode: parsed.layoutSettings?.groupLayoutMode || 'auto',
          groupDesks: Array.isArray(parsed.layoutSettings?.groupDesks) ? parsed.layoutSettings.groupDesks.slice(0, 200) : [],
          groupPositions: Array.isArray(parsed.layoutSettings?.groupPositions) ? parsed.layoutSettings.groupPositions.slice(0, 50) : undefined,
          disabledSeats: Array.isArray(parsed.layoutSettings?.disabledSeats)
            ? parsed.layoutSettings.disabledSeats
                .filter(n => Number.isInteger(n) && n >= 0 && n < 1000)
                .slice(0, 200)
            : []
        },
        fixedSeats: Array.isArray(parsed.fixedSeats) ? parsed.fixedSeats.slice(0, 100) : [],
        separationRules: Array.isArray(parsed.separationRules) ? parsed.separationRules.slice(0, 50) : [],
        lastAssignment: null,
        studentGenders: (typeof parsed.studentGenders === 'object' && parsed.studentGenders) ? parsed.studentGenders : {},
        genderRule: ['none','same','mixed','mixedFirst'].includes(parsed.genderRule) ? parsed.genderRule : 'none',
        assignmentHistory: Array.isArray(parsed.assignmentHistory) ? parsed.assignmentHistory.slice(0, 10) : [],
        historyExcludeCount: [1,2,3].includes(parsed.historyExcludeCount) ? parsed.historyExcludeCount : 1,
        useHistoryExclusion: parsed.useHistoryExclusion !== false,
        viewPerspective: ['student','teacher'].includes(parsed.viewPerspective) ? parsed.viewPerspective : 'student',
        groupHistory: Array.isArray(parsed.groupHistory) ? parsed.groupHistory.slice(0, 10) : [],
        useGroupExclusion: parsed.useGroupExclusion !== false,
        groupExcludeCount: [1,2,3].includes(parsed.groupExcludeCount) ? parsed.groupExcludeCount : 1
      };
      data.classSize = data.students.length;
      this.save(data);
      return true;
    } catch {
      return false;
    }
  },

  // 탭 간 동기화 (중복 등록 방지)
  _syncHandler: null,
  initSync(callback) {
    if (this._syncHandler) {
      window.removeEventListener('storage', this._syncHandler);
    }
    this._syncHandler = (e) => {
      const activeKey = getStorageKey(this.getActiveClass());
      if (e.key === activeKey) {
        _cache = null;
        const data = this.load();
        callback(data);
      }
    };
    window.addEventListener('storage', this._syncHandler);
  }
};
