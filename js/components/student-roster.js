// 학생 명단 입력 컴포넌트
import { store } from '../data/store.js';
import { validateStudents } from '../data/models.js';
import { showToast } from '../utils/toast.js';

export function initRoster() {
  const textarea = document.getElementById('roster-input');
  const countEl = document.getElementById('student-count');
  const saveBtn = document.getElementById('btn-save-roster');

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
    data.students.forEach(name => {
      const g = genders[name] || '';
      html += `<div class="gender-row" data-student="${name}">
        <span class="gender-student-name">${name}</span>
        <label class="gender-radio"><input type="radio" name="gender-${name}" value="M" ${g === 'M' ? 'checked' : ''}> 남</label>
        <label class="gender-radio"><input type="radio" name="gender-${name}" value="F" ${g === 'F' ? 'checked' : ''}> 녀</label>
        <label class="gender-radio"><input type="radio" name="gender-${name}" value="" ${g === '' ? 'checked' : ''}> 미지정</label>
      </div>`;
    });
    genderListEl.innerHTML = html;

    // 성별 변경 이벤트
    genderListEl.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const d = store.load();
        const studentGenders = { ...(d.studentGenders || {}) };
        const studentName = radio.closest('.gender-row').dataset.student;
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
