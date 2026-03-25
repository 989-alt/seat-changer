// 진입점: 해시 라우팅
import { initTeacherScreen } from './screens/teacher-screen.js';
import { initStudentScreen } from './screens/student-screen.js';

let _teacherInited = false;
let _studentInited = false;

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
      initStudentScreen();
      _studentInited = true;
    }
  }
}

window.addEventListener('hashchange', () => route());

// 초기 로딩
route();
