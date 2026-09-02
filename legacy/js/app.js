// 진입점: 해시 라우팅
import { initTeacherScreen } from './screens/teacher-screen.js';
import { initStudentScreen } from './screens/student-screen.js';

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
