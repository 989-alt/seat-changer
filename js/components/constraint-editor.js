// 분리 규칙 편집 컴포넌트
import { store } from '../data/store.js';
import { validateSeparationRule } from '../data/models.js';
import { showToast } from '../utils/toast.js';

export function initConstraintEditor() {
  const selectA = document.getElementById('sep-student-a');
  const bWrap = document.getElementById('sep-student-b-wrap');
  const bToggle = document.getElementById('sep-student-b-toggle');
  const bDropdown = document.getElementById('sep-student-b-dropdown');
  const distInput = document.getElementById('sep-distance');
  const addBtn = document.getElementById('btn-add-sep');
  const list = document.getElementById('sep-rule-list');

  function refresh() {
    const data = store.load();
    populateSelect(selectA, data.students);
    populateMultiSelect(bDropdown, bToggle, data.students, selectA.value);
    renderList(list, data.separationRules);
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

function populateSelect(select, students) {
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

function renderList(list, rules) {
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
      renderList(list, store.load().separationRules);
      showToast('규칙이 삭제되었습니다.', 'info');
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}
