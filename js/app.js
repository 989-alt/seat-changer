// 진입점: 해시 라우팅
import { initTeacherScreen } from './screens/teacher-screen.js';
import { initStudentScreen } from './screens/student-screen.js';

function route() {
  const hash = location.hash.replace('#', '') || 'teacher';
  const teacherEl = document.getElementById('teacher-screen');
  const studentEl = document.getElementById('student-screen');

  teacherEl.style.display = 'none';
  studentEl.style.display = 'none';

  if (hash === 'teacher') {
    teacherEl.style.display = 'block';
    initTeacherScreen();
  } else {
    studentEl.style.display = 'block';
    initStudentScreen();
  }
}

window.addEventListener('hashchange', () => {
  // 화면 전환 시 전체 재초기화
  route();
});

// 초기 로딩
route();
