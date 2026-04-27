// 분리 규칙 편집 컴포넌트
import { store } from '../data/store.js';
import { validateSeparationRule } from '../data/models.js';
import { showToast } from '../utils/toast.js';

export function initConstraintEditor() {
  const selectA = document.getElementById('sep-student-a');
  const bToggle = document.getElementById('sep-student-b-toggle');
  const bDropdown = document.getElementById('sep-student-b-dropdown');
  const list = document.getElementById('sep-rule-list');

  // 모달 backdrop 1회 생성
  let backdrop = document.getElementById('multi-select-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'multi-select-backdrop';
    backdrop.className = 'multi-select-backdrop';
    document.body.appendChild(backdrop);
  }

  function openDropdown() {
    if (!selectA.value) {
      showToast('먼저 기준 학생을 선택해 주세요.', 'warning');
      return;
    }
    bDropdown.classList.add('open');
    backdrop.classList.add('open');
    const searchEl = bDropdown.querySelector('.multi-select-search');
    if (searchEl) setTimeout(() => searchEl.focus(), 0);
  }

  function applyRules() {
    const data = store.load();
    const studentA = selectA.value;
    if (!studentA) return;

    const selectedEntries = getSelectedStudentsWithDist(bDropdown);
    if (selectedEntries.length === 0) {
      showToast('분리할 학생을 1명 이상 선택해 주세요.', 'warning');
      return;
    }

    let addedCount = 0;
    let updatedCount = 0;
    for (const entry of selectedEntries) {
      const rule = { studentA, studentB: entry.name, minDistance: entry.minDistance };
      if (!validateSeparationRule(rule, data.students)) continue;

      const existingIdx = data.separationRules.findIndex(
        r => (r.studentA === studentA && r.studentB === entry.name) ||
             (r.studentA === entry.name && r.studentB === studentA)
      );

      if (existingIdx >= 0) {
        // 이미 있는 규칙 — 칸 수가 달라졌으면 업데이트
        if (data.separationRules[existingIdx].minDistance !== entry.minDistance) {
          data.separationRules[existingIdx].minDistance = entry.minDistance;
          updatedCount++;
        }
      } else {
        data.separationRules.push(rule);
        addedCount++;
      }
    }

    if (addedCount === 0 && updatedCount === 0) {
      showToast('변경된 내용이 없습니다.', 'info');
      return;
    }

    store.update({ separationRules: data.separationRules });
    renderConstraintList(list, store.load().separationRules);

    const parts = [];
    if (addedCount > 0) parts.push(`${addedCount}개 추가`);
    if (updatedCount > 0) parts.push(`${updatedCount}개 업데이트`);
    showToast(`분리 규칙 ${parts.join(', ')}되었습니다.`, 'success');
  }

  function closeDropdown() {
    bDropdown.classList.remove('open');
    backdrop.classList.remove('open');
  }

  function refresh() {
    const data = store.load();
    populateConstraintSelect(selectA, data.students);
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
    renderConstraintList(list, data.separationRules);
  }

  bToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (bDropdown.classList.contains('open')) closeDropdown();
    else openDropdown();
  });

  backdrop.addEventListener('click', closeDropdown);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bDropdown.classList.contains('open')) closeDropdown();
  });

  // 위임 핸들러: × 닫기 / 선택 완료(→ 규칙 즉시 반영 후 닫기)
  bDropdown.addEventListener('click', (e) => {
    if (e.target.closest('.multi-select-close')) {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
    } else if (e.target.closest('.multi-select-done')) {
      e.preventDefault();
      e.stopPropagation();
      applyRules();
      closeDropdown();
    }
  });

  selectA.addEventListener('change', () => {
    const data = store.load();
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
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
  const defaultDist = 2;

  // 기존 분리 규칙 로드 (pre-check용)
  const existingRules = store.load().separationRules || [];

  // 헤더 (제목 + 닫기 X + 검색 + 안내)
  const header = document.createElement('div');
  header.className = 'multi-select-header';
  header.innerHTML = `
    <div class="multi-select-titlebar">
      <strong class="multi-select-title">분리할 학생 고르기</strong>
      <button type="button" class="multi-select-close" aria-label="닫기">×</button>
    </div>
    <input type="text" class="multi-select-search" placeholder="학생 이름 검색..." aria-label="학생 검색">
    <p class="multi-select-hint"><strong>체크박스를 눌러</strong> 분리할 학생을 고르고 칸 수를 지정하세요. <strong>1칸</strong> = 바로 옆/대각선 모두 금지, <strong>2칸</strong> = 한 자리 건너뛰기까지 금지. "선택 완료"를 누르면 바로 적용됩니다.</p>
    <div class="multi-select-actions">
      <button type="button" class="ms-select-all">보이는 학생 전체 선택</button>
      <button type="button" class="ms-clear">선택 모두 해제</button>
      <span class="ms-count">선택 0 / ${filtered.length}</span>
    </div>`;
  dropdown.appendChild(header);
  header.addEventListener('click', e => e.stopPropagation());

  // 항목 컨테이너
  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'multi-select-items';
  dropdown.appendChild(itemsWrap);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ms-empty';
    empty.textContent = '학생이 없습니다. 명단을 먼저 입력해 주세요.';
    itemsWrap.appendChild(empty);
    appendFooter(dropdown);
    toggle.textContent = '분리할 학생 선택';
    toggle.classList.remove('has-selection');
    return;
  }

  filtered.forEach(s => {
    const label = document.createElement('label');
    label.className = 'multi-select-item';
    label.dataset.name = s;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = s;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'multi-select-name';
    nameSpan.textContent = s;

    // 기존 규칙 확인 — 있으면 pre-check + 칸 수 채우기
    const existingRule = existingRules.find(
      r => (r.studentA === excludeStudent && r.studentB === s) ||
           (r.studentA === s && r.studentB === excludeStudent)
    );
    const initDist = existingRule ? existingRule.minDistance : defaultDist;
    const initChecked = !!existingRule;

    // 학생별 거리 입력
    const distWrap = document.createElement('span');
    distWrap.className = 'ms-dist-wrap';
    distWrap.innerHTML = `최소 <input type="number" class="ms-dist" min="1" max="5" value="${initDist}" ${initChecked ? '' : 'disabled'} aria-label="${s} 떨어뜨릴 칸 수"> 칸`;
    distWrap.addEventListener('click', e => e.stopPropagation());
    const distEl = distWrap.querySelector('.ms-dist');
    distEl.addEventListener('input', () => {
      const v = clampDist(distEl.value);
      if (String(v) !== distEl.value) distEl.value = v;
    });

    if (initChecked) {
      cb.checked = true;
      // 기존 규칙 항목 시각 구분
      label.classList.add('has-rule');
    }

    cb.addEventListener('change', () => {
      distEl.disabled = !cb.checked;
      if (cb.checked && (!distEl.value || distEl.value === '')) distEl.value = defaultDist;
      updateToggleText(dropdown, toggle);
      updateCount(dropdown);
    });

    label.appendChild(cb);
    label.appendChild(nameSpan);
    label.appendChild(distWrap);
    itemsWrap.appendChild(label);
  });

  // 검색 필터 — display 토글만, 절대 자동 선택 안 함
  const searchInput = header.querySelector('.multi-select-search');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;
    itemsWrap.querySelectorAll('.multi-select-item').forEach(el => {
      const matches = !q || el.dataset.name.toLowerCase().includes(q);
      el.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });
    let empty = itemsWrap.querySelector('.ms-empty');
    if (visibleCount === 0 && !empty) {
      const e = document.createElement('div');
      e.className = 'ms-empty';
      e.textContent = '검색 결과 없음';
      itemsWrap.appendChild(e);
    } else if (visibleCount > 0 && empty) {
      empty.remove();
    }
  });
  searchInput.addEventListener('keydown', e => e.stopPropagation());

  // 전체 선택 / 해제 — 명시적 버튼 클릭에서만
  header.querySelector('.ms-select-all').addEventListener('click', () => {
    itemsWrap.querySelectorAll('.multi-select-item').forEach(el => {
      if (el.style.display === 'none') return;
      const cb = el.querySelector('input[type="checkbox"]');
      const dist = el.querySelector('.ms-dist');
      cb.checked = true;
      if (dist) {
        dist.disabled = false;
        if (!dist.value) dist.value = defaultDist;
      }
    });
    updateToggleText(dropdown, toggle);
    updateCount(dropdown);
  });
  header.querySelector('.ms-clear').addEventListener('click', () => {
    itemsWrap.querySelectorAll('.multi-select-item').forEach(el => {
      const cb = el.querySelector('input[type="checkbox"]');
      const dist = el.querySelector('.ms-dist');
      cb.checked = false;
      if (dist) dist.disabled = true;
    });
    updateToggleText(dropdown, toggle);
    updateCount(dropdown);
  });

  appendFooter(dropdown);

  // 초기 pre-check 상태 반영
  updateToggleText(dropdown, toggle);
  updateCount(dropdown);
}

function appendFooter(dropdown) {
  const footer = document.createElement('div');
  footer.className = 'multi-select-footer';
  footer.innerHTML = `<button type="button" class="btn btn-primary btn-sm multi-select-done">선택 완료</button>`;
  dropdown.appendChild(footer);
}

function clampDist(val) {
  const n = parseInt(val);
  if (!n || isNaN(n)) return 2;
  return Math.max(1, Math.min(5, n));
}

function updateCount(dropdown) {
  const countEl = dropdown.querySelector('.ms-count');
  if (!countEl) return;
  const total = dropdown.querySelectorAll('.multi-select-items .multi-select-item').length;
  const checked = dropdown.querySelectorAll('.multi-select-items input[type="checkbox"]:checked').length;
  countEl.textContent = `선택 ${checked} / ${total}`;
}

function getSelectedStudents(dropdown) {
  const checked = dropdown.querySelectorAll('.multi-select-items input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value);
}

function getSelectedStudentsWithDist(dropdown) {
  const checked = dropdown.querySelectorAll('.multi-select-items input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => {
    const item = cb.closest('.multi-select-item');
    const distEl = item ? item.querySelector('.ms-dist') : null;
    return { name: cb.value, minDistance: clampDist(distEl ? distEl.value : null) };
  });
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

  if (rules.length === 0) return;

  rules.forEach((rule, i) => {
    const li = document.createElement('li');
    li.className = 'sep-rule-item';
    li.innerHTML = `
      <div class="sep-rule-body">
        <span class="sep-student-badge">${escapeHtml(rule.studentA)}</span>
        <span class="sep-arrow">↔</span>
        <span class="sep-student-badge">${escapeHtml(rule.studentB)}</span>
        <span class="sep-dist-badge">최소 ${rule.minDistance}칸</span>
      </div>`;
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
