// ============================================================
// 자리바꾸기 - 번들 (file:// 호환)
// 자동 생성됨 - 직접 수정하지 마세요
// ============================================================
(function() {
'use strict';

// === data/models.js ===
// 데이터 모델 및 검증

function createDefaultData() {
  return {
    students: [],
    classSize: 0,
    layoutType: 'exam',
    layoutSettings: {
      columns: 6,
      rows: 5,
      customDesks: [],
      groupSize: 4,
      groupLayoutMode: 'auto',
      groupDesks: []
    },
    fixedSeats: [],
    separationRules: [],
    lastAssignment: null,
    studentGenders: {},
    genderRule: 'none',
    assignmentHistory: [],
    historyExcludeCount: 1,
    useHistoryExclusion: true,
    viewPerspective: 'student',
    groupHistory: [],
    useGroupExclusion: true,
    groupExcludeCount: 1
  };
}

function validateStudents(students) {
  if (!Array.isArray(students)) return [];
  return students
    .filter(s => typeof s === 'string')
    .map(s => s.trim().replace(/[<>"'&]/g, '').slice(0, 50))
    .filter(s => s.length > 0)
    .slice(0, 100);
}

function validateFixedSeat(fixedSeat, students, totalSeats) {
  if (!fixedSeat || typeof fixedSeat !== 'object') return false;
  if (typeof fixedSeat.studentName !== 'string' || !fixedSeat.studentName) return false;
  if (typeof fixedSeat.seatIndex !== 'number' || !Number.isInteger(fixedSeat.seatIndex)) return false;
  if (!students.includes(fixedSeat.studentName)) return false;
  if (fixedSeat.seatIndex < 0 || fixedSeat.seatIndex >= totalSeats) return false;
  return true;
}

function validateSeparationRule(rule, students) {
  if (!rule || typeof rule !== 'object') return false;
  if (typeof rule.studentA !== 'string' || typeof rule.studentB !== 'string') return false;
  if (!rule.studentA || !rule.studentB) return false;
  if (rule.studentA === rule.studentB) return false;
  if (!students.includes(rule.studentA) || !students.includes(rule.studentB)) return false;
  if (typeof rule.minDistance !== 'number' || rule.minDistance < 1 || rule.minDistance > 5) return false;
  return true;
}

function getTotalSeats(data) {
  if (data.layoutType === 'custom') {
    return data.layoutSettings.customDesks.length;
  }
  if (data.layoutType === 'group') {
    if (data.layoutSettings.groupPositions && data.layoutSettings.groupPositions.length > 0) {
      const groupSize = data.layoutSettings.groupSize || 4;
      return data.layoutSettings.groupPositions.length * groupSize;
    }
    const groupSize = data.layoutSettings.groupSize || 4;
    const cols = data.layoutSettings.columns || 6;
    const rows = data.layoutSettings.rows || 5;
    return cols * rows;
  }
  return data.layoutSettings.columns * data.layoutSettings.rows;
}

// === data/store.js ===
// localStorage 기반 데이터 저장소 (다반 관리 지원)

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

const store = {
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
          groupSize: Math.max(3, Math.min(8, parseInt(parsed.layoutSettings?.groupSize) || defaults.layoutSettings.groupSize)),
          groupLayoutMode: parsed.layoutSettings?.groupLayoutMode || 'auto',
          groupDesks: Array.isArray(parsed.layoutSettings?.groupDesks) ? parsed.layoutSettings.groupDesks.slice(0, 200) : [],
          groupPositions: Array.isArray(parsed.layoutSettings?.groupPositions) ? parsed.layoutSettings.groupPositions.slice(0, 50) : undefined
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

// === utils/toast.js ===
// Toast 알림 & Confirm 모달 유틸리티

/**
 * Toast 알림 표시
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration ms
 */
function showToast(message, type = 'success', duration = 2500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icons[type] || '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);

  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, duration);
}

/**
 * 모달 포커스 트랩: Tab 키가 모달 내부에서만 순환
 * @returns {Function} cleanup - 해제 함수
 */
function trapFocus(container) {
  const focusable = container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return () => {};
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  container.addEventListener('keydown', handler);
  first.focus();
  return () => container.removeEventListener('keydown', handler);
}

/**
 * 확인 모달 표시
 * @param {string} message
 * @returns {Promise<boolean>}
 */
function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-modal');
    const msgEl = overlay.querySelector('.confirm-message');
    const yesBtn = overlay.querySelector('.confirm-yes');
    const noBtn = overlay.querySelector('.confirm-no');

    msgEl.textContent = message;
    overlay.classList.add('active');

    const prevFocus = document.activeElement;
    const releaseTrap = trapFocus(overlay);

    function cleanup(result) {
      releaseTrap();
      overlay.classList.remove('active');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      overlay.removeEventListener('click', onOverlay);
      overlay.removeEventListener('keydown', onEsc);
      if (prevFocus) prevFocus.focus();
      resolve(result);
    }

    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onOverlay(e) {
      if (e.target === overlay) cleanup(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') cleanup(false);
    }

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    overlay.addEventListener('click', onOverlay);
    overlay.addEventListener('keydown', onEsc);
  });
}

// === utils/roster-parser.js ===
// 학급 명부 파일 파서 (CSV, XML, HWPX, HWP)

async function parseRosterFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCSV(file);
  } else if (name.endsWith('.xml')) {
    return parseXML(file);
  } else if (name.endsWith('.hwpx')) {
    return parseHWPX(file);
  } else if (name.endsWith('.hwp')) {
    return parseHWP(file);
  }
  throw new Error('지원하지 않는 파일 형식입니다. (CSV, XML, HWP, HWPX)');
}

// === CSV / TSV 파서 ===
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        // 구분자 자동 판별
        const firstLine = text.split('\n')[0] || '';
        const delimiter = firstLine.includes('\t') ? '\t' : ',';

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) { reject(new Error('빈 파일입니다.')); return; }

        // 헤더 감지: 첫 행에 이름/성명/학생/번호 등의 키워드가 있으면 헤더로 판단
        const headerKeywords = ['이름', '성명', '학생', 'name', '번호', '학번', '반'];
        const firstRow = lines[0].toLowerCase();
        const hasHeader = headerKeywords.some(k => firstRow.includes(k));
        const startIdx = hasHeader ? 1 : 0;

        // 이름 열 찾기 (헤더가 있는 경우)
        let nameColIdx = 0;
        if (hasHeader) {
          const headers = lines[0].split(delimiter).map(h => h.trim());
          const nameIdx = headers.findIndex(h => {
            const lower = h.toLowerCase();
            return lower.includes('이름') || lower.includes('성명') || lower === 'name';
          });
          if (nameIdx >= 0) nameColIdx = nameIdx;
        }

        const names = [];
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
          const name = cols[nameColIdx];
          if (name && name.length > 0 && name.length <= 50) {
            names.push(name);
          }
        }

        if (names.length === 0) { reject(new Error('이름을 찾을 수 없습니다.')); return; }
        resolve(names);
      } catch (e) {
        reject(new Error('CSV 파싱 실패: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file, 'UTF-8');
  });
}

// === XML 파서 ===
function parseXML(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(reader.result, 'text/xml');

        // 다양한 태그 이름으로 이름 검색
        const nameSelectors = ['name', 'Name', '이름', '성명', 'student', 'Student', '학생'];
        let names = [];

        for (const tag of nameSelectors) {
          const elements = doc.getElementsByTagName(tag);
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const text = elements[i].textContent.trim();
              if (text.length > 0 && text.length <= 50) {
                names.push(text);
              }
            }
            break;
          }
        }

        // 태그로 못 찾으면 속성에서 검색
        if (names.length === 0) {
          const allElements = doc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            for (const attr of ['name', 'Name', '이름', '성명']) {
              const val = el.getAttribute(attr);
              if (val && val.trim().length > 0 && val.trim().length <= 50) {
                names.push(val.trim());
              }
            }
          }
        }

        if (names.length === 0) { reject(new Error('XML에서 이름을 찾을 수 없습니다.')); return; }
        resolve(names);
      } catch (e) {
        reject(new Error('XML 파싱 실패: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file, 'UTF-8');
  });
}

// === HWPX 파서 (ZIP 기반) ===
async function parseHWPX(file) {
  if (typeof JSZip === 'undefined') {
    throw new Error('HWPX 파서를 로드할 수 없습니다. 인터넷 연결을 확인하세요.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // HWPX 구조: Contents/section0.xml, section1.xml ...
  const names = [];
  const sectionFiles = Object.keys(zip.files).filter(f =>
    f.startsWith('Contents/section') && f.endsWith('.xml')
  ).sort();

  for (const sectionFile of sectionFiles) {
    const xml = await zip.files[sectionFile].async('string');
    // HWPX XML에서 텍스트 추출
    const textMatches = xml.match(/<hp:t[^>]*>([^<]+)<\/hp:t>/g);
    if (textMatches) {
      for (const match of textMatches) {
        const text = match.replace(/<[^>]+>/g, '').trim();
        // 이름처럼 보이는 텍스트 (2~5글자 한글)
        if (text.length >= 2 && text.length <= 10 && /^[가-힣]+$/.test(text)) {
          names.push(text);
        }
      }
    }
  }

  if (names.length === 0) {
    // 폴백: 모든 텍스트에서 한글 이름 패턴 추출
    for (const sectionFile of sectionFiles) {
      const xml = await zip.files[sectionFile].async('string');
      const allText = xml.replace(/<[^>]+>/g, ' ');
      const koreanNames = allText.match(/[가-힣]{2,5}/g) || [];
      // 일반적인 단어 필터링 (간단한 휴리스틱)
      const commonWords = ['프로젝트', '학습', '목표', '내용', '활동', '수업', '학생', '선생님', '지도', '강사', '기간', '주제', '수업기간', '지도강사'];
      for (const name of koreanNames) {
        if (!commonWords.includes(name) && name.length >= 2 && name.length <= 5) {
          names.push(name);
        }
      }
    }
  }

  // 중복 제거
  const unique = [...new Set(names)];
  if (unique.length === 0) {
    throw new Error('HWPX에서 이름을 찾을 수 없습니다. CSV 형식을 사용해보세요.');
  }
  return unique;
}

// === HWP 파서 (OLE 바이너리) ===
async function parseHWP(file) {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // OLE 매직넘버 확인
  if (data[0] !== 0xD0 || data[1] !== 0xCF || data[2] !== 0x11 || data[3] !== 0xE0) {
    throw new Error('올바른 HWP 파일이 아닙니다.');
  }

  try {
    // OLE Compound Document 파싱
    const ole = parseOLE(data);
    const prvTextStream = ole.getStream('PrvText');

    if (prvTextStream) {
      // PrvText: UTF-16LE 인코딩된 미리보기 텍스트
      const text = decodeUTF16LE(prvTextStream);
      const koreanNames = text.match(/[가-힣]{2,5}/g) || [];
      const commonWords = ['프로젝트', '학습', '목표', '내용', '활동', '수업', '학생', '선생님', '지도', '강사', '기간', '주제'];
      const names = koreanNames.filter(n => !commonWords.includes(n) && n.length >= 2 && n.length <= 5);
      const unique = [...new Set(names)];

      if (unique.length > 0) return unique;
    }

    throw new Error('HWP에서 이름을 추출할 수 없습니다. CSV 형식을 사용해보세요.');
  } catch (e) {
    if (e.message.includes('CSV')) throw e;
    throw new Error('HWP 파싱 실패: ' + e.message + '. CSV 형식을 사용해보세요.');
  }
}

// === OLE 간이 파서 ===
function parseOLE(data) {
  const view = new DataView(data.buffer);
  const sectorSize = 1 << view.getUint16(30, true);
  const fatSectors = view.getInt32(44, true);
  const dirStart = view.getInt32(48, true);
  const miniFatStart = view.getInt32(60, true);
  const difatStart = view.getInt32(68, true);

  // FAT 읽기
  const fatSectorList = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getInt32(76 + i * 4, true);
    if (s >= 0) fatSectorList.push(s);
  }

  const fat = [];
  for (const s of fatSectorList) {
    const offset = (s + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(view.getInt32(offset + i * 4, true));
    }
  }

  function getSectorChain(start) {
    const chain = [];
    let current = start;
    const visited = new Set();
    while (current >= 0 && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      current = fat[current] !== undefined ? fat[current] : -1;
    }
    return chain;
  }

  function readStream(start, size) {
    const chain = getSectorChain(start);
    const result = new Uint8Array(size);
    let pos = 0;
    for (const sector of chain) {
      const offset = (sector + 1) * sectorSize;
      const remaining = size - pos;
      const toCopy = Math.min(remaining, sectorSize);
      result.set(data.slice(offset, offset + toCopy), pos);
      pos += toCopy;
      if (pos >= size) break;
    }
    return result;
  }

  // 디렉토리 읽기
  const dirChain = getSectorChain(dirStart);
  const entries = [];
  for (const sector of dirChain) {
    const offset = (sector + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 128; i++) {
      const entryOffset = offset + i * 128;
      const nameLen = view.getUint16(entryOffset + 64, true);
      if (nameLen === 0) continue;

      let name = '';
      for (let j = 0; j < (nameLen - 2) / 2; j++) {
        name += String.fromCharCode(view.getUint16(entryOffset + j * 2, true));
      }

      const type = data[entryOffset + 66];
      const startSector = view.getInt32(entryOffset + 116, true);
      const size = view.getUint32(entryOffset + 120, true);

      entries.push({ name, type, startSector, size });
    }
  }

  return {
    getStream(name) {
      const entry = entries.find(e => e.name === name);
      if (!entry || entry.startSector < 0) return null;
      return readStream(entry.startSector, entry.size);
    }
  };
}

function decodeUTF16LE(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 0) continue;
    if (code >= 0xD800 && code <= 0xDFFF) continue; // surrogate
    result += String.fromCharCode(code);
  }
  return result;
}

// === layouts/layout-engine.js ===
// 레이아웃 추상 인터페이스
// 각 레이아웃은 { getSeatCount(), getSeatPositions(), render(container, assignment, options) } 를 구현

/**
 * @typedef {Object} SeatPosition
 * @property {number} index - 자리 번호 (0-based)
 * @property {number} row - 행 (0-based)
 * @property {number} col - 열 (0-based)
 */

/**
 * Manhattan distance (가로·세로 칸 수 합)
 * 대각선은 2칸으로 계산
 */
function manhattanDistance(pos1, pos2) {
  return Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// === layouts/exam-layout.js ===
// 시험대형: 개별 책상 그리드

const examLayout = {
  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        positions.push({ index: r * columns + c, row: r, col: c });
      }
    }
    return positions;
  },

  getSeatCount(settings) {
    return settings.columns * settings.rows;
  },

  distance(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
  },

  render(container, settings, assignment, options = {}) {
    const { columns, rows } = settings;
    const positions = this.getSeatPositions(settings);
    const tv = options.teacherView;

    // teacherView: 행 역순, 열 역순 → 교탁에서 바라보는 배치
    const ordered = tv ? [...positions].sort((a, b) => {
      if (a.row !== b.row) return b.row - a.row;
      return b.col - a.col;
    }) : positions;

    let html = tv
      ? ''
      : '<div class="blackboard">칠  판</div>';

    html += `<div class="seat-grid" style="grid-template-columns: repeat(${columns}, auto);">`;

    let animIdx = 0;
    for (const pos of ordered) {
      const name = assignment ? assignment[pos.index] : null;
      const cls = name ? 'seat assigned' : 'seat empty';
      const extraCls = options.highlightSeat === pos.index ? ' highlight' : '';
      const revealCls = options.animate ? ' reveal' : '';
      const delay = options.animate ? `animation-delay: ${animIdx * 60}ms` : '';
      const safeName = escapeHTML(name);
      const label = name ? `${pos.index + 1}번 자리: ${safeName}` : `${pos.index + 1}번 자리 (비어있음)`;

      html += `<div class="${cls}${extraCls}${revealCls}" data-seat="${pos.index}" style="${delay}"
        tabindex="0" role="button" aria-label="${label}">
        <span class="seat-number">${pos.index + 1}</span>
        <span class="seat-name">${safeName}</span>
      </div>`;
      animIdx++;
    }

    html += '</div>';
    if (tv) html += '<div class="blackboard podium">교  탁</div>';
    container.innerHTML = html;
  }
};

// === layouts/pair-layout.js ===
// 짝대형: 2인 1조 그리드

const pairLayout = {
  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        positions.push({ index: r * columns + c, row: r, col: c });
      }
    }
    return positions;
  },

  getSeatCount(settings) {
    return settings.columns * settings.rows;
  },

  distance(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
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

    let animIdx = 0;
    for (const r of rowOrder) {
      for (const pc of pcOrder) {
        html += '<div class="seat-pair-group">';
        const innerOrder = tv ? [1, 0] : [0, 1];
        for (const i of innerOrder) {
          const c = pc * 2 + i;
          if (c >= columns) continue;
          const idx = r * columns + c;
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

// === layouts/ushape-layout.js ===
// U대형 레이아웃

const ushapeLayout = {
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
    const tv = options.teacherView;

    const topSeats = positions.filter(p => p.row === 0);
    const leftSeats = positions.filter(p => p.row > 0 && p.col === 0);
    const rightSeats = positions.filter(p => p.row > 0 && p.col === columns - 1);

    let animIdx = 0;
    function renderSeat(pos) {
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

// === layouts/custom-layout.js ===
// 자유배치: DOM 기반 드래그앤드롭 + 스냅/선택/Undo

const DESK_W = 60;
const DESK_H = 40;
const GRID_SIZE = 20;
const MAX_HISTORY = 50;

const customLayout = {
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

  init(canvas, desks, onUpdate) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._desks = desks.map((d, i) => ({ ...d, id: d.id ?? i }));
    this._onUpdate = onUpdate;
    this._selected = null;
    this._history = [];
    this._redoStack = [];
    this._bindEvents();
    this._fitCanvas();
    this._pushHistory();
    this._draw();
  },

  // --- Snap to grid ---
  _snap(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  },

  // --- Fit canvas to container (no ResizeObserver) ---
  _fitCanvas() {
    const canvas = this._canvas;
    // Read CSS-laid-out width (canvas has width:100% in CSS)
    const w = canvas.clientWidth || 560;
    const dpr = window.devicePixelRatio || 1;
    const h = Math.max(300, Math.min(500, Math.floor(w * 0.65)));

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
    // 그리드 스냅 단위(GRID_SIZE=20)로 정규화하여
    // 인접 판단이 정확하도록 함 (픽셀 좌표 직접 나누기 → 충돌 문제 해결)
    const unit = GRID_SIZE || 20;
    return desks.map((d, i) => ({
      index: i,
      row: Math.round(d.y / (DESK_H + unit)),
      col: Math.round(d.x / (DESK_W + unit))
    }));
  },

  getSeatCount(settings) {
    return (settings.customDesks || []).length;
  },

  distance(pos1, pos2) {
    return manhattanDistance(pos1, pos2);
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
        // Click without drag = select
        this._selected = this._selected === idx ? null : idx;
        this._draw();
        this._updateToolbarState();
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

// === layouts/group-layout.js ===
// 모둠대형: N명씩 클러스터 배치 (자동 배치 + 드래그 미세조정)

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

const groupLayout = {
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

    // 캔버스 크기 계산 (교사: 64x48, 학생: 비례 확대)
    const baseSeatW = 64, baseSeatH = 48, baseGap = 4, basePad = 12;
    // 학생 화면(container가 student-grid 내부)이면 좌석이 CSS로 더 크므로 비례 스케일
    const isStudentView = container.classList.contains('student-grid') || container.closest('.student-grid');
    const scale = isStudentView ? 1.55 : 1;
    const seatW = Math.round(baseSeatW * scale);
    const seatH = Math.round(baseSeatH * scale);
    const seatGap = Math.round(baseGap * scale);
    const pad = Math.round(basePad * scale);

    const blockW = clusterCols * (seatW + seatGap) + pad;
    const blockH = getClusterDims(groupSize).rows * (seatH + seatGap) + Math.round(28 * scale);
    let maxX = Math.round(300 * scale), maxY = Math.round(200 * scale);
    positions.forEach(gp => {
      if (!gp) return;
      maxX = Math.max(maxX, Math.round(gp.x * scale) + blockW + 10);
      maxY = Math.max(maxY, Math.round(gp.y * scale) + blockH + 10);
    });

    let html = tv ? '' : '<div class="blackboard">칠  판</div>';
    html += '<div class="group-layout-canvas" style="position:relative; min-height:' + maxY + 'px; width:' + maxX + 'px; margin:0 auto;">';

    let animIdx = 0;
    const order = tv ? [...positions].reverse() : positions;

    for (const gp of order) {
      if (!gp) continue;
      const g = gp.groupIndex;
      const groupStart = g * groupSize;
      const scaledX = Math.round(gp.x * scale);
      const scaledY = Math.round(gp.y * scale);
      const displayX = tv ? (maxX - scaledX - blockW) : scaledX;
      const displayY = tv ? (maxY - scaledY - blockH) : scaledY;

      html += '<div class="group-cluster" data-group-index="' + g + '" style="position:absolute; left:' + displayX + 'px; top:' + displayY + 'px;">';
      html += '<div class="group-label">' + (g + 1) + '모둠</div>';
      html += '<div class="group-cluster-seats" style="display:grid; grid-template-columns:repeat(' + clusterCols + ',' + seatW + 'px); gap:' + seatGap + 'px;">';

      // 선생님 시선: 클러스터 내 좌석을 역순 렌더링 (좌우+상하 반전)
      const seatIndices = [];
      for (let s = 0; s < groupSize; s++) seatIndices.push(groupStart + s);
      if (tv) seatIndices.reverse();

      for (const idx of seatIndices) {
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
function enableGroupDrag(container, settings, onChange) {
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

// === components/seat-grid.js ===
// 자리 배치도 렌더링 컴포넌트

const layoutMap = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout,
  group: groupLayout
};

function getLayout(type) {
  return layoutMap[type] || examLayout;
}

/**
 * 배치도 렌더링
 * @param {HTMLElement} container
 * @param {Object} data - store data
 * @param {Object|null} assignment - { seatIndex: studentName }
 * @param {Object} options - { animate, highlightSeat, onSeatClick }
 */
function renderSeatGrid(container, data, assignment, options = {}) {
  const layout = getLayout(data.layoutType);
  layout.render(container, data.layoutSettings, assignment, {
    fixedSeats: data.fixedSeats,
    animate: options.animate,
    highlightSeat: options.highlightSeat,
    teacherView: options.teacherView
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
function getTotalSeatsForLayout(data) {
  const layout = getLayout(data.layoutType);
  return layout.getSeatCount(data.layoutSettings);
}

// === components/student-roster.js ===
// 학생 명단 입력 컴포넌트

function initRoster() {
  const textarea = document.getElementById('roster-input');
  const countEl = document.getElementById('student-count');
  const saveBtn = document.getElementById('btn-save-roster');
  const uploadBtn = document.getElementById('btn-upload-roster');
  const rosterFile = document.getElementById('roster-file');

  // 초기 로드
  const data = store.load();
  if (data.students.length > 0) {
    textarea.value = data.students.join('\n');
    countEl.textContent = `${data.students.length}명`;
  }

  // 실시간 카운트
  textarea.addEventListener('input', () => {
    const names = validateStudents(textarea.value.split('\n'));
    countEl.textContent = `${names.length}명`;
  });

  // === 파일 업로드 ===
  if (uploadBtn && rosterFile) {
    uploadBtn.addEventListener('click', () => rosterFile.click());
    rosterFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const names = await parseRosterFile(file);
        if (names.length > 0) {
          textarea.value = names.join('\n');
          countEl.textContent = `${names.length}명`;
          showToast(`${file.name}에서 ${names.length}명을 불러왔습니다. '명단 저장'을 눌러 적용하세요.`, 'success', 4000);
        }
      } catch (err) {
        showToast(err.message || '파일을 읽을 수 없습니다.', 'error', 3500);
      }

      e.target.value = '';
    });
  }

  // 성별 리스트 렌더링
  const genderListEl = document.getElementById('gender-list');

  function renderGenderList() {
    if (!genderListEl) return;
    const data = store.load();
    if (data.students.length === 0) {
      genderListEl.innerHTML = '';
      return;
    }
    const genders = data.studentGenders || {};
    let html = '<h3 class="gender-list-title">성별 지정</h3>';
    data.students.forEach((name, idx) => {
      const g = genders[name] || '';
      const safe = escapeHTML(name);
      html += `<div class="gender-row" data-student="${safe}" data-index="${idx}">
        <span class="gender-student-name">${safe}</span>
        <label class="gender-radio"><input type="radio" name="gender-${idx}" value="M" ${g === 'M' ? 'checked' : ''}> 남</label>
        <label class="gender-radio"><input type="radio" name="gender-${idx}" value="F" ${g === 'F' ? 'checked' : ''}> 녀</label>
        <label class="gender-radio"><input type="radio" name="gender-${idx}" value="" ${g === '' ? 'checked' : ''}> 미지정</label>
      </div>`;
    });
    genderListEl.innerHTML = html;

    // 성별 변경 이벤트
    genderListEl.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const d = store.load();
        const studentGenders = { ...(d.studentGenders || {}) };
        const idx = parseInt(radio.closest('.gender-row').dataset.index, 10);
        const studentName = d.students[idx];
        if (!studentName) return;
        if (radio.value) {
          studentGenders[studentName] = radio.value;
        } else {
          delete studentGenders[studentName];
        }
        store.update({ studentGenders });
      });
    });
  }

  // 저장
  saveBtn.addEventListener('click', () => {
    const names = validateStudents(textarea.value.split('\n'));

    if (names.length === 0) {
      showToast('학생 이름을 입력해 주세요.', 'warning');
      return;
    }

    // 중복 검사
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      showToast(`중복된 이름이 있습니다: ${[...new Set(duplicates)].join(', ')}`, 'warning', 3500);
    }

    const uniqueNames = [...new Set(names)];

    // 삭제된 학생의 성별 정보 정리
    const currentGenders = store.load().studentGenders || {};
    const cleanedGenders = {};
    uniqueNames.forEach(name => {
      if (currentGenders[name]) cleanedGenders[name] = currentGenders[name];
    });

    store.update({
      students: uniqueNames,
      classSize: uniqueNames.length,
      fixedSeats: store.load().fixedSeats.filter(f => uniqueNames.includes(f.studentName)),
      separationRules: store.load().separationRules.filter(
        r => uniqueNames.includes(r.studentA) && uniqueNames.includes(r.studentB)
      ),
      studentGenders: cleanedGenders
    });
    countEl.textContent = `${uniqueNames.length}명`;
    window.dispatchEvent(new CustomEvent('roster-updated'));
    renderGenderList();
    showToast(`${uniqueNames.length}명의 학생 명단이 저장되었습니다.`, 'success');
  });

  // 초기 성별 리스트 렌더링
  renderGenderList();
  window.addEventListener('roster-updated', renderGenderList);
}

// === components/fixed-seat-editor.js ===
// 고정 자리 편집 컴포넌트

function initFixedSeatEditor(onUpdate) {
  const select = document.getElementById('fixed-student-select');
  const seatInput = document.getElementById('fixed-seat-number');
  const addBtn = document.getElementById('btn-add-fixed');
  const list = document.getElementById('fixed-seat-list');

  function refresh() {
    const data = store.load();
    populateFixedSelect(select, data.students, data.fixedSeats.map(f => f.studentName));
    renderFixedList(list, data.fixedSeats, onUpdate);

    // 자리 번호 최대값 설정
    const totalSeats = getTotalSeats(data);
    seatInput.max = totalSeats;
  }

  addBtn.addEventListener('click', () => {
    const data = store.load();
    const studentName = select.value;
    const seatNumber = parseInt(seatInput.value);

    if (!studentName) {
      showToast('학생을 선택해 주세요.', 'warning');
      return;
    }

    if (!seatNumber || seatNumber < 1) {
      showToast('자리 번호를 입력해 주세요.', 'warning');
      return;
    }

    const totalSeats = getTotalSeats(data);
    const seatIndex = seatNumber - 1; // 1-based → 0-based

    if (seatIndex >= totalSeats) {
      showToast(`자리 번호는 ${totalSeats} 이하여야 합니다.`, 'warning');
      return;
    }

    // 이미 해당 학생이 고정되어 있으면 제거 후 추가
    // 이미 해당 자리에 다른 학생이 고정되어 있으면 제거 후 추가
    const filtered = data.fixedSeats.filter(f => f.seatIndex !== seatIndex && f.studentName !== studentName);
    filtered.push({ studentName, seatIndex });

    store.update({ fixedSeats: filtered });
    showToast(`${studentName} → ${seatNumber}번 자리에 고정되었습니다.`, 'success');
    select.value = '';
    seatInput.value = '';
    refresh();
    if (onUpdate) onUpdate();
    // 다음 학생 바로 선택할 수 있도록 포커스 이동
    select.focus();
  });

  window.addEventListener('roster-updated', refresh);
  refresh();

  return { refresh };
}

function populateFixedSelect(select, students, usedStudents) {
  const current = select.value;
  select.innerHTML = '<option value="">학생 선택...</option>';
  students.forEach(s => {
    if (usedStudents.includes(s)) return;
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (current) {
    const match = Array.from(select.options).find(o => o.value === current);
    if (match) select.value = current;
  }
}

function renderFixedList(list, fixedSeats, onUpdate) {
  list.innerHTML = '';
  fixedSeats.forEach(fs => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = `${fs.seatIndex + 1}번`;
    span.appendChild(document.createTextNode(fs.studentName + ' → '));
    span.appendChild(strong);
    span.appendChild(document.createTextNode(' 자리'));
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '✕';
    btn.setAttribute('aria-label', `${fs.studentName} 고정 자리 해제`);
    btn.addEventListener('click', () => {
      const data = store.load();
      store.update({
        fixedSeats: data.fixedSeats.filter(f => f.studentName !== fs.studentName)
      });
      renderFixedList(list, store.load().fixedSeats, onUpdate);
      if (onUpdate) onUpdate();
      showToast(`${fs.studentName}의 고정 자리가 해제되었습니다.`, 'info');
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// === components/constraint-editor.js ===
// 분리 규칙 편집 컴포넌트

function initConstraintEditor() {
  const selectA = document.getElementById('sep-student-a');
  const bWrap = document.getElementById('sep-student-b-wrap');
  const bToggle = document.getElementById('sep-student-b-toggle');
  const bDropdown = document.getElementById('sep-student-b-dropdown');
  const distInput = document.getElementById('sep-distance');
  const addBtn = document.getElementById('btn-add-sep');
  const list = document.getElementById('sep-rule-list');

  function refresh() {
    const data = store.load();
    populateConstraintSelect(selectA, data.students);
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
    renderConstraintList(list, data.separationRules);
  }

  // Toggle dropdown
  bToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    bDropdown.classList.toggle('open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!bWrap.contains(e.target)) {
      bDropdown.classList.remove('open');
    }
  });

  // Update B options when A changes
  selectA.addEventListener('change', () => {
    const data = store.load();
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
  });

  // 거리 도움말 추가
  const distHint = document.createElement('p');
  distHint.className = 'hint';
  distHint.style.margin = '0';
  distHint.textContent = '(가로·세로 칸 수 합, 대각선=2칸)';
  distInput.parentElement.parentElement.appendChild(distHint);

  addBtn.addEventListener('click', () => {
    const data = store.load();
    const studentA = selectA.value;
    const selectedBs = getSelectedStudents(bDropdown);
    const minDistance = parseInt(distInput.value) || 2;

    if (!studentA) {
      showToast('기준 학생을 선택해 주세요.', 'warning');
      return;
    }

    if (selectedBs.length === 0) {
      showToast('분리할 학생을 1명 이상 선택해 주세요.', 'warning');
      return;
    }

    let addedCount = 0;
    for (const studentB of selectedBs) {
      const rule = { studentA, studentB, minDistance };

      if (!validateSeparationRule(rule, data.students)) continue;

      // 중복 체크
      const dup = data.separationRules.some(
        r => (r.studentA === rule.studentA && r.studentB === rule.studentB) ||
             (r.studentA === rule.studentB && r.studentB === rule.studentA)
      );
      if (dup) continue;

      data.separationRules.push(rule);
      addedCount++;
    }

    if (addedCount === 0) {
      showToast('추가할 새 규칙이 없습니다. (이미 등록된 규칙일 수 있습니다)', 'warning');
      return;
    }

    store.update({ separationRules: data.separationRules });
    selectA.value = '';
    refresh();
    showToast(`${addedCount}개 분리 규칙이 추가되었습니다.`, 'success');
  });

  window.addEventListener('roster-updated', refresh);
  refresh();

  return { refresh };
}

function populateConstraintSelect(select, students) {
  const current = select.value;
  select.innerHTML = '<option value="">기준 학생</option>';
  students.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  if (current) {
    const match = Array.from(select.options).find(o => o.value === current);
    if (match) select.value = current;
  }
}

function populateMultiSelect(dropdown, toggle, students, excludeStudent) {
  dropdown.innerHTML = '';
  const filtered = students.filter(s => s !== excludeStudent);

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="multi-select-item" style="color:var(--text-light)">학생 없음</div>';
    toggle.textContent = '분리할 학생 선택';
    toggle.classList.remove('has-selection');
    return;
  }

  filtered.forEach(s => {
    const label = document.createElement('label');
    label.className = 'multi-select-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = s;
    cb.addEventListener('change', () => updateToggleText(dropdown, toggle));
    label.appendChild(cb);
    label.appendChild(document.createTextNode(s));
    dropdown.appendChild(label);
  });

  toggle.textContent = '분리할 학생 선택';
  toggle.classList.remove('has-selection');
}

function getSelectedStudents(dropdown) {
  const checked = dropdown.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value);
}

function updateToggleText(dropdown, toggle) {
  const selected = getSelectedStudents(dropdown);
  if (selected.length === 0) {
    toggle.textContent = '분리할 학생 선택';
    toggle.classList.remove('has-selection');
  } else if (selected.length <= 2) {
    toggle.textContent = selected.join(', ');
    toggle.classList.add('has-selection');
  } else {
    toggle.textContent = `${selected[0]} 외 ${selected.length - 1}명`;
    toggle.classList.add('has-selection');
  }
}

function renderConstraintList(list, rules) {
  list.innerHTML = '';

  // 학생A별로 그룹화
  const groups = {};
  rules.forEach((rule, i) => {
    if (!groups[rule.studentA]) groups[rule.studentA] = [];
    groups[rule.studentA].push({ rule, index: i });
  });

  rules.forEach((rule, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.appendChild(document.createTextNode(rule.studentA + ' ↔ ' + rule.studentB + ' '));
    const em = document.createElement('em');
    em.style.cssText = 'color:var(--text-light);font-size:0.8em';
    em.textContent = `(최소 ${rule.minDistance}칸)`;
    span.appendChild(em);
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.className = 'btn-remove';
    btn.textContent = '✕';
    btn.setAttribute('aria-label', `${rule.studentA}-${rule.studentB} 규칙 삭제`);
    btn.addEventListener('click', () => {
      const data = store.load();
      data.separationRules.splice(i, 1);
      store.update({ separationRules: data.separationRules });
      renderConstraintList(list, store.load().separationRules);
      showToast('규칙이 삭제되었습니다.', 'info');
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// === algorithm/seat-randomizer.js ===
// 제약조건 기반 랜덤 배치 알고리즘 (최적화 버전)
// 주요 개선:
// 1. 타임아웃 메커니즘 (무한 블로킹 방지)
// 2. 인접 좌석 맵 사전 계산 (성별 검사 O(n) → O(1))
// 3. 체커보드 패턴으로 성별 좌석 사전 분할 (검색 공간 ~50% 감소)
// 4. 가용 좌석 Set 관리 (배정된 좌석 재순회 제거)
// 5. 시도 횟수 축소 + 조기 종료
// 6. 분리 규칙 역방향 룩업 맵 (학생→상대 학생 O(1) 조회)
// 7. 비동기 실행으로 UI 블로킹 방지

const seatLayoutMap = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout,
  group: groupLayout
};

const MAX_ATTEMPTS = 15;
const TIMEOUT_MS = 2000;

/**
 * Fisher-Yates shuffle (in-place)
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * UI 스레드 양보 (16ms 이상 블로킹 방지)
 */
function yieldToUI() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * 분리 규칙 역방향 룩업 맵 생성
 * 학생 이름 → 관련 규칙 배열 (O(1) 조회)
 */
function buildRuleLookup(separationRules) {
  const map = {};
  for (const rule of separationRules) {
    if (!map[rule.studentA]) map[rule.studentA] = [];
    if (!map[rule.studentB]) map[rule.studentB] = [];
    map[rule.studentA].push({ other: rule.studentB, minDistance: rule.minDistance });
    map[rule.studentB].push({ other: rule.studentA, minDistance: rule.minDistance });
  }
  return map;
}

/**
 * 학생 이름 → 좌석 인덱스 역방향 맵 생성
 */
function buildNameToSeatMap(assignment) {
  const map = {};
  for (const [seat, name] of Object.entries(assignment)) {
    map[name] = Number(seat);
  }
  return map;
}

/**
 * 제약 기반 랜덤 배치 (비동기 - UI 블로킹 방지)
 * @returns {Promise<{ [seatIndex: number]: string } | null>} 배정 결과 또는 실패 시 null
 */
async function randomizeSeats(data) {
  const { students, layoutType, layoutSettings, fixedSeats, separationRules } = data;
  const layout = seatLayoutMap[layoutType];
  if (!layout) return null;

  const positions = layout.getSeatPositions(layoutSettings);
  const totalSeats = positions.length;

  if (students.length === 0) return null;
  if (students.length > totalSeats) return null;

  // 위치 인덱스 → 위치 객체 맵
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  // 인접 좌석 맵 사전 계산 (성별 제약 최적화)
  const adjacencyMap = buildAdjacencyMap(positions, posMap, data);

  // 분리 규칙 역방향 룩업 맵
  const ruleLookup = buildRuleLookup(separationRules);

  const deadline = Date.now() + TIMEOUT_MS;

  // 1차: 모든 제약 (history 포함) 적용
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() > deadline) break;
    // 매 시도마다 UI 양보
    if (attempt > 0 && (attempt & 3) === 0) await yieldToUI();
    const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data, adjacencyMap, deadline, ruleLookup);
    if (result) return result;
  }

  // 2차 폴백: history 제약 없이 재시도
  if (data.useHistoryExclusion !== false && (data.assignmentHistory || []).length > 0) {
    await yieldToUI();
    const fallbackData = { ...data, useHistoryExclusion: false };
    const deadline2 = Date.now() + TIMEOUT_MS;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (Date.now() > deadline2) break;
      if (attempt > 0 && (attempt & 3) === 0) await yieldToUI();
      const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, fallbackData, adjacencyMap, deadline2, ruleLookup);
      if (result) {
        result._historyFallback = true;
        return result;
      }
    }
  }

  return null; // 실패
}

/**
 * 인접 좌석 맵 생성
 * 각 좌석에 대해 성별 제약 검사에 사용되는 인접 좌석 인덱스를 미리 계산
 * 기존: 매 검사마다 전체 좌석 순회 O(n) → 개선: 사전 계산 O(1) 조회
 */
function buildAdjacencyMap(positions, posMap, data) {
  const map = {};

  for (const pos of positions) {
    const neighbors = [];

    if (data.layoutType === 'pair') {
      // 짝대형: 같은 행의 짝 파트너만
      const partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
      for (const other of positions) {
        if (other.row === pos.row && other.col === partnerCol) {
          neighbors.push(other.index);
        }
      }
    } else {
      // 기타: 상하좌우 (Manhattan 거리 1)
      for (const other of positions) {
        const dist = Math.abs(pos.row - other.row) + Math.abs(pos.col - other.col);
        if (dist === 1) neighbors.push(other.index);
      }
    }

    map[pos.index] = neighbors;
  }

  return map;
}

/**
 * 성별에 따른 유효 좌석 사전 계산
 * 'mixed': 체커보드 패턴으로 남녀 좌석을 분리하여 검색 공간 절반으로 축소
 * 'same': 동성끼리 공간적으로 그룹화
 * 'none': 전체 좌석 허용
 */
function precomputeGenderSeats(students, availableSeats, posMap, data) {
  const genderRule = data.genderRule || 'none';
  const genders = data.studentGenders || {};
  const result = {};
  const allSeats = [...availableSeats];

  if (genderRule === 'none') {
    students.forEach(s => { result[s] = allSeats; });
    return result;
  }

  if (genderRule === 'mixed') {
    // 체커보드 패턴: 그리드에서 (row+col) 패리티로 두 색 그룹 생성
    // 같은 색 좌석끼리는 절대 인접하지 않으므로, 남녀를 다른 색에 배치하면
    // 성별 제약이 자동으로 만족됨 → 백트래킹 탐색 공간 대폭 감소
    const evenSeats = [];
    const oddSeats = [];

    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (!pos) continue;

      if (data.layoutType === 'pair') {
        if (pos.col % 2 === 0) evenSeats.push(seatIdx);
        else oddSeats.push(seatIdx);
      } else {
        if ((pos.row + pos.col) % 2 === 0) evenSeats.push(seatIdx);
        else oddSeats.push(seatIdx);
      }
    }

    let maleCount = 0, femaleCount = 0;
    students.forEach(s => {
      if (genders[s] === 'M') maleCount++;
      else if (genders[s] === 'F') femaleCount++;
    });

    // 최적 방향: 큰 성별 그룹을 큰 좌석 세트에 배정
    const fit1 = (maleCount <= evenSeats.length && femaleCount <= oddSeats.length);
    const fit2 = (maleCount <= oddSeats.length && femaleCount <= evenSeats.length);

    let maleSeats, femaleSeats;
    if (fit1 && fit2) {
      const slack1 = (evenSeats.length - maleCount) + (oddSeats.length - femaleCount);
      const slack2 = (oddSeats.length - maleCount) + (evenSeats.length - femaleCount);
      if (slack1 >= slack2) {
        maleSeats = evenSeats; femaleSeats = oddSeats;
      } else {
        maleSeats = oddSeats; femaleSeats = evenSeats;
      }
    } else if (fit1) {
      maleSeats = evenSeats; femaleSeats = oddSeats;
    } else if (fit2) {
      maleSeats = oddSeats; femaleSeats = evenSeats;
    } else {
      // 어느 방향으로도 완벽 분할 불가 → 전체 좌석 사용 (제약 검사기가 처리)
      maleSeats = allSeats; femaleSeats = allSeats;
    }

    students.forEach(s => {
      const g = genders[s];
      if (g === 'M') result[s] = maleSeats;
      else if (g === 'F') result[s] = femaleSeats;
      else result[s] = allSeats;
    });

    return result;
  }

  if (genderRule === 'mixedFirst') {
    // 이성 우선: 소수 성별 전원 + 같은 수의 다수 성별을 체커보드 배치,
    // 나머지 다수 성별은 전체 좌석 사용 (동성 인접 허용)
    const evenSeats = [];
    const oddSeats = [];

    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (!pos) continue;

      if (data.layoutType === 'pair') {
        if (pos.col % 2 === 0) evenSeats.push(seatIdx);
        else oddSeats.push(seatIdx);
      } else {
        if ((pos.row + pos.col) % 2 === 0) evenSeats.push(seatIdx);
        else oddSeats.push(seatIdx);
      }
    }

    let maleCount = 0, femaleCount = 0;
    students.forEach(s => {
      if (genders[s] === 'M') maleCount++;
      else if (genders[s] === 'F') femaleCount++;
    });

    const minorGender = maleCount <= femaleCount ? 'M' : 'F';
    const majorGender = minorGender === 'M' ? 'F' : 'M';
    const minorCount = Math.min(maleCount, femaleCount);

    // 소수 성별 → 한 색, 다수 성별 중 minorCount명 → 반대 색
    const fit1 = (minorCount <= evenSeats.length);
    const fit2 = (minorCount <= oddSeats.length);

    let minorSeats, pairedMajorSeats;
    if (fit1 && fit2) {
      if (evenSeats.length >= oddSeats.length) {
        minorSeats = oddSeats; pairedMajorSeats = evenSeats;
      } else {
        minorSeats = evenSeats; pairedMajorSeats = oddSeats;
      }
    } else if (fit1) {
      minorSeats = evenSeats; pairedMajorSeats = oddSeats;
    } else if (fit2) {
      minorSeats = oddSeats; pairedMajorSeats = evenSeats;
    } else {
      minorSeats = allSeats; pairedMajorSeats = allSeats;
    }

    let majorPairedCount = 0;
    students.forEach(s => {
      const g = genders[s];
      if (g === minorGender) {
        result[s] = minorSeats;
      } else if (g === majorGender) {
        if (majorPairedCount < minorCount) {
          result[s] = pairedMajorSeats;
          majorPairedCount++;
        } else {
          result[s] = allSeats; // 남은 다수 성별: 전체 좌석
        }
      } else {
        result[s] = allSeats;
      }
    });

    return result;
  }

  if (genderRule === 'same') {
    // 동성 인접: 같은 성별끼리 모이도록 행 단위로 완전 분리
    // 핵심: 남/녀 좌석 풀이 겹치면 경계에서 이성 인접 → 백트래킹 폭발
    // 해결: 남학생 영역 / 빈 버퍼 행 / 여학생 영역으로 완전 분리

    let maleCount = 0, femaleCount = 0;
    students.forEach(s => {
      if (genders[s] === 'M') maleCount++;
      else if (genders[s] === 'F') femaleCount++;
    });

    // 행 정보 수집
    const rowSet = new Set();
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos) rowSet.add(pos.row);
    }
    const rows = [...rowSet].sort((a, b) => a - b);

    // 각 행에 속한 좌석 수 계산
    const seatsPerRow = {};
    rows.forEach(r => { seatsPerRow[r] = 0; });
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos && seatsPerRow[pos.row] !== undefined) seatsPerRow[pos.row]++;
    }

    // 행을 누적하며 한 성별에 충분한 행 수 찾기
    // 남학생: 위쪽 행, 여학생: 아래쪽 행, 중간에 1행 이상 버퍼
    let maleRows = 0, maleCapacity = 0;
    for (let i = 0; i < rows.length; i++) {
      maleCapacity += seatsPerRow[rows[i]];
      maleRows = i + 1;
      if (maleCapacity >= maleCount) break;
    }

    let femaleRows = 0, femaleCapacity = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      femaleCapacity += seatsPerRow[rows[i]];
      femaleRows++;
      if (femaleCapacity >= femaleCount) break;
    }

    // 버퍼 포함하여 분리 가능한지 확인 (남학생 행 + 버퍼 1행 + 여학생 행 ≤ 전체 행)
    const canSeparate = (maleRows + 1 + femaleRows) <= rows.length
      && maleCapacity >= maleCount && femaleCapacity >= femaleCount;

    if (canSeparate) {
      const maleRowSet = new Set(rows.slice(0, maleRows));
      const femaleRowSet = new Set(rows.slice(rows.length - femaleRows));

      const maleSeats = allSeats.filter(s => posMap[s] && maleRowSet.has(posMap[s].row));
      const femaleSeats = allSeats.filter(s => posMap[s] && femaleRowSet.has(posMap[s].row));

      students.forEach(s => {
        const g = genders[s];
        if (g === 'M') result[s] = maleSeats;
        else if (g === 'F') result[s] = femaleSeats;
        else result[s] = allSeats;
      });
    } else {
      // 분리 불가능 → 전체 좌석 사용 (제약 검사기가 처리)
      students.forEach(s => { result[s] = allSeats; });
    }

    return result;
  }

  // 기본: 전체 좌석 허용
  students.forEach(s => { result[s] = allSeats; });
  return result;
}

function tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data, adjacencyMap, deadline, ruleLookup) {
  const assignment = {};
  const assignedStudents = new Set();
  const availableSeats = new Set();

  // 1. 고정 자리 먼저 배정
  for (const fs of fixedSeats) {
    if (!students.includes(fs.studentName)) continue;
    if (fs.seatIndex >= totalSeats) continue;
    assignment[fs.seatIndex] = fs.studentName;
    assignedStudents.add(fs.studentName);
  }

  // 사용 가능한 좌석 세트 (고정 좌석 제외)
  positions.forEach(p => {
    if (assignment[p.index] === undefined) availableSeats.add(p.index);
  });

  // 2. 나머지 학생
  const remaining = students.filter(s => !assignedStudents.has(s));

  // 3. 성별 기반 유효 좌석 사전 계산
  const genderValidSeats = precomputeGenderSeats(remaining, availableSeats, posMap, data);

  // 4. 제약 많은 학생 우선 배치 (Most-Constrained-First)
  const genders = data.studentGenders || {};
  const genderRule = data.genderRule || 'none';
  const constraintScore = {};

  remaining.forEach(s => {
    let score = 0;
    // 분리 규칙 수
    separationRules.forEach(rule => {
      if (rule.studentA === s || rule.studentB === s) score += 2;
    });
    // 유효 좌석이 적을수록 더 제약됨
    const validCount = genderValidSeats[s] ? genderValidSeats[s].length : availableSeats.size;
    score += Math.max(0, availableSeats.size - validCount);
    constraintScore[s] = score;
  });

  // 'same' 모드: 같은 성별끼리 연속 배치되도록 성별별 그룹화
  if (genderRule === 'same') {
    remaining.sort((a, b) => {
      const gA = genders[a] || 'Z';
      const gB = genders[b] || 'Z';
      if (gA !== gB) return gA < gB ? -1 : 1;
      return constraintScore[b] - constraintScore[a];
    });
  } else {
    remaining.sort((a, b) => constraintScore[b] - constraintScore[a]);
  }

  // 5. 이름→좌석 역방향 맵 (분리 규칙 검증 최적화)
  const nameToSeat = buildNameToSeatMap(assignment);

  // 6. 백트래킹 배치
  const success = backtrack(0, remaining, availableSeats, assignment, posMap, separationRules, layout, data, adjacencyMap, genderValidSeats, deadline, ruleLookup, nameToSeat);
  return success ? assignment : null;
}

function backtrack(studentIdx, students, availableSeats, assignment, posMap, rules, layout, data, adjacencyMap, genderValidSeats, deadline, ruleLookup, nameToSeat) {
  if (studentIdx >= students.length) return true;

  // 주기적 타임아웃 체크 (매 호출이 아닌 4명마다)
  if ((studentIdx & 3) === 0 && Date.now() > deadline) return false;

  const student = students[studentIdx];

  // 유효 좌석 중 현재 사용 가능한 것만 후보로 선정
  const validSeats = genderValidSeats[student] || [];
  const candidates = [];
  for (const s of validSeats) {
    if (availableSeats.has(s)) candidates.push(s);
  }

  // 후보가 없으면 즉시 실패 (조기 가지치기)
  if (candidates.length === 0) return false;

  shuffle(candidates);

  for (const seatIdx of candidates) {
    // 분리 규칙 검증 (역방향 룩업 맵 사용 - O(규칙 수) instead of O(배정 학생 수))
    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout, ruleLookup, nameToSeat)) continue;

    // 성별 제약 검증 (사전 계산된 인접 맵 사용)
    if (!checkGenderConstraintFast(student, seatIdx, assignment, adjacencyMap, data)) continue;

    // 이전 자리 제약 검증
    if (!checkHistoryConstraint(student, seatIdx, data)) continue;

    // 모둠원 중복 방지 검증
    if (!checkGroupConstraint(student, seatIdx, assignment, data)) continue;

    // 배치
    assignment[seatIdx] = student;
    availableSeats.delete(seatIdx);
    nameToSeat[student] = seatIdx;

    if (backtrack(studentIdx + 1, students, availableSeats, assignment, posMap, rules, layout, data, adjacencyMap, genderValidSeats, deadline, ruleLookup, nameToSeat)) {
      return true;
    }

    // 되돌리기
    delete assignment[seatIdx];
    availableSeats.add(seatIdx);
    delete nameToSeat[student];
  }

  return false;
}

function checkConstraints(student, seatIdx, assignment, posMap, rules, layout, ruleLookup, nameToSeat) {
  const pos = posMap[seatIdx];
  if (!pos) return false;

  // 역방향 룩업: 이 학생과 관련된 규칙만 O(1)로 조회
  const studentRules = ruleLookup[student];
  if (!studentRules || studentRules.length === 0) return true;

  for (const { other, minDistance } of studentRules) {
    // 상대 학생이 배정되었는지 역방향 맵으로 O(1) 조회
    const otherSeat = nameToSeat[other];
    if (otherSeat === undefined) continue;

    const otherPos = posMap[otherSeat];
    if (otherPos && layout.distance(pos, otherPos) <= minDistance) {
      return false;
    }
  }

  return true;
}

/**
 * 최적화된 성별 제약 검증
 * 기존: 전체 배정 목록을 순회하며 인접 좌석 탐색 O(n)
 * 개선: 사전 계산된 인접 맵으로 O(1) 조회 (최대 4개 이웃)
 */
function checkGenderConstraintFast(student, seatIdx, assignment, adjacencyMap, data) {
  const genderRule = data.genderRule || 'none';
  if (genderRule === 'none' || genderRule === 'mixedFirst') return true;

  const genders = data.studentGenders || {};
  const myGender = genders[student];
  if (!myGender) return true;

  const neighbors = adjacencyMap[seatIdx] || [];
  for (const neighborSeat of neighbors) {
    const neighborName = assignment[neighborSeat];
    if (!neighborName) continue;

    const neighborGender = genders[neighborName];
    if (!neighborGender) continue;

    if (genderRule === 'same' && myGender !== neighborGender) return false;
    if (genderRule === 'mixed' && myGender === neighborGender) return false;
  }

  return true;
}

/**
 * 이전 자리 재배치 방지 검증
 */
function checkHistoryConstraint(student, seatIdx, data) {
  if (data.useHistoryExclusion === false) return true;

  // 고정 자리 학생은 history 체크 건너뜀
  const fixedSeats = data.fixedSeats || [];
  if (fixedSeats.some(fs => fs.studentName === student && fs.seatIndex === seatIdx)) return true;

  const history = data.assignmentHistory || [];
  const excludeCount = data.historyExcludeCount || 1;

  // 최근 N개의 기록 + 현재 lastAssignment 확인
  const recordsToCheck = [];
  if (data.lastAssignment && data.lastAssignment.mapping) {
    recordsToCheck.push(data.lastAssignment.mapping);
  }
  const recentHistory = history.slice(-excludeCount);
  for (const record of recentHistory) {
    if (record.mapping) recordsToCheck.push(record.mapping);
  }

  for (const mapping of recordsToCheck) {
    if (mapping[seatIdx] === student) return false;
  }

  return true;
}

/**
 * 모둠원 중복 방지 제약 검증
 * 같은 모둠 클러스터에 배정된 학생들이 이전 모둠에서 함께했는지 체크
 */
function checkGroupConstraint(student, seatIdx, assignment, data) {
  if (data.layoutType !== 'group') return true;
  if (data.useGroupExclusion === false) return true;

  const groupHistory = data.groupHistory || [];
  if (groupHistory.length === 0) return true;

  const groupSize = data.layoutSettings.groupSize || 4;
  const myGroupIdx = Math.floor(seatIdx / groupSize);
  const excludeCount = data.groupExcludeCount || 1;
  const recentHistory = groupHistory.slice(-excludeCount);

  // 현재 같은 모둠에 이미 배정된 학생 찾기
  const groupStart = myGroupIdx * groupSize;
  const groupEnd = groupStart + groupSize;
  const currentGroupmates = [];
  for (let i = groupStart; i < groupEnd; i++) {
    if (assignment[i] && assignment[i] !== student) {
      currentGroupmates.push(assignment[i]);
    }
  }

  if (currentGroupmates.length === 0) return true;

  // 이전 기록에서 student와 currentGroupmates가 같은 모둠이었는지 확인
  for (const record of recentHistory) {
    const groups = record.groups || [];
    for (const group of groups) {
      if (group.includes(student)) {
        for (const mate of currentGroupmates) {
          if (group.includes(mate)) return false;
        }
      }
    }
  }

  return true;
}

// === screens/teacher-screen.js ===
// 교사 설정 화면 로직

function verifyAssignment(result, data) {
  const layout = getLayout(data.layoutType);
  const positions = layout.getSeatPositions(data.layoutSettings);
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  const violations = [];

  // 고정 자리 검증
  for (const fs of data.fixedSeats) {
    if (!data.students.includes(fs.studentName)) continue;
    if (result[fs.seatIndex] !== fs.studentName) {
      violations.push(`고정 자리 위반: ${fs.studentName} → ${fs.seatIndex + 1}번 자리`);
    }
  }

  // 분리 규칙 검증
  for (const rule of data.separationRules) {
    let seatA = null, seatB = null;
    for (const [seat, name] of Object.entries(result)) {
      if (name === rule.studentA) seatA = Number(seat);
      if (name === rule.studentB) seatB = Number(seat);
    }
    if (seatA !== null && seatB !== null) {
      const posA = posMap[seatA];
      const posB = posMap[seatB];
      if (posA && posB) {
        const dist = layout.distance(posA, posB);
        if (dist <= rule.minDistance) {
          violations.push(`분리 위반: ${rule.studentA} ↔ ${rule.studentB} (거리 ${dist}, 최소 ${rule.minDistance})`);
        }
      }
    }
  }

  return violations;
}

function initTeacherScreen() {
  // === 반 관리 ===
  initClassManager();
  initRoster();

  const previewTitle = document.getElementById('preview-title');
  const seatGrid = document.getElementById('teacher-seat-grid');
  const customEditor = document.getElementById('custom-editor');
  const viewToggleBtnTeacher = document.getElementById('btn-toggle-view-teacher');

  // === 시선 전환 (교사 미리보기) ===
  let isTeacherViewPreview = store.load().viewPerspective === 'teacher';
  let currentPreviewAssignment = null;

  function updateTeacherToggleBtn() {
    viewToggleBtnTeacher.classList.toggle('active', isTeacherViewPreview);
    viewToggleBtnTeacher.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${isTeacherViewPreview ? '선생님 시선' : '학생 시선'}`;
  }
  updateTeacherToggleBtn();

  viewToggleBtnTeacher.addEventListener('click', () => {
    isTeacherViewPreview = !isTeacherViewPreview;
    store.update({ viewPerspective: isTeacherViewPreview ? 'teacher' : 'student' });
    updateTeacherToggleBtn();
    refreshPreview();
  });

  function refreshPreview() {
    const data = store.load();
    const assignment = currentPreviewAssignment || data.lastAssignment?.mapping || null;

    seatGrid.style.display = 'none';
    customEditor.style.display = 'none';

    if (data.layoutType === 'custom') {
      customEditor.style.display = 'block';
      previewTitle.textContent = '자유배치 편집기';
    } else {
      seatGrid.style.display = 'block';
      previewTitle.textContent = data.layoutType === 'group' ? '모둠 배치 (드래그로 조정 가능)' : '배치도 미리보기';
      renderSeatGrid(seatGrid, data, assignment, {
        fixedSeats: data.fixedSeats,
        teacherView: isTeacherViewPreview
      });
      // 모둠대형: 미리보기에서 드래그 활성화
      if (data.layoutType === 'group' && !isTeacherViewPreview) {
        enableGroupDrag(seatGrid, data.layoutSettings, (positions) => {
          const d = store.load();
          store.update({
            layoutSettings: { ...d.layoutSettings, groupPositions: positions }
          });
        });
      }
    }
    checkSeatWarning();
    updateCustomStatus();
    updateGroupHistorySection();
  }

  function checkSeatWarning() {
    const data = store.load();
    const warningEl = document.getElementById('seat-warning');
    const totalSeats = getTotalSeats(data);
    const studentCount = data.students.length;

    if (studentCount === 0 || totalSeats === 0) {
      warningEl.style.display = 'none';
      return;
    }

    if (studentCount > totalSeats) {
      warningEl.style.display = 'flex';
      warningEl.textContent = `학생 수(${studentCount}명)가 좌석 수(${totalSeats}석)보다 많습니다. 좌석을 추가하거나 명단을 조정하세요.`;
    } else if (totalSeats - studentCount > totalSeats * 0.5) {
      warningEl.style.display = 'flex';
      warningEl.textContent = `좌석(${totalSeats}석)이 학생 수(${studentCount}명)보다 많이 남습니다. 행/열 수를 조정해 보세요.`;
    } else {
      warningEl.style.display = 'none';
    }
  }

  function updateCustomStatus() {
    const data = store.load();
    const deskCountEl = document.getElementById('desk-count');
    const studentCountEl = document.getElementById('custom-student-count');
    const warningEl = document.getElementById('custom-seat-warning');
    if (!deskCountEl) return;

    const deskCount = (data.layoutSettings.customDesks || []).length;
    const studentCount = data.students.length;
    deskCountEl.textContent = deskCount;
    studentCountEl.textContent = studentCount;

    if (data.layoutType !== 'custom' || studentCount === 0 || deskCount === 0) {
      warningEl.style.display = 'none';
      return;
    }

    warningEl.style.display = 'block';
    if (studentCount > deskCount) {
      warningEl.className = 'custom-seat-warning warning-over';
      warningEl.textContent = `책상이 ${studentCount - deskCount}개 부족합니다`;
    } else if (deskCount > studentCount) {
      warningEl.className = 'custom-seat-warning warning-under';
      warningEl.textContent = `빈 책상이 ${deskCount - studentCount}개 남습니다`;
    } else {
      warningEl.className = 'custom-seat-warning warning-ok';
      warningEl.textContent = `딱 맞습니다!`;
    }
  }

  initFixedSeatEditor(refreshPreview);
  initConstraintEditor();

  // 배치 유형 탭
  const tabs = document.querySelectorAll('.layout-tabs .tab');
  const gridOptions = document.getElementById('grid-options');
  const customOptions = document.getElementById('custom-options');
  const groupOptions = document.getElementById('group-options');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const type = tab.dataset.layout;

      gridOptions.style.display = 'none';
      customOptions.style.display = 'none';
      groupOptions.style.display = 'none';

      if (type === 'custom') {
        customOptions.style.display = 'block';
        initCustomCanvas();
      } else if (type === 'group') {
        groupOptions.style.display = 'flex';
      } else {
        gridOptions.style.display = 'flex';
      }

      store.update({ layoutType: type });
      refreshPreview();
    });
  });

  // 초기 탭 상태 로드
  const data = store.load();
  const activeTab = document.querySelector(`.tab[data-layout="${data.layoutType}"]`);
  if (activeTab) {
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    if (data.layoutType === 'custom') {
      gridOptions.style.display = 'none';
      customOptions.style.display = 'block';
    } else if (data.layoutType === 'group') {
      gridOptions.style.display = 'none';
      groupOptions.style.display = 'flex';
    }
  }

  // 행/열 설정
  const colInput = document.getElementById('col-count');
  const rowInput = document.getElementById('row-count');
  colInput.value = data.layoutSettings.columns;
  rowInput.value = data.layoutSettings.rows;

  let previewDebounce = null;
  function onGridChange() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => {
      const current = store.load();
      const cols = parseInt(colInput.value) || 6;
      const rows = parseInt(rowInput.value) || 5;
      store.update({
        layoutSettings: {
          ...current.layoutSettings,
          columns: Math.max(1, Math.min(12, cols)),
          rows: Math.max(1, Math.min(12, rows))
        }
      });
      refreshPreview();
    }, 300);
  }
  colInput.addEventListener('input', onGridChange);
  rowInput.addEventListener('input', onGridChange);

  // === 모둠 옵션 ===
  const groupSizeInput = document.getElementById('group-size');

  if (groupSizeInput) {
    groupSizeInput.value = data.layoutSettings.groupSize || 4;

    groupSizeInput.addEventListener('input', () => {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(() => {
        const current = store.load();
        const groupSize = Math.max(3, Math.min(8, parseInt(groupSizeInput.value) || 4));
        // 모둠 크기 변경 → 커스텀 위치 초기화 (자동 재배치)
        store.update({
          layoutSettings: {
            ...current.layoutSettings,
            groupSize,
            groupPositions: []
          }
        });
        refreshPreview();
      }, 300);
    });

    // 배치 초기화 버튼 (드래그 조정 되돌리기)
    const btnGroupReset = document.getElementById('btn-group-reset');
    if (btnGroupReset) {
      btnGroupReset.addEventListener('click', () => {
        const current = store.load();
        store.update({
          layoutSettings: { ...current.layoutSettings, groupPositions: [] }
        });
        refreshPreview();
        showToast('모둠 배치가 초기화되었습니다.', 'info');
      });
    }
  }

  // === 모둠원 중복 방지 ===
  function updateGroupHistorySection() {
    const d = store.load();
    const section = document.getElementById('group-history-section');
    if (section) {
      section.style.display = d.layoutType === 'group' ? 'block' : 'none';
    }
  }

  const groupExclusionCheckbox = document.getElementById('use-group-exclusion');
  const groupExcludeCountSelect = document.getElementById('group-exclude-count');
  const groupHistoryInfo = document.getElementById('group-history-info');
  const clearGroupHistoryBtn = document.getElementById('btn-clear-group-history');

  if (groupExclusionCheckbox) {
    groupExclusionCheckbox.checked = data.useGroupExclusion !== false;
    groupExcludeCountSelect.value = data.groupExcludeCount || 1;

    function updateGroupHistoryInfo() {
      const d = store.load();
      const count = (d.groupHistory || []).length;
      groupHistoryInfo.textContent = `저장된 기록: ${count}건`;
    }
    updateGroupHistoryInfo();

    groupExclusionCheckbox.addEventListener('change', () => {
      store.update({ useGroupExclusion: groupExclusionCheckbox.checked });
    });
    groupExcludeCountSelect.addEventListener('change', () => {
      store.update({ groupExcludeCount: parseInt(groupExcludeCountSelect.value) });
    });
    clearGroupHistoryBtn.addEventListener('click', () => {
      store.update({ groupHistory: [] });
      updateGroupHistoryInfo();
      showToast('모둠 기록이 초기화되었습니다.', 'info');
    });
  }

  // 배치 저장
  document.getElementById('btn-save-layout').addEventListener('click', () => {
    const current = store.load();
    const cols = parseInt(colInput.value) || 6;
    const rows = parseInt(rowInput.value) || 5;
    store.update({
      layoutSettings: {
        ...current.layoutSettings,
        columns: Math.max(1, Math.min(12, cols)),
        rows: Math.max(1, Math.min(12, rows))
      }
    });
    refreshPreview();
    showToast('배치가 저장되었습니다.', 'success');
  });

  // 자유배치 캔버스
  function initCustomCanvas() {
    const canvas = document.getElementById('custom-canvas');
    const current = store.load();
    customLayout.init(canvas, current.layoutSettings.customDesks || [], (desks) => {
      const d = store.load();
      store.update({
        layoutSettings: { ...d.layoutSettings, customDesks: desks }
      });
      updateCustomStatus();
    });
  }

  document.getElementById('btn-add-desk').addEventListener('click', () => {
    customLayout.addDesk();
  });

  document.getElementById('btn-add-desks-auto').addEventListener('click', () => {
    const current = store.load();
    const count = current.students.length;
    if (count === 0) {
      showToast('학생 명단을 먼저 입력하세요.', 'warning');
      return;
    }
    customLayout.addDesks(count);
    showToast(`${count}개 책상을 자동 배치했습니다.`, 'success');
  });

  document.getElementById('btn-undo-desk').addEventListener('click', () => {
    customLayout.undo();
  });
  document.getElementById('btn-redo-desk').addEventListener('click', () => {
    customLayout.redo();
  });
  document.getElementById('btn-delete-desk').addEventListener('click', () => {
    customLayout.deleteSelected();
  });

  document.getElementById('btn-clear-desks').addEventListener('click', async () => {
    const current = store.load();
    const deskCount = (current.layoutSettings.customDesks || []).length;
    if (deskCount === 0) return;
    const confirmed = await showConfirm(`책상 ${deskCount}개를 모두 삭제합니다.\n정말 삭제하시겠어요?`);
    if (!confirmed) return;
    customLayout.clearDesks();
    showToast('모든 책상이 삭제되었습니다.', 'info');
  });

  // 미리 뽑기 테스트
  document.getElementById('btn-preview-randomize').addEventListener('click', async () => {
    const btn = document.getElementById('btn-preview-randomize');
    const current = store.load();

    if (current.students.length === 0) {
      showToast('학생 명단을 먼저 입력하세요.', 'warning');
      return;
    }

    const totalSeats = getTotalSeats(current);
    if (totalSeats === 0) {
      if (current.layoutType === 'custom') {
        showToast('자유배치 책상이 없습니다. 먼저 책상을 추가하세요.', 'warning');
      } else {
        showToast('좌석이 설정되지 않았습니다. 레이아웃을 확인하세요.', 'warning');
      }
      return;
    }
    if (current.students.length > totalSeats) {
      showToast(`학생 수(${current.students.length}명)가 좌석 수(${totalSeats}석)보다 많습니다.`, 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '배치 중...';
    await new Promise(r => setTimeout(r, 0));

    const result = await randomizeSeats(current);
    btn.disabled = false;
    btn.textContent = '미리 뽑기 테스트';
    if (result) {
      currentPreviewAssignment = result;
      // 자유배치: 결과 표시를 위해 seat-grid를 보이게
      if (current.layoutType === 'custom') {
        seatGrid.style.display = 'block';
      }
      renderSeatGrid(seatGrid, current, result, { fixedSeats: current.fixedSeats, animate: true, teacherView: isTeacherViewPreview });

      const violations = verifyAssignment(result, current);
      if (violations.length > 0) {
        showToast(`규칙 위반 ${violations.length}건: ${violations.join(' / ')}`, 'error', 5000);
      } else {
        const checks = [];
        if (current.fixedSeats.length > 0) checks.push(`고정 ${current.fixedSeats.length}건`);
        if (current.separationRules.length > 0) checks.push(`분리 ${current.separationRules.length}건`);
        const detail = checks.length > 0 ? ` (${checks.join(', ')} 적용됨)` : '';
        showToast(`테스트 배치 완료!${detail}`, 'success');
      }
    } else {
      showToast('자리 배치에 실패했습니다. 분리 규칙이 충돌할 수 있습니다.', 'error', 3500);
    }
  });

  // 내보내기/가져오기
  document.getElementById('btn-export').addEventListener('click', () => {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const className = store.getActiveClass();
    a.download = `자리배치_설정_${className}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('설정을 내보냈습니다.', 'success');
  });

  const importInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);

        if (parsed.type === 'seat-result') {
          // importJSON으로 검증 경유 (seat-result도 동일한 검증 적용)
          const importData = { ...parsed };
          if (importData.assignment) {
            importData.lastAssignment = { mapping: importData.assignment, timestamp: importData.timestamp || Date.now() };
          }
          delete importData.type;
          delete importData.version;
          delete importData.assignment;
          delete importData.date;
          if (store.importJSON(JSON.stringify(importData))) {
            // lastAssignment는 importJSON이 null로 초기화하므로 별도 저장
            if (parsed.assignment) {
              store.update({ lastAssignment: { mapping: parsed.assignment, timestamp: parsed.timestamp || Date.now() } });
            }
            showToast('이전 배치 결과를 불러왔습니다.', 'success');
            location.reload();
          } else {
            showToast('잘못된 결과 파일입니다.', 'error');
          }
          return;
        }

        if (store.importJSON(reader.result)) {
          showToast('설정을 가져왔습니다.', 'success');
          location.reload();
        } else {
          showToast('잘못된 설정 파일입니다.', 'error');
        }
      } catch {
        showToast('파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // === 성별 규칙 초기화 ===
  const genderRuleRadios = document.querySelectorAll('input[name="gender-rule"]');
  const savedGenderRule = data.genderRule || 'none';
  genderRuleRadios.forEach(radio => {
    if (radio.value === savedGenderRule) radio.checked = true;
    radio.addEventListener('change', () => {
      store.update({ genderRule: radio.value });
    });
  });

  // === 이전 자리 방지 초기화 ===
  const historyCheckbox = document.getElementById('use-history-exclusion');
  const historyCountSelect = document.getElementById('history-exclude-count');
  const historyInfo = document.getElementById('history-info');
  const clearHistoryBtn = document.getElementById('btn-clear-history');

  historyCheckbox.checked = data.useHistoryExclusion !== false;
  historyCountSelect.value = data.historyExcludeCount || 1;

  function updateHistoryInfo() {
    const d = store.load();
    const count = (d.assignmentHistory || []).length;
    historyInfo.textContent = `저장된 기록: ${count}건`;
  }
  updateHistoryInfo();

  historyCheckbox.addEventListener('change', () => {
    store.update({ useHistoryExclusion: historyCheckbox.checked });
  });
  historyCountSelect.addEventListener('change', () => {
    store.update({ historyExcludeCount: parseInt(historyCountSelect.value) });
  });
  clearHistoryBtn.addEventListener('click', () => {
    store.update({ assignmentHistory: [] });
    updateHistoryInfo();
    showToast('기록이 초기화되었습니다.', 'info');
  });

  window.addEventListener('roster-updated', () => {
    // 학생 수 변경 시 모둠 커스텀 위치 초기화
    const d = store.load();
    if (d.layoutType === 'group' && d.layoutSettings.groupPositions && d.layoutSettings.groupPositions.length > 0) {
      store.update({ layoutSettings: { ...d.layoutSettings, groupPositions: [] } });
    }
    refreshPreview();
    updateCustomStatus();
  });

  refreshPreview();

  if (data.layoutType === 'custom') {
    setTimeout(initCustomCanvas, 0);
  }
}

// === 반 관리 초기화 ===
function initClassManager() {
  const classSelect = document.getElementById('class-select');
  const addBtn = document.getElementById('btn-add-class');
  const renameBtn = document.getElementById('btn-rename-class');
  const deleteBtn = document.getElementById('btn-delete-class');

  function renderClassList() {
    const classes = store.getClassList();
    const active = store.getActiveClass();
    classSelect.innerHTML = '';
    classes.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === active) opt.selected = true;
      classSelect.appendChild(opt);
    });
  }

  renderClassList();

  classSelect.addEventListener('change', () => {
    store.switchClass(classSelect.value);
    location.reload();
  });

  addBtn.addEventListener('click', async () => {
    const classes = store.getClassList();
    if (classes.length >= 15) {
      showToast('최대 15개 반까지 만들 수 있습니다.', 'warning');
      return;
    }
    const name = prompt('새 반 이름을 입력하세요:');
    if (!name || name.trim().length === 0) return;
    if (store.addClass(name.trim())) {
      store.switchClass(name.trim());
      location.reload();
    } else {
      showToast('이미 같은 이름의 반이 있습니다.', 'warning');
    }
  });

  renameBtn.addEventListener('click', () => {
    const current = store.getActiveClass();
    const newName = prompt('새 이름을 입력하세요:', current);
    if (!newName || newName.trim().length === 0) return;
    if (store.renameClass(current, newName.trim())) {
      renderClassList();
      showToast(`'${newName.trim()}'(으)로 이름이 변경되었습니다.`, 'success');
    } else {
      showToast('이름 변경에 실패했습니다. 중복된 이름일 수 있습니다.', 'warning');
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const classes = store.getClassList();
    if (classes.length <= 1) {
      showToast('마지막 반은 삭제할 수 없습니다.', 'warning');
      return;
    }
    const current = store.getActiveClass();
    const confirmed = await showConfirm(`'${current}' 반을 삭제하시겠습니까?\n모든 설정이 삭제됩니다.`);
    if (!confirmed) return;
    if (store.removeClass(current)) {
      location.reload();
    }
  });
}

// === screens/student-screen.js ===
// 학생 뽑기 화면 로직

function verifyStudentAssignment(result, data) {
  const layout = getLayout(data.layoutType);
  const positions = layout.getSeatPositions(data.layoutSettings);
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  const violations = [];

  for (const fs of data.fixedSeats) {
    if (!data.students.includes(fs.studentName)) continue;
    if (result[fs.seatIndex] !== fs.studentName) {
      violations.push(`고정 자리 위반: ${fs.studentName} → ${fs.seatIndex + 1}번 자리`);
    }
  }

  for (const rule of data.separationRules) {
    let seatA = null, seatB = null;
    for (const [seat, name] of Object.entries(result)) {
      if (name === rule.studentA) seatA = Number(seat);
      if (name === rule.studentB) seatB = Number(seat);
    }
    if (seatA !== null && seatB !== null) {
      const posA = posMap[seatA];
      const posB = posMap[seatB];
      if (posA && posB) {
        const dist = layout.distance(posA, posB);
        if (dist <= rule.minDistance) {
          violations.push(`분리 위반: ${rule.studentA} ↔ ${rule.studentB}`);
        }
      }
    }
  }

  return violations;
}

function initStudentScreen() {
  const container = document.getElementById('student-seat-grid');
  const drawBtn = document.getElementById('btn-draw');
  const redrawBtn = document.getElementById('btn-redraw');
  const emptyState = document.getElementById('student-empty-state');
  const toolbar = document.querySelector('.student-toolbar');
  const printBtn = document.getElementById('btn-print');
  const fullscreenBtn = document.getElementById('btn-fullscreen');
  const saveResultBtn = document.getElementById('btn-save-result');
  const saveImageBtn = document.getElementById('btn-save-image');
  const loadResultBtn = document.getElementById('btn-load-result');
  const resultImportFile = document.getElementById('result-import-file');
  const viewToggleBtn = document.getElementById('btn-toggle-view-student');

  const revealAllBtn = document.getElementById('btn-reveal-all');
  const swapModeBtn = document.getElementById('btn-swap-mode');

  // === 시선 전환 ===
  let isTeacherView = store.load().viewPerspective === 'teacher';
  let currentAssignment = null; // 현재 화면에 표시 중인 배치 결과

  // === 이름 가리기 상태 ===
  let namesHidden = false; // 현재 이름이 가려진 상태인지
  let revealedSeats = new Set(); // 개별 공개된 좌석 인덱스

  // === 자리 교환 상태 ===
  let swapMode = false;
  let swapFirstSeat = null;

  function updateToggleBtn() {
    viewToggleBtn.classList.toggle('active', isTeacherView);
    viewToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${isTeacherView ? '선생님 시선' : '학생 시선'}`;
  }
  updateToggleBtn();

  viewToggleBtn.addEventListener('click', () => {
    isTeacherView = !isTeacherView;
    store.update({ viewPerspective: isTeacherView ? 'teacher' : 'student' });
    updateToggleBtn();
    reRenderCurrentView();
  });

  function reRenderCurrentView() {
    const d = store.load();
    const assignment = currentAssignment || d.lastAssignment?.mapping || null;
    if (assignment) {
      renderSeatGrid(container, d, assignment, { teacherView: isTeacherView });
    } else if (d.students.length > 0) {
      renderSeatGrid(container, d, createRosterOrder(d), { teacherView: isTeacherView });
    }
    applyPostRenderState();
  }

  // 렌더링 후 이름 가리기/스왑 상태 재적용
  function applyPostRenderState() {
    if (namesHidden) {
      container.querySelectorAll('.seat.assigned').forEach(el => {
        const seatIdx = parseInt(el.dataset.seat);
        if (revealedSeats.has(seatIdx)) {
          // 이미 공개된 좌석: hidden-name 없이 정상 표시
        } else {
          applyFlipCard(el);
        }
      });
    }
    attachSeatClickHandlers();
  }

  // 좌석에 카드 뒤집기 DOM 구조 적용
  function applyFlipCard(el) {
    if (el.classList.contains('hidden-name')) return; // 이미 적용됨
    const name = el.querySelector('.seat-name')?.textContent || '';
    const number = el.querySelector('.seat-number')?.textContent || '';
    el.classList.add('hidden-name');

    // seat-inner > seat-front(?) + seat-back(이름) 구조 삽입
    const inner = document.createElement('div');
    inner.className = 'seat-inner';
    inner.innerHTML =
      `<div class="seat-front">?</div>` +
      `<div class="seat-back"><span class="seat-number">${number}</span><span class="seat-name">${name}</span></div>`;
    el.appendChild(inner);
  }

  // 좌석의 카드 뒤집기 DOM 제거 (공개 시)
  function removeFlipCard(el) {
    el.classList.remove('hidden-name', 'flipped');
    const inner = el.querySelector('.seat-inner');
    if (inner) inner.remove();
  }

  // 좌석 클릭 핸들러 (이름 공개 + 스왑)
  function attachSeatClickHandlers() {
    container.querySelectorAll('.seat[data-seat]').forEach(el => {
      el.addEventListener('click', () => {
        const seatIdx = parseInt(el.dataset.seat);
        const assignment = currentAssignment;
        if (!assignment) return;

        // 스왑 모드 처리: 첫 번째는 학생 있는 좌석, 두 번째는 빈 좌석도 가능
        if (swapMode) {
          if (swapFirstSeat === null && !assignment[seatIdx]) return; // 첫 선택은 학생 있는 자리만
          handleSwapClick(seatIdx, el);
          return;
        }

        // 이름 공개 처리: 클릭 시 뒤집기
        if (namesHidden && el.classList.contains('hidden-name') && !el.classList.contains('flipped')) {
          el.classList.add('flipped');
          revealedSeats.add(seatIdx);

          // 뒤집기 애니메이션 완료 후 DOM 정리
          setTimeout(() => {
            removeFlipCard(el);
            // 모든 이름이 공개되었는지 확인
            const hiddenCount = container.querySelectorAll('.seat.hidden-name:not(.flipped)').length;
            if (hiddenCount === 0) {
              namesHidden = false;
              revealAllBtn.style.display = 'none';
            }
          }, 550);
        }
      });
    });
  }

  // 스왑 클릭 처리
  function handleSwapClick(seatIdx, el) {
    if (swapFirstSeat === null) {
      // 첫 번째 좌석 선택
      swapFirstSeat = seatIdx;
      el.classList.add('swap-selected');
    } else if (swapFirstSeat === seatIdx) {
      // 같은 좌석 다시 클릭 → 선택 해제
      swapFirstSeat = null;
      el.classList.remove('swap-selected');
    } else {
      // 두 번째 좌석 선택 → 교환 실행
      const mapping = { ...currentAssignment };
      const nameA = mapping[swapFirstSeat] || null;
      const nameB = mapping[seatIdx] || null;

      // 빈자리 이동: A 학생을 빈자리로 옮김 (또는 두 학생 교환)
      if (nameA) mapping[seatIdx] = nameA; else delete mapping[seatIdx];
      if (nameB) mapping[swapFirstSeat] = nameB; else delete mapping[swapFirstSeat];

      const d = store.load();
      store.update({ lastAssignment: { mapping, timestamp: Date.now() } });
      currentAssignment = mapping;

      // 재렌더링
      renderSeatGrid(container, d, mapping, { teacherView: isTeacherView });
      applyPostRenderState();

      const labelA = nameA || '빈 자리';
      const labelB = nameB || '빈 자리';
      showToast(`${labelA} ↔ ${labelB} 자리를 바꿨습니다.`, 'success');
      swapFirstSeat = null;
    }
  }

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

  // 명단 순서대로 기본 배치 생성
  function createRosterOrder(data) {
    const mapping = {};
    data.students.forEach((s, i) => { mapping[i] = s; });
    return mapping;
  }

  function renderCurrent(animate = false) {
    const data = store.load();
    const assignment = currentAssignment || data.lastAssignment?.mapping || null;
    renderSeatGrid(container, data, assignment, { animate, teacherView: isTeacherView });
  }

  // 초기 표시: 항상 명단 순서로 배치 (교사 미리보기 결과 무시)
  const data = store.load();
  updateEmptyState(data);

  if (data.students.length > 0) {
    // 학생 화면 진입 시 항상 명단 순서로 기초 배치 표시
    store.update({ lastAssignment: null });
    const rosterOrder = createRosterOrder(data);
    renderSeatGrid(container, data, rosterOrder, { teacherView: isTeacherView });
    drawBtn.style.display = 'inline-flex';
    redrawBtn.style.display = 'none';
    showResultToolbar(false);
  }

  // 자리 뽑기
  let _drawRunning = false;
  async function doDraw(isRedraw = false) {
    if (_drawRunning) return; // 이중 실행 방지
    _drawRunning = true;
    drawBtn.disabled = true;
    redrawBtn.disabled = true;

    try {
    const current = store.load();
    if (current.students.length === 0) {
      showToast('학생 명단이 없습니다. 교사 설정에서 명단을 입력하세요.', 'warning');
      return;
    }

    // 학생 수 vs 좌석 수 검증
    const totalSeats = getTotalSeatsForLayout(current);
    if (totalSeats === 0) {
      if (current.layoutType === 'custom') {
        showToast('자유배치 책상이 없습니다. 교사 설정에서 책상을 추가하세요.', 'warning');
      } else {
        showToast('좌석이 설정되지 않았습니다. 교사 설정을 확인하세요.', 'warning');
      }
      return;
    }
    if (current.students.length > totalSeats) {
      showToast(`학생 수(${current.students.length}명)가 좌석 수(${totalSeats}석)보다 많습니다.`, 'error');
      return;
    }

    // 다시 뽑기 시 확인
    if (isRedraw) {
      const confirmed = await showConfirm('현재 자리 배치 결과가 사라집니다.\n정말 다시 뽑으시겠어요?');
      if (!confirmed) return;
    }

    drawBtn.classList.add('loading');

    // 슬롯머신 애니메이션
    await slotAnimation(container, current);

    // 실제 배치 (비동기 - UI 블로킹 방지)
    const result = await randomizeSeats(current);
    if (!result) {
      showToast('자리 배치에 실패했습니다. 조건을 확인해 주세요.', 'error', 3500);
      return;
    }

    // 기록 저장: 현재 lastAssignment를 history에 push
    const prevAssignment = current.lastAssignment;
    const historyUpdate = {};
    if (prevAssignment && prevAssignment.mapping) {
      const history = [...(current.assignmentHistory || [])];
      history.push({
        mapping: prevAssignment.mapping,
        timestamp: prevAssignment.timestamp,
        date: new Date(prevAssignment.timestamp).toISOString().slice(0, 10)
      });
      // 최대 5개 유지
      while (history.length > 5) history.shift();
      historyUpdate.assignmentHistory = history;
    }

    // 모둠 히스토리 저장
    const groupHistoryUpdate = {};
    if (current.layoutType === 'group') {
      const groupSize = current.layoutSettings.groupSize || 4;
      const totalSeats = Object.keys(result).length;
      const groups = [];
      const groupCount = Math.ceil(totalSeats / groupSize);
      for (let g = 0; g < groupCount; g++) {
        const members = [];
        for (let s = g * groupSize; s < Math.min((g + 1) * groupSize, totalSeats); s++) {
          if (result[s]) members.push(result[s]);
        }
        if (members.length > 0) groups.push(members);
      }
      const gh = [...(current.groupHistory || [])];
      gh.push({ groups, timestamp: Date.now(), date: new Date().toISOString().slice(0, 10) });
      while (gh.length > 5) gh.shift();
      groupHistoryUpdate.groupHistory = gh;
    }

    // history fallback 확인
    const historyFallback = result._historyFallback;
    if (historyFallback) delete result._historyFallback;

    store.update({ lastAssignment: { mapping: result, timestamp: Date.now() }, ...historyUpdate, ...groupHistoryUpdate });
    currentAssignment = result;

    // 이름 가리기 상태 초기화
    namesHidden = true;
    revealedSeats.clear();
    swapMode = false;
    swapFirstSeat = null;
    swapModeBtn.classList.remove('active');

    // 결과 렌더링 (애니메이션 없이) + 즉시 ? 카드 적용
    renderSeatGrid(container, current, result, { animate: false, teacherView: isTeacherView });
    container.querySelectorAll('.seat.assigned').forEach(el => {
      applyFlipCard(el);
    });
    attachSeatClickHandlers();

    // ? 카드 등장 애니메이션 (staggered pop)
    const allCards = container.querySelectorAll('.seat.hidden-name');
    allCards.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.6)';
      el.style.transition = 'none';
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
        setTimeout(() => { el.style.transition = ''; el.style.transform = ''; }, 400);
      }, i * 50);
    });

    drawBtn.style.display = 'none';
    redrawBtn.style.display = 'inline-flex';
    revealAllBtn.style.display = 'inline-flex';
    drawBtn.disabled = false;
    redrawBtn.disabled = false;
    drawBtn.classList.remove('loading');
    showResultToolbar(true);

    // 결과 검증
    const violations = verifyStudentAssignment(result, current);
    if (violations.length > 0) {
      showToast(`규칙 위반 ${violations.length}건 발견`, 'error', 4000);
    } else if (historyFallback) {
      showToast('이전 자리를 완전히 피할 수 없어 일부 중복이 있을 수 있습니다. (기록 자동 저장됨)', 'warning', 4000);
    } else {
      const historyCount = (store.load().assignmentHistory || []).length;
      showToast(`자리 배치 완료! (기록 ${historyCount}건 저장됨)`, 'success');
    }
    } finally {
      _drawRunning = false;
      drawBtn.disabled = false;
      redrawBtn.disabled = false;
      drawBtn.classList.remove('loading');
    }
  }

  drawBtn.addEventListener('click', () => doDraw(false));
  redrawBtn.addEventListener('click', () => doDraw(true));

  // === 전체 공개 ===
  revealAllBtn.addEventListener('click', () => {
    if (!namesHidden) return;
    const hiddenSeats = container.querySelectorAll('.seat.hidden-name:not(.flipped)');
    hiddenSeats.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('flipped');
        const seatIdx = parseInt(el.dataset.seat);
        revealedSeats.add(seatIdx);
        setTimeout(() => removeFlipCard(el), 550);
      }, i * 80);
    });
    setTimeout(() => {
      namesHidden = false;
      revealAllBtn.style.display = 'none';
    }, hiddenSeats.length * 80 + 600);
  });

  // === 자리 교환 모드 ===
  swapModeBtn.addEventListener('click', () => {
    if (!currentAssignment) return;
    swapMode = !swapMode;
    swapFirstSeat = null;
    swapModeBtn.classList.toggle('active', swapMode);

    // 스왑 모드 활성화 시 이름이 가려져 있으면 전체 공개
    if (swapMode && namesHidden) {
      revealAllBtn.click();
    }

    // 기존 swap-selected 제거
    container.querySelectorAll('.seat.swap-selected').forEach(el => {
      el.classList.remove('swap-selected');
    });

    if (swapMode) {
      showToast('교환할 첫 번째 학생의 자리를 클릭하세요.', 'info');
    }
  });

  // === 결과 저장 (JSON) ===
  saveResultBtn.addEventListener('click', () => {
    const current = store.load();
    if (!current.lastAssignment) {
      showToast('저장할 배치 결과가 없습니다.', 'warning');
      return;
    }

    const exportData = {
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

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `자리배치_결과_${exportData.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('결과를 JSON 파일로 저장했습니다.', 'success');
  });

  // === 이미지 저장 ===
  saveImageBtn.addEventListener('click', async () => {
    const current = store.load();
    if (!current.lastAssignment) {
      showToast('저장할 배치 결과가 없습니다.', 'warning');
      return;
    }

    try {
      const canvas = await renderToCanvas(container, isTeacherView);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        const viewSuffix = isTeacherView ? '_선생님시선' : '';
        a.download = `자리배치${viewSuffix}_${dateStr}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('이미지로 저장했습니다.', 'success');
      }, 'image/png');
    } catch (err) {
      showToast('이미지 저장에 실패했습니다.', 'error');
    }
  });

  // === 결과 불러오기 ===
  loadResultBtn.addEventListener('click', () => resultImportFile.click());
  resultImportFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);

        // seat-result 형식 검증
        if (imported.type !== 'seat-result' || !imported.assignment) {
          showToast('올바른 자리 배치 결과 파일이 아닙니다.', 'error');
          return;
        }

        // importJSON으로 검증 경유
        const importData = { ...imported };
        delete importData.type;
        delete importData.version;
        delete importData.assignment;
        delete importData.date;
        if (!store.importJSON(JSON.stringify(importData))) {
          showToast('잘못된 결과 파일입니다.', 'error');
          return;
        }
        store.update({
          lastAssignment: {
            mapping: imported.assignment,
            timestamp: imported.timestamp || Date.now()
          }
        });

        const dateStr = imported.date || '(알 수 없음)';
        showToast(`${dateStr} 자리 배치를 불러왔습니다.`, 'success');

        // 화면 갱신
        currentAssignment = imported.assignment;
        namesHidden = false;
        revealedSeats.clear();
        swapMode = false;
        swapFirstSeat = null;
        swapModeBtn.classList.remove('active');
        revealAllBtn.style.display = 'none';
        renderCurrent(true);
        attachSeatClickHandlers();
        drawBtn.style.display = 'none';
        redrawBtn.style.display = 'inline-flex';
        showResultToolbar(true);
        updateEmptyState(store.load());
      } catch {
        showToast('파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  });

  // === 인쇄 (양면 보기: 학생 시선 + 선생님 시선) ===
  printBtn.addEventListener('click', () => {
    const printDual = document.getElementById('print-dual');
    const current = store.load();
    if (!current.lastAssignment) {
      window.print();
      return;
    }

    // 인쇄용 양면 보기 생성
    printDual.innerHTML = '';

    // 학생 시선
    const studentLabel = document.createElement('div');
    studentLabel.className = 'print-view-label';
    studentLabel.textContent = '[ 학생 시선 ]';
    printDual.appendChild(studentLabel);

    const studentContainer = document.createElement('div');
    studentContainer.className = 'seat-grid-container';
    renderSeatGrid(studentContainer, current, current.lastAssignment.mapping, { teacherView: false });
    printDual.appendChild(studentContainer);

    // 선생님 시선
    const teacherLabel = document.createElement('div');
    teacherLabel.className = 'print-view-label';
    teacherLabel.textContent = '[ 선생님 시선 ]';
    printDual.appendChild(teacherLabel);

    const teacherContainer = document.createElement('div');
    teacherContainer.className = 'seat-grid-container';
    renderSeatGrid(teacherContainer, current, current.lastAssignment.mapping, { teacherView: true });
    printDual.appendChild(teacherContainer);

    // 원본 배치도 숨기기
    container.classList.add('print-hidden');
    window.print();

    // 인쇄 후 정리 (afterprint 이벤트 사용)
    function cleanupPrint() {
      printDual.innerHTML = '';
      container.classList.remove('print-hidden');
      window.removeEventListener('afterprint', cleanupPrint);
    }
    window.addEventListener('afterprint', cleanupPrint, { once: true });
    // 폴백: afterprint 미지원 환경
    setTimeout(() => {
      if (container.classList.contains('print-hidden')) cleanupPrint();
    }, 5000);
  });

  // === 전체 화면 ===
  const toastContainer = document.getElementById('toast-container');
  const confirmModal = document.getElementById('confirm-modal');
  const historyModalEl = document.getElementById('history-modal');

  function moveOverlaysIntoScreen() {
    const screen = document.getElementById('student-screen');
    // 전체화면에서 모달/토스트가 보이도록 student-screen 안으로 이동
    if (toastContainer) screen.appendChild(toastContainer);
    if (confirmModal) screen.appendChild(confirmModal);
    if (historyModalEl) screen.appendChild(historyModalEl);
  }

  function moveOverlaysBack() {
    // 원래 body 레벨로 복원
    if (toastContainer) document.body.insertBefore(toastContainer, document.body.firstChild);
    if (confirmModal) document.body.insertBefore(confirmModal, toastContainer ? toastContainer.nextSibling : document.body.firstChild);
    if (historyModalEl) document.body.appendChild(historyModalEl);
  }

  fullscreenBtn.addEventListener('click', () => {
    const screen = document.getElementById('student-screen');
    if (!document.fullscreenElement) {
      moveOverlaysIntoScreen();
      screen.requestFullscreen().catch(() => {
        // Fallback: CSS-only fullscreen
        screen.classList.toggle('fullscreen');
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const screen = document.getElementById('student-screen');
    if (document.fullscreenElement) {
      fullscreenBtn.textContent = '⛶ 전체 화면 종료';
    } else {
      fullscreenBtn.textContent = '⛶ 전체 화면';
      screen.classList.remove('fullscreen');
      moveOverlaysBack();
    }
  });

  // === 배치 기록 보기 ===
  const historyBtn = document.getElementById('btn-history');
  const historyModal = document.getElementById('history-modal');
  const historyCloseBtn = document.getElementById('btn-history-close');
  const historyList = document.getElementById('history-list');

  if (historyBtn && historyModal) {
    historyBtn.addEventListener('click', () => {
      const current = store.load();
      const history = current.assignmentHistory || [];
      const lastAssignment = current.lastAssignment;

      if (history.length === 0 && !lastAssignment) {
        historyList.innerHTML = '<p class="empty-text" style="padding:2rem;text-align:center;color:#94A3B8">저장된 배치 기록이 없습니다.<br>자리 뽑기를 하면 자동으로 기록됩니다.</p>';
      } else {
        let html = '';

        // 현재 배치
        if (lastAssignment && lastAssignment.mapping) {
          const date = new Date(lastAssignment.timestamp);
          const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
          const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const studentCount = Object.values(lastAssignment.mapping).filter(Boolean).length;
          html += `<div class="history-item current">
            <div class="history-badge">현재</div>
            <div class="history-info">
              <div class="history-date">${dateStr} ${timeStr}</div>
              <div class="history-detail">${studentCount}명 배치</div>
            </div>
          </div>`;
        }

        // 과거 기록 (최신순)
        for (let i = history.length - 1; i >= 0; i--) {
          const record = history[i];
          const date = new Date(record.timestamp);
          const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
          const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const studentCount = record.mapping ? Object.values(record.mapping).filter(Boolean).length : 0;
          html += `<div class="history-item" data-history-index="${i}">
            <div class="history-badge past">${history.length - i}회 전</div>
            <div class="history-info">
              <div class="history-date">${dateStr} ${timeStr}</div>
              <div class="history-detail">${studentCount}명 배치</div>
            </div>
            <button class="btn btn-sm btn-outline history-restore-btn" data-idx="${i}" title="이 배치로 복원">복원</button>
          </div>`;
        }

        historyList.innerHTML = html;

        // 복원 버튼 이벤트
        historyList.querySelectorAll('.history-restore-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const d = store.load();
            const hist = d.assignmentHistory || [];
            if (!hist[idx] || !hist[idx].mapping) return;
            store.update({ lastAssignment: { mapping: hist[idx].mapping, timestamp: hist[idx].timestamp } });
            currentAssignment = hist[idx].mapping;
            namesHidden = false;
            revealedSeats.clear();
            swapMode = false;
            swapFirstSeat = null;
            swapModeBtn.classList.remove('active');
            revealAllBtn.style.display = 'none';
            renderSeatGrid(container, d, hist[idx].mapping, { animate: true, teacherView: isTeacherView });
            attachSeatClickHandlers();
            drawBtn.style.display = 'none';
            redrawBtn.style.display = 'inline-flex';
            showResultToolbar(true);
            closeHistoryModal();
            showToast('이전 배치를 복원했습니다.', 'success');
          });
        });
      }

      historyModal.classList.add('active');
      historyModal._prevFocus = document.activeElement;
      historyModal._releaseTrap = trapFocus(historyModal);
    });

    function closeHistoryModal() {
      if (historyModal._releaseTrap) historyModal._releaseTrap();
      historyModal.classList.remove('active');
      if (historyModal._prevFocus) historyModal._prevFocus.focus();
    }

    historyCloseBtn.addEventListener('click', closeHistoryModal);

    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) closeHistoryModal();
    });

    historyModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHistoryModal();
    });
  }

  // 설정 변경 감지용 스냅샷
  let _lastSnapshot = '';
  function settingsSnapshot(d) {
    return JSON.stringify([d.students, d.layoutType, d.layoutSettings, d.genderRule, d.fixedSeats, d.separationRules]);
  }
  _lastSnapshot = settingsSnapshot(store.load());

  // 화면 진입 시 최신 데이터로 갱신
  function refreshFromStore() {
    const d = store.load();
    updateEmptyState(d);
    if (d.students.length === 0) return;

    const snap = settingsSnapshot(d);
    const settingsChanged = snap !== _lastSnapshot;
    _lastSnapshot = snap;

    if (settingsChanged) {
      // 교사 설정이 바뀌었으면 배치 결과 초기화
      currentAssignment = null;
      namesHidden = false;
      revealedSeats.clear();
      swapMode = false;
      swapFirstSeat = null;
      swapModeBtn.classList.remove('active');
      revealAllBtn.style.display = 'none';

      store.update({ lastAssignment: null });
      const rosterOrder = createRosterOrder(d);
      renderSeatGrid(container, d, rosterOrder, { teacherView: isTeacherView });
      drawBtn.style.display = 'inline-flex';
      redrawBtn.style.display = 'none';
      showResultToolbar(false);
    } else {
      // 설정이 동일하면 현재 상태 유지, 시선만 반영하여 재렌더
      reRenderCurrentView();
    }
  }

  // 탭 간 동기화
  store.initSync(refreshFromStore);

  // 화면 전환 시 갱신 함수 반환
  return { refresh: refreshFromStore };
}

/**
 * 슬롯머신 애니메이션
 */
function slotAnimation(container, data) {
  return new Promise(resolve => {
    const seats = container.querySelectorAll('.seat');
    const names = data.students;
    if (seats.length === 0 || names.length === 0) {
      resolve();
      return;
    }

    let frame = 0;
    const totalFrames = 15;
    const interval = setInterval(() => {
      seats.forEach(seat => {
        const nameEl = seat.querySelector('.seat-name');
        if (nameEl) {
          nameEl.textContent = names[Math.floor(Math.random() * names.length)];
          nameEl.style.opacity = '0.6';
          seat.style.background = frame % 2 === 0 ? 'var(--seat-highlight)' : 'var(--seat-empty)';
        }
      });
      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        seats.forEach(seat => {
          const nameEl = seat.querySelector('.seat-name');
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

/**
 * 배치 결과를 Canvas에 렌더링하여 이미지로 변환
 * @param {HTMLElement} container - 배치도 컨테이너 (이미 올바른 시선으로 렌더링된 상태)
 * @param {boolean} teacherView - 선생님 시선 여부 (제목/파일명용)
 */
function renderToCanvas(container, teacherView = false) {
  return new Promise((resolve) => {
    const blackboardEl = container.querySelector('.blackboard');
    const seats = container.querySelectorAll('.seat');
    if (seats.length === 0) {
      throw new Error('No seats');
    }

    const containerRect = container.getBoundingClientRect();
    const padding = 40;
    const titleHeight = 50;
    const canvasWidth = Math.max(containerRect.width + padding * 2, 600);
    const canvasHeight = containerRect.height + padding * 2 + titleHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * 2;
    canvas.height = canvasHeight * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Title
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    const dateStr = new Date().toLocaleDateString('ko-KR');
    const viewLabel = teacherView ? ' (선생님 시선)' : '';
    ctx.fillText(`자리 배치${viewLabel} - ${dateStr}`, canvasWidth / 2, 30);

    // Blackboard
    if (blackboardEl) {
      const bbRect = blackboardEl.getBoundingClientRect();
      const bbX = bbRect.left - containerRect.left + padding;
      const bbY = bbRect.top - containerRect.top + padding + titleHeight;
      const isPodium = blackboardEl.classList.contains('podium');
      ctx.fillStyle = isPodium ? '#4A3728' : '#2D5016';
      roundRect(ctx, bbX, bbY, bbRect.width, bbRect.height, 4);
      ctx.fill();
      ctx.fillStyle = isPodium ? '#F5E6D3' : '#D1FAE5';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(blackboardEl.textContent, bbX + bbRect.width / 2, bbY + bbRect.height / 2 + 5);
    }

    // Seats
    seats.forEach(seat => {
      const seatRect = seat.getBoundingClientRect();
      const x = seatRect.left - containerRect.left + padding;
      const y = seatRect.top - containerRect.top + padding + titleHeight;

      const isAssigned = seat.classList.contains('assigned');
      const isFixed = seat.classList.contains('fixed');
      ctx.fillStyle = isFixed ? '#FEF3C7' : isAssigned ? '#D1FAE5' : '#F1F5F9';
      ctx.strokeStyle = isFixed ? '#FCD34D' : isAssigned ? '#6EE7B7' : '#E2E8F0';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, seatRect.width, seatRect.height, 6);
      ctx.fill();
      ctx.stroke();

      const numEl = seat.querySelector('.seat-number');
      if (numEl) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(numEl.textContent, x + 4, y + 12);
      }

      const nameEl = seat.querySelector('.seat-name');
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

function roundRect(ctx, x, y, w, h, r) {
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
// 진입점: 해시 라우팅

let _teacherInited = false;
let _studentInited = false;
let _studentApi = null;

function route() {
  const hash = location.hash.replace('#', '') || 'teacher';
  const teacherEl = document.getElementById('teacher-screen');
  const studentEl = document.getElementById('student-screen');

  teacherEl.style.display = 'none';
  studentEl.style.display = 'none';

  if (hash === 'teacher') {
    teacherEl.style.display = 'block';
    if (!_teacherInited) {
      initTeacherScreen();
      _teacherInited = true;
    }
  } else {
    studentEl.style.display = 'block';
    if (!_studentInited) {
      _studentApi = initStudentScreen();
      _studentInited = true;
    } else if (_studentApi && _studentApi.refresh) {
      // 학생 화면 재진입 시 최신 교사 설정 반영
      _studentApi.refresh();
    }
  }
}

window.addEventListener('hashchange', () => route());

// 초기 로딩
route();

// === 접이식 카드 섹션 (모바일 UX) ===
function initCollapsibleCards() {
  const sections = document.querySelectorAll('.settings-panel .card');
  sections.forEach(section => {
    const h2 = section.querySelector('h2');
    if (!h2) return;

    section.classList.add('card-collapsible');

    // h2를 card-header로 래핑
    const header = document.createElement('div');
    header.className = 'card-header';
    h2.parentNode.insertBefore(header, h2);
    header.appendChild(h2);

    // 접기 아이콘 추가
    const icon = document.createElement('svg');
    icon.classList.add('collapse-icon');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
    header.appendChild(icon);

    // 나머지 콘텐츠를 card-body로 래핑
    const body = document.createElement('div');
    body.className = 'card-body';
    while (section.children.length > 1) {
      body.appendChild(section.children[1]);
    }
    section.appendChild(body);

    // 클릭 토글
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
  });
}
initCollapsibleCards();

// === 스텝 완료 표시 ===
function updateStepBadges() {
  try {
    const key = 'seat-changer-data-' + (localStorage.getItem('seat-changer-active') || '1반');
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);

    const checks = {
      'roster-section': data.students && data.students.length > 0,
      'layout-section': true, // 항상 기본값 있음
      'fixed-section': data.fixedSeats && data.fixedSeats.length > 0,
      'constraint-section': data.separationRules && data.separationRules.length > 0,
      'gender-rule-section': data.genderRule && data.genderRule !== 'none',
      'history-section': data.useHistoryExclusion !== false
    };

    Object.entries(checks).forEach(([sectionId, done]) => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const badge = section.querySelector('.step-badge');
      if (!badge) return;
      if (done) {
        badge.style.background = 'var(--success)';
        badge.textContent = '✓';
      } else {
        // 원래 숫자로 복원
        const idx = badge.getAttribute('data-step');
        if (idx) {
          badge.style.background = '';
          badge.textContent = idx;
        }
      }
    });
  } catch {}
}

// step-badge에 원래 숫자 저장
document.querySelectorAll('.step-badge').forEach(badge => {
  badge.setAttribute('data-step', badge.textContent.trim());
});

// 초기 업데이트 + 변경 감지
updateStepBadges();
window.addEventListener('storage', updateStepBadges);
// store 변경 시에도 (같은 탭)
const origSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  origSetItem.call(this, key, value);
  if (key.startsWith('seat-changer-data')) {
    setTimeout(updateStepBadges, 50);
  }
};

})();
