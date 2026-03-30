// 고정 자리 편집 컴포넌트
import { store } from '../data/store.js';
import { getTotalSeats } from '../data/models.js';
import { showToast } from '../utils/toast.js';

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
