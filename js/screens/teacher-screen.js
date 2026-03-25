// 교사 설정 화면 로직
import { store } from '../data/store.js';
import { getTotalSeats } from '../data/models.js';
import { initRoster } from '../components/student-roster.js';
import { initFixedSeatEditor } from '../components/fixed-seat-editor.js';
import { initConstraintEditor } from '../components/constraint-editor.js';
import { renderSeatGrid } from '../components/seat-grid.js';
import { randomizeSeats } from '../algorithm/seat-randomizer.js';
import { customLayout } from '../layouts/custom-layout.js';
import { getLayout } from '../components/seat-grid.js';
import { showToast, showConfirm } from '../utils/toast.js';

function verifyAssignment(result, data) {
  const layout = getLayout(data.layoutType);
  const positions = layout.getSeatPositions(data.layoutSettings);
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  const violations = [];

  // 고정 자리 검증
  for (const fs of data.fixedSeats) {
    if (!data.students.includes(fs.studentName)) continue;
    if (result[fs.seatIndex] !== fs.studentName) {
      violations.push(`고정 자리 위반: ${fs.studentName} → ${fs.seatIndex + 1}번 자리`);
    }
  }

  // 분리 규칙 검증
  for (const rule of data.separationRules) {
    let seatA = null, seatB = null;
    for (const [seat, name] of Object.entries(result)) {
      if (name === rule.studentA) seatA = Number(seat);
      if (name === rule.studentB) seatB = Number(seat);
    }
    if (seatA !== null && seatB !== null) {
      const posA = posMap[seatA];
      const posB = posMap[seatB];
      if (posA && posB) {
        const dist = layout.distance(posA, posB);
        if (dist <= rule.minDistance) {
          violations.push(`분리 위반: ${rule.studentA} ↔ ${rule.studentB} (거리 ${dist}, 최소 ${rule.minDistance})`);
        }
      }
    }
  }

  return violations;
}

export function initTeacherScreen() {
  initRoster();

  const previewTitle = document.getElementById('preview-title');
  const seatGrid = document.getElementById('teacher-seat-grid');
  const customEditor = document.getElementById('custom-editor');
  const viewToggleBtnTeacher = document.getElementById('btn-toggle-view-teacher');

  // === 시선 전환 (교사 미리보기) ===
  let isTeacherViewPreview = store.load().viewPerspective === 'teacher';
  let currentPreviewAssignment = null; // 미리보기에 표시 중인 배치 결과

  function updateTeacherToggleBtn() {
    viewToggleBtnTeacher.classList.toggle('active', isTeacherViewPreview);
    viewToggleBtnTeacher.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${isTeacherViewPreview ? '선생님 시선' : '학생 시선'}`;
  }
  updateTeacherToggleBtn();

  viewToggleBtnTeacher.addEventListener('click', () => {
    isTeacherViewPreview = !isTeacherViewPreview;
    store.update({ viewPerspective: isTeacherViewPreview ? 'teacher' : 'student' });
    updateTeacherToggleBtn();
    refreshPreview();
  });

  function refreshPreview() {
    const data = store.load();
    const assignment = currentPreviewAssignment || data.lastAssignment?.mapping || null;

    if (data.layoutType === 'custom') {
      // 자유배치: 캔버스 편집기를 우측에, 미리보기 그리드 숨기기
      seatGrid.style.display = 'none';
      customEditor.style.display = 'block';
      previewTitle.textContent = '자유배치 편집기';
    } else {
      // 일반 배치: 그리드 미리보기
      seatGrid.style.display = 'block';
      customEditor.style.display = 'none';
      previewTitle.textContent = '배치도 미리보기';
      renderSeatGrid(seatGrid, data, assignment, {
        fixedSeats: data.fixedSeats,
        teacherView: isTeacherViewPreview
      });
    }
    checkSeatWarning();
    updateCustomStatus();
  }

  function checkSeatWarning() {
    const data = store.load();
    const warningEl = document.getElementById('seat-warning');
    const totalSeats = getTotalSeats(data);
    const studentCount = data.students.length;

    if (studentCount === 0 || totalSeats === 0) {
      warningEl.style.display = 'none';
      return;
    }

    if (studentCount > totalSeats) {
      warningEl.style.display = 'flex';
      warningEl.textContent = `학생 수(${studentCount}명)가 좌석 수(${totalSeats}석)보다 많습니다. 좌석을 추가하거나 명단을 조정하세요.`;
    } else if (totalSeats - studentCount > totalSeats * 0.5) {
      warningEl.style.display = 'flex';
      warningEl.textContent = `좌석(${totalSeats}석)이 학생 수(${studentCount}명)보다 많이 남습니다. 행/열 수를 조정해 보세요.`;
    } else {
      warningEl.style.display = 'none';
    }
  }

  // 자유배치 상태바 업데이트
  function updateCustomStatus() {
    const data = store.load();
    const deskCountEl = document.getElementById('desk-count');
    const studentCountEl = document.getElementById('custom-student-count');
    const warningEl = document.getElementById('custom-seat-warning');
    if (!deskCountEl) return;

    const deskCount = (data.layoutSettings.customDesks || []).length;
    const studentCount = data.students.length;
    deskCountEl.textContent = deskCount;
    studentCountEl.textContent = studentCount;

    if (data.layoutType !== 'custom' || studentCount === 0 || deskCount === 0) {
      warningEl.style.display = 'none';
      return;
    }

    warningEl.style.display = 'block';
    if (studentCount > deskCount) {
      warningEl.className = 'custom-seat-warning warning-over';
      warningEl.textContent = `책상이 ${studentCount - deskCount}개 부족합니다`;
    } else if (deskCount > studentCount) {
      warningEl.className = 'custom-seat-warning warning-under';
      warningEl.textContent = `빈 책상이 ${deskCount - studentCount}개 남습니다`;
    } else {
      warningEl.className = 'custom-seat-warning warning-ok';
      warningEl.textContent = `딱 맞습니다!`;
    }
  }

  initFixedSeatEditor(refreshPreview);
  initConstraintEditor();

  // 배치 유형 탭
  const tabs = document.querySelectorAll('.layout-tabs .tab');
  const gridOptions = document.getElementById('grid-options');
  const customOptions = document.getElementById('custom-options');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const type = tab.dataset.layout;

      if (type === 'custom') {
        gridOptions.style.display = 'none';
        customOptions.style.display = 'block';
        initCustomCanvas();
      } else {
        gridOptions.style.display = 'flex';
        customOptions.style.display = 'none';
      }

      store.update({ layoutType: type });
      refreshPreview();
    });
  });

  // 초기 탭 상태 로드
  const data = store.load();
  const activeTab = document.querySelector(`.tab[data-layout="${data.layoutType}"]`);
  if (activeTab) {
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    activeTab.classList.add('active');
    activeTab.setAttribute('aria-selected', 'true');
    if (data.layoutType === 'custom') {
      gridOptions.style.display = 'none';
      customOptions.style.display = 'block';
    }
  }

  // 행/열 설정
  const colInput = document.getElementById('col-count');
  const rowInput = document.getElementById('row-count');
  colInput.value = data.layoutSettings.columns;
  rowInput.value = data.layoutSettings.rows;

  let previewDebounce = null;
  function onGridChange() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => {
      const current = store.load();
      const cols = parseInt(colInput.value) || 6;
      const rows = parseInt(rowInput.value) || 5;
      store.update({
        layoutSettings: {
          ...current.layoutSettings,
          columns: Math.max(1, Math.min(12, cols)),
          rows: Math.max(1, Math.min(12, rows))
        }
      });
      refreshPreview();
    }, 300);
  }
  colInput.addEventListener('input', onGridChange);
  rowInput.addEventListener('input', onGridChange);

  // 배치 저장
  document.getElementById('btn-save-layout').addEventListener('click', () => {
    const current = store.load();
    const cols = parseInt(colInput.value) || 6;
    const rows = parseInt(rowInput.value) || 5;
    store.update({
      layoutSettings: {
        ...current.layoutSettings,
        columns: Math.max(1, Math.min(12, cols)),
        rows: Math.max(1, Math.min(12, rows))
      }
    });
    refreshPreview();
    showToast('배치가 저장되었습니다.', 'success');
  });

  // 자유배치 캔버스
  function initCustomCanvas() {
    const canvas = document.getElementById('custom-canvas');
    const current = store.load();
    customLayout.init(canvas, current.layoutSettings.customDesks || [], (desks) => {
      const d = store.load();
      store.update({
        layoutSettings: { ...d.layoutSettings, customDesks: desks }
      });
      updateCustomStatus();
    });
  }

  document.getElementById('btn-add-desk').addEventListener('click', () => {
    customLayout.addDesk();
  });

  document.getElementById('btn-add-desks-auto').addEventListener('click', () => {
    const current = store.load();
    const count = current.students.length;
    if (count === 0) {
      showToast('학생 명단을 먼저 입력하세요.', 'warning');
      return;
    }
    customLayout.addDesks(count);
    showToast(`${count}개 책상을 자동 배치했습니다.`, 'success');
  });

  document.getElementById('btn-undo-desk').addEventListener('click', () => {
    customLayout.undo();
  });
  document.getElementById('btn-redo-desk').addEventListener('click', () => {
    customLayout.redo();
  });
  document.getElementById('btn-delete-desk').addEventListener('click', () => {
    customLayout.deleteSelected();
  });

  document.getElementById('btn-clear-desks').addEventListener('click', async () => {
    const current = store.load();
    const deskCount = (current.layoutSettings.customDesks || []).length;
    if (deskCount === 0) return;
    const confirmed = await showConfirm(`책상 ${deskCount}개를 모두 삭제합니다.\n정말 삭제하시겠어요?`);
    if (!confirmed) return;
    customLayout.clearDesks();
    showToast('모든 책상이 삭제되었습니다.', 'info');
  });

  // 미리 뽑기 테스트
  document.getElementById('btn-preview-randomize').addEventListener('click', () => {
    const current = store.load();

    if (current.students.length === 0) {
      showToast('학생 명단을 먼저 입력하세요.', 'warning');
      return;
    }

    const totalSeats = getTotalSeats(current);
    if (current.students.length > totalSeats) {
      showToast(`학생 수(${current.students.length}명)가 좌석 수(${totalSeats}석)보다 많습니다.`, 'error');
      return;
    }

    const result = randomizeSeats(current);
    if (result) {
      // 미리보기 전용: store에 저장하지 않음 (학생 화면에 넘어가지 않음)
      currentPreviewAssignment = result;
      if (current.layoutType === 'custom') {
        seatGrid.style.display = 'block';
      }
      renderSeatGrid(seatGrid, current, result, { fixedSeats: current.fixedSeats, animate: true, teacherView: isTeacherViewPreview });

      // 결과 검증
      const violations = verifyAssignment(result, current);
      if (violations.length > 0) {
        showToast(`규칙 위반 ${violations.length}건: ${violations.join(' / ')}`, 'error', 5000);
      } else {
        const checks = [];
        if (current.fixedSeats.length > 0) checks.push(`고정 ${current.fixedSeats.length}건`);
        if (current.separationRules.length > 0) checks.push(`분리 ${current.separationRules.length}건`);
        const detail = checks.length > 0 ? ` (${checks.join(', ')} 적용됨)` : '';
        showToast(`테스트 배치 완료!${detail}`, 'success');
      }
    } else {
      showToast('자리 배치에 실패했습니다. 분리 규칙이 충돌할 수 있습니다.', 'error', 3500);
    }
  });

  // 내보내기/가져오기
  document.getElementById('btn-export').addEventListener('click', () => {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `자리배치_설정_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('설정을 내보냈습니다.', 'success');
  });

  const importInput = document.getElementById('import-file');
  document.getElementById('btn-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);

        if (parsed.type === 'seat-result') {
          store.update({
            students: parsed.students || [],
            classSize: (parsed.students || []).length,
            layoutType: parsed.layoutType || 'exam',
            layoutSettings: parsed.layoutSettings || { columns: 6, rows: 5, customDesks: [] },
            fixedSeats: parsed.fixedSeats || [],
            separationRules: parsed.separationRules || [],
            lastAssignment: parsed.assignment
              ? { mapping: parsed.assignment, timestamp: parsed.timestamp || Date.now() }
              : null
          });
          showToast('이전 배치 결과를 불러왔습니다.', 'success');
          location.reload();
          return;
        }

        if (store.importJSON(reader.result)) {
          showToast('설정을 가져왔습니다.', 'success');
          location.reload();
        } else {
          showToast('잘못된 설정 파일입니다.', 'error');
        }
      } catch {
        showToast('파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // === 성별 규칙 초기화 ===
  const genderRuleRadios = document.querySelectorAll('input[name="gender-rule"]');
  const savedGenderRule = data.genderRule || 'none';
  genderRuleRadios.forEach(radio => {
    if (radio.value === savedGenderRule) radio.checked = true;
    radio.addEventListener('change', () => {
      store.update({ genderRule: radio.value });
    });
  });

  // === 이전 자리 방지 초기화 ===
  const historyCheckbox = document.getElementById('use-history-exclusion');
  const historyCountSelect = document.getElementById('history-exclude-count');
  const historyInfo = document.getElementById('history-info');
  const clearHistoryBtn = document.getElementById('btn-clear-history');

  historyCheckbox.checked = data.useHistoryExclusion !== false;
  historyCountSelect.value = data.historyExcludeCount || 1;

  function updateHistoryInfo() {
    const d = store.load();
    const count = (d.assignmentHistory || []).length;
    historyInfo.textContent = `저장된 기록: ${count}건`;
  }
  updateHistoryInfo();

  historyCheckbox.addEventListener('change', () => {
    store.update({ useHistoryExclusion: historyCheckbox.checked });
  });
  historyCountSelect.addEventListener('change', () => {
    store.update({ historyExcludeCount: parseInt(historyCountSelect.value) });
  });
  clearHistoryBtn.addEventListener('click', () => {
    store.update({ assignmentHistory: [] });
    updateHistoryInfo();
    showToast('기록이 초기화되었습니다.', 'info');
  });

  window.addEventListener('roster-updated', () => {
    refreshPreview();
    updateCustomStatus();
  });

  refreshPreview();

  if (data.layoutType === 'custom') {
    setTimeout(initCustomCanvas, 0);
  }
}
