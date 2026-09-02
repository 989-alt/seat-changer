// 고정 자리 편집 컴포넌트
import { store } from '../data/store.js';
import { getTotalSeats } from '../data/models.js';
import { showToast } from '../utils/toast.js';

// 외부(미리보기 좌석 클릭)에서 호출하기 위한 핸들. teacher-screen이 ref를 보관함.
export const fixedSeatPicker = {
  /** 학생이 선택돼 있으면 즉시 해당 좌석에 고정. 없으면 안내. true 반환 시 처리됨. */
  pickFromSeat(seatIndex) {
    const select = document.getElementById('fixed-student-select');
    if (!select) return false;
    if (!select.value) {
      showToast('먼저 고정할 학생을 선택해 주세요.', 'info', 2200);
      return false;
    }
    const seatInput = document.getElementById('fixed-seat-number');
    const addBtn = document.getElementById('btn-add-fixed');
    if (!seatInput || !addBtn) return false;
    seatInput.value = seatIndex + 1;
    addBtn.click();
    return true;
  },
  isStudentSelected() {
    const select = document.getElementById('fixed-student-select');
    return !!(select && select.value);
  }
};

export function initFixedSeatEditor(onUpdate) {
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

    // pick mode 시각 신호 (학생 선택 여부에 따라 body 클래스)
    document.body.classList.toggle('fixed-pick-mode', !!select.value);
  }

  // 학생 선택이 바뀌면 pick-mode 클래스도 바뀌도록
  select.addEventListener('change', () => {
    document.body.classList.toggle('fixed-pick-mode', !!select.value);
  });

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
