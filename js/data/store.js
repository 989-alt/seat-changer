// localStorage 기반 데이터 저장소
import { createDefaultData, validateStudents } from './models.js';

const STORAGE_KEY = 'seat-changer-data';

let _cache = null;
const _listeners = [];

export const store = {
  load() {
    if (_cache) return _cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _cache = raw ? { ...createDefaultData(), ...JSON.parse(raw) } : createDefaultData();
    } catch {
      _cache = createDefaultData();
    }
    return _cache;
  },

  save(data) {
    _cache = { ...data };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
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
      const parsed = JSON.parse(json);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
      const defaults = createDefaultData();
      const data = {
        students: validateStudents(parsed.students || []),
        classSize: 0,
        layoutType: ['exam','pair','ushape','custom'].includes(parsed.layoutType) ? parsed.layoutType : defaults.layoutType,
        layoutSettings: { ...defaults.layoutSettings, ...(parsed.layoutSettings || {}) },
        fixedSeats: Array.isArray(parsed.fixedSeats) ? parsed.fixedSeats : [],
        separationRules: Array.isArray(parsed.separationRules) ? parsed.separationRules : [],
        lastAssignment: null,
        studentGenders: (typeof parsed.studentGenders === 'object' && parsed.studentGenders) ? parsed.studentGenders : {},
        genderRule: ['none','same','mixed'].includes(parsed.genderRule) ? parsed.genderRule : 'none',
        assignmentHistory: Array.isArray(parsed.assignmentHistory) ? parsed.assignmentHistory : [],
        historyExcludeCount: [1,2,3].includes(parsed.historyExcludeCount) ? parsed.historyExcludeCount : 1,
        useHistoryExclusion: parsed.useHistoryExclusion !== false,
        viewPerspective: ['student','teacher'].includes(parsed.viewPerspective) ? parsed.viewPerspective : 'student'
      };
      data.classSize = data.students.length;
      this.save(data);
      return true;
    } catch {
      return false;
    }
  },

  // 탭 간 동기화
  initSync(callback) {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        _cache = null; // invalidate cache
        const data = this.load();
        callback(data);
      }
    });
  }
};
