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

    store.update({
      students: uniqueNames,
      classSize: uniqueNames.length,
      fixedSeats: store.load().fixedSeats.filter(f => uniqueNames.includes(f.studentName)),
      separationRules: store.load().separationRules.filter(
        r => uniqueNames.includes(r.studentA) && uniqueNames.includes(r.studentB)
      )
    });
    countEl.textContent = `${uniqueNames.length}명`;
    window.dispatchEvent(new CustomEvent('roster-updated'));
    showToast(`${uniqueNames.length}명의 학생 명단이 저장되었습니다.`, 'success');
  });
}
