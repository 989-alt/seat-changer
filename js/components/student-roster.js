// 학생 명단 입력 컴포넌트
import { store } from '../data/store.js';
import { validateStudents } from '../data/models.js';
import { showToast } from '../utils/toast.js';
import { parseRosterFile } from '../utils/roster-parser.js';
import { escapeHTML } from '../layouts/layout-engine.js';

export function initRoster() {
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
