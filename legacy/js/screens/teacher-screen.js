// 교사 설정 화면 로직
import { store } from '../data/store.js';
import { getTotalSeats } from '../data/models.js';
import { initRoster } from '../components/student-roster.js';
import { initFixedSeatEditor, fixedSeatPicker } from '../components/fixed-seat-editor.js';
import { initConstraintEditor } from '../components/constraint-editor.js';
import { renderSeatGrid } from '../components/seat-grid.js';
import { randomizeSeats } from '../algorithm/seat-randomizer.js';
import { customLayout } from '../layouts/custom-layout.js';
import { enableGroupDrag } from '../layouts/group-layout.js';
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
  // === 반 관리 ===
  initClassManager();
  initRoster();

  const previewTitle = document.getElementById('preview-title');
  const seatGrid = document.getElementById('teacher-seat-grid');
  const customEditor = document.getElementById('custom-editor');
  const viewToggleBtnTeacher = document.getElementById('btn-toggle-view-teacher');

  // === 시선 전환 (교사 미리보기) ===
  let isTeacherViewPreview = store.load().viewPerspective === 'teacher';
  let currentPreviewAssignment = null;

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

  // === 빈 좌석 X 표시 + 삭제 ===
  function clearAllPending() {
    seatGrid.querySelectorAll('.seat.pending-delete').forEach(s => {
      s.classList.remove('pending-delete');
      const xx = s.querySelector('.seat-delete-x');
      if (xx) xx.remove();
    });
  }

  function deleteSeat(seatIndex) {
    const d = store.load();
    const next = Array.from(new Set([...(d.layoutSettings.disabledSeats || []), seatIndex]));
    const newFixed = (d.fixedSeats || []).filter(f => f.seatIndex !== seatIndex);
    store.update({
      layoutSettings: { ...d.layoutSettings, disabledSeats: next },
      fixedSeats: newFixed
    });
    currentPreviewAssignment = null;
    refreshPreview();
    showToast(`${seatIndex + 1}번 자리를 삭제했습니다.`, 'info', 1800);
  }

  function handleEmptySeatClickForDelete(seatIndex) {
    const el = seatGrid.querySelector(`.seat[data-seat="${seatIndex}"]`);
    if (!el) return;
    // 학생 이미 배정된 좌석/이미 삭제된 좌석은 대상 아님
    if (el.classList.contains('assigned') || el.classList.contains('disabled')) return;
    // 토글
    if (el.classList.contains('pending-delete')) {
      clearAllPending();
      return;
    }
    clearAllPending();
    el.classList.add('pending-delete');
    const xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'seat-delete-x';
    xBtn.setAttribute('aria-label', `${seatIndex + 1}번 자리 삭제`);
    xBtn.textContent = '✕';
    // X 버튼 직접 핸들러 — stopPropagation으로 좌석 클릭(토글)까지 버블 차단
    xBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteSeat(seatIndex);
    });
    // mousedown도 차단 (capture 단계 좌석 핸들러 영향 방지)
    xBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    el.appendChild(xBtn);
  }

  // 외부 클릭 시 pending 해제 (한 번 등록)
  let _pendingOutsideHandlerInstalled = false;
  function attachDeletePendingHandlers() {
    if (_pendingOutsideHandlerInstalled) return;
    _pendingOutsideHandlerInstalled = true;
    document.addEventListener('click', (e) => {
      if (!seatGrid.contains(e.target)) clearAllPending();
    });
  }

  function refreshPreview() {
    const data = store.load();
    const assignment = currentPreviewAssignment || data.lastAssignment?.mapping || null;

    seatGrid.style.display = 'none';
    customEditor.style.display = 'none';

    if (data.layoutType === 'custom') {
      customEditor.style.display = 'flex';
      previewTitle.textContent = '자유배치 편집기';
    } else {
      seatGrid.style.display = 'flex';
      previewTitle.textContent = data.layoutType === 'group' ? '모둠 배치 (드래그로 조정 가능)' : '배치도 미리보기';
      renderSeatGrid(seatGrid, data, assignment, {
        fixedSeats: data.fixedSeats,
        teacherView: isTeacherViewPreview,
        onSeatClick: (seatIndex) => {
          // 1) 학생이 선택돼 있으면: 고정자리 픽업 (기존 F1)
          if (fixedSeatPicker.isStudentSelected()) {
            fixedSeatPicker.pickFromSeat(seatIndex);
            return;
          }
          // 2) 그렇지 않으면: 빈 좌석에 X(삭제 후보) 토글
          handleEmptySeatClickForDelete(seatIndex);
        }
      });
      // 빈 좌석 외부 클릭 시 pending 해제 (1회 등록)
      attachDeletePendingHandlers();
      // 모둠대형: 미리보기에서 드래그 활성화
      if (data.layoutType === 'group' && !isTeacherViewPreview) {
        enableGroupDrag(seatGrid, data.layoutSettings, (positions) => {
          const d = store.load();
          store.update({
            layoutSettings: { ...d.layoutSettings, groupPositions: positions }
          });
        });
      }
    }
    checkSeatWarning();
    updateCustomStatus();
    updateGroupHistorySection();
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
  const groupOptions = document.getElementById('group-options');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const type = tab.dataset.layout;

      gridOptions.style.display = 'none';
      customOptions.style.display = 'none';
      groupOptions.style.display = 'none';

      if (type === 'custom') {
        customOptions.style.display = 'block';
        initCustomCanvas();
      } else if (type === 'group') {
        groupOptions.style.display = 'flex';
      } else {
        gridOptions.style.display = 'flex';
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
    } else if (data.layoutType === 'group') {
      gridOptions.style.display = 'none';
      groupOptions.style.display = 'flex';
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

  // === 모둠 옵션 ===
  const groupSizeInput = document.getElementById('group-size');
  const groupCountInput = document.getElementById('group-count');
  const groupSizesEditor = document.getElementById('group-sizes-editor');

  function clampSize(n) { return Math.max(2, Math.min(8, parseInt(n) || 4)); }
  function clampCount(n) { return Math.max(1, Math.min(20, parseInt(n) || 1)); }

  // 현재 layoutSettings에서 모둠 인원 배열 도출 (없으면 count×size 균등 생성)
  function deriveSizes(settings) {
    const fallback = clampSize(settings.groupSize || 4);
    if (Array.isArray(settings.groupSizes) && settings.groupSizes.length > 0) {
      return settings.groupSizes.map(clampSize);
    }
    if (settings.groupCount && settings.groupCount > 0) {
      return Array.from({ length: clampCount(settings.groupCount) }, () => fallback);
    }
    // 폴백: 학생 수 ÷ groupSize
    const cols = settings.columns || 6;
    const rows = settings.rows || 5;
    const total = cols * rows;
    const c = Math.max(1, Math.ceil(total / fallback));
    return Array.from({ length: c }, () => fallback);
  }

  function renderGroupSizesEditor() {
    if (!groupSizesEditor) return;
    const d = store.load();
    const sizes = deriveSizes(d.layoutSettings);
    let html = '<div class="group-sizes-list">';
    sizes.forEach((s, i) => {
      html += `<label class="group-size-row"><span>${i + 1}모둠</span>
        <input type="number" class="group-size-each" data-index="${i}" min="1" max="8" value="${s}">명</label>`;
    });
    html += '</div>';
    const total = sizes.reduce((a, b) => a + b, 0);
    html += `<div class="group-sizes-total">총 좌석 <strong>${total}</strong>석 (${sizes.length}개 모둠)</div>`;
    groupSizesEditor.innerHTML = html;

    groupSizesEditor.querySelectorAll('.group-size-each').forEach(input => {
      input.addEventListener('input', () => {
        clearTimeout(previewDebounce);
        previewDebounce = setTimeout(() => {
          const current = store.load();
          const newSizes = deriveSizes(current.layoutSettings).slice();
          const idx = parseInt(input.dataset.index, 10);
          newSizes[idx] = clampSize(input.value);
          store.update({
            layoutSettings: {
              ...current.layoutSettings,
              groupSizes: newSizes,
              groupCount: newSizes.length,
              groupPositions: []
            }
          });
          renderGroupSizesEditor();
          refreshPreview();
        }, 300);
      });
    });
  }

  if (groupSizeInput) {
    groupSizeInput.value = data.layoutSettings.groupSize || 4;
    if (groupCountInput) {
      const initialSizes = deriveSizes(data.layoutSettings);
      groupCountInput.value = initialSizes.length;
    }

    groupSizeInput.addEventListener('input', () => {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(() => {
        const current = store.load();
        const groupSize = clampSize(groupSizeInput.value);
        const count = (current.layoutSettings.groupSizes || []).length
          || current.layoutSettings.groupCount
          || deriveSizes(current.layoutSettings).length;
        const newSizes = Array.from({ length: count }, () => groupSize);
        store.update({
          layoutSettings: {
            ...current.layoutSettings,
            groupSize,
            groupSizes: newSizes,
            groupCount: count,
            groupPositions: []
          }
        });
        renderGroupSizesEditor();
        refreshPreview();
      }, 300);
    });

    if (groupCountInput) {
      groupCountInput.addEventListener('input', () => {
        clearTimeout(previewDebounce);
        previewDebounce = setTimeout(() => {
          const current = store.load();
          const newCount = clampCount(groupCountInput.value);
          const fallbackSize = clampSize(current.layoutSettings.groupSize || 4);
          // 기존 모둠 인원 유지하면서 길이 조절
          const oldSizes = deriveSizes(current.layoutSettings);
          const newSizes = Array.from({ length: newCount }, (_, i) => oldSizes[i] != null ? oldSizes[i] : fallbackSize);
          store.update({
            layoutSettings: {
              ...current.layoutSettings,
              groupSizes: newSizes,
              groupCount: newCount,
              groupPositions: []
            }
          });
          renderGroupSizesEditor();
          refreshPreview();
        }, 300);
      });
    }

    // 배치 초기화 버튼 (드래그 조정 되돌리기)
    const btnGroupReset = document.getElementById('btn-group-reset');
    if (btnGroupReset) {
      btnGroupReset.addEventListener('click', () => {
        const current = store.load();
        store.update({
          layoutSettings: { ...current.layoutSettings, groupPositions: [] }
        });
        refreshPreview();
        showToast('모둠 배치가 초기화되었습니다.', 'info');
      });
    }

    // 초기 렌더
    renderGroupSizesEditor();
  }

  // === 모둠원 중복 방지 ===
  function updateGroupHistorySection() {
    const d = store.load();
    const section = document.getElementById('group-history-section');
    if (section) {
      section.style.display = d.layoutType === 'group' ? 'block' : 'none';
    }
  }

  const groupExclusionCheckbox = document.getElementById('use-group-exclusion');
  const groupExcludeCountSelect = document.getElementById('group-exclude-count');
  const groupHistoryInfo = document.getElementById('group-history-info');
  const clearGroupHistoryBtn = document.getElementById('btn-clear-group-history');

  if (groupExclusionCheckbox) {
    groupExclusionCheckbox.checked = data.useGroupExclusion !== false;
    groupExcludeCountSelect.value = data.groupExcludeCount || 1;

    function updateGroupHistoryInfo() {
      const d = store.load();
      const count = (d.groupHistory || []).length;
      groupHistoryInfo.textContent = `저장된 기록: ${count}건`;
    }
    updateGroupHistoryInfo();

    groupExclusionCheckbox.addEventListener('change', () => {
      store.update({ useGroupExclusion: groupExclusionCheckbox.checked });
    });
    groupExcludeCountSelect.addEventListener('change', () => {
      store.update({ groupExcludeCount: parseInt(groupExcludeCountSelect.value) });
    });
    clearGroupHistoryBtn.addEventListener('click', () => {
      store.update({ groupHistory: [] });
      updateGroupHistoryInfo();
      showToast('모둠 기록이 초기화되었습니다.', 'info');
    });
  }

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
    customLayout.init(
      canvas,
      current.layoutSettings.customDesks || [],
      (desks) => {
        const d = store.load();
        store.update({
          layoutSettings: { ...d.layoutSettings, customDesks: desks }
        });
        updateCustomStatus();
      },
      (seatIndex) => {
        // 학생이 선택돼 있으면 픽업, 아니면 일반 선택 동작 유지
        if (fixedSeatPicker.isStudentSelected()) {
          return fixedSeatPicker.pickFromSeat(seatIndex);
        }
        return false;
      }
    );
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
  document.getElementById('btn-preview-randomize').addEventListener('click', async () => {
    const btn = document.getElementById('btn-preview-randomize');
    const current = store.load();

    if (current.students.length === 0) {
      showToast('학생 명단을 먼저 입력하세요.', 'warning');
      return;
    }

    const totalSeats = getTotalSeats(current);
    if (totalSeats === 0) {
      if (current.layoutType === 'custom') {
        showToast('자유배치 책상이 없습니다. 먼저 책상을 추가하세요.', 'warning');
      } else {
        showToast('좌석이 설정되지 않았습니다. 레이아웃을 확인하세요.', 'warning');
      }
      return;
    }
    if (current.students.length > totalSeats) {
      showToast(`학생 수(${current.students.length}명)가 좌석 수(${totalSeats}석)보다 많습니다.`, 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '배치 중...';
    await new Promise(r => setTimeout(r, 0));

    const result = await randomizeSeats(current);
    btn.disabled = false;
    btn.textContent = '미리 뽑기 테스트';
    if (result) {
      currentPreviewAssignment = result;
      // 자유배치: 결과 표시를 위해 seat-grid를 보이게
      if (current.layoutType === 'custom') {
        seatGrid.style.display = 'flex';
      }
      renderSeatGrid(seatGrid, current, result, { fixedSeats: current.fixedSeats, animate: true, teacherView: isTeacherViewPreview });

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
    const className = store.getActiveClass();
    a.download = `자리배치_설정_${className}_${new Date().toISOString().slice(0, 10)}.json`;
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
          // importJSON으로 검증 경유 (seat-result도 동일한 검증 적용)
          const importData = { ...parsed };
          if (importData.assignment) {
            importData.lastAssignment = { mapping: importData.assignment, timestamp: importData.timestamp || Date.now() };
          }
          delete importData.type;
          delete importData.version;
          delete importData.assignment;
          delete importData.date;
          if (store.importJSON(JSON.stringify(importData))) {
            // lastAssignment는 importJSON이 null로 초기화하므로 별도 저장
            if (parsed.assignment) {
              store.update({ lastAssignment: { mapping: parsed.assignment, timestamp: parsed.timestamp || Date.now() } });
            }
            showToast('이전 배치 결과를 불러왔습니다.', 'success');
            location.reload();
          } else {
            showToast('잘못된 결과 파일입니다.', 'error');
          }
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
    // 학생 수 변경 시 모둠 커스텀 위치 초기화
    const d = store.load();
    if (d.layoutType === 'group' && d.layoutSettings.groupPositions && d.layoutSettings.groupPositions.length > 0) {
      store.update({ layoutSettings: { ...d.layoutSettings, groupPositions: [] } });
    }
    refreshPreview();
    updateCustomStatus();
  });

  refreshPreview();

  if (data.layoutType === 'custom') {
    setTimeout(initCustomCanvas, 0);
  }

  // 그리드 영역 드래그 리사이저
  initPreviewResizer();
}

// === 그리드 영역 상하 드래그 리사이즈 ===
const PREVIEW_GRID_HEIGHT_KEY = 'preview-grid-height';

function initPreviewResizer() {
  const resizer = document.getElementById('preview-resizer');
  const panel = document.querySelector('.preview-panel');
  const seatGrid = document.getElementById('teacher-seat-grid');
  const customEditor = document.getElementById('custom-editor');
  if (!resizer || !panel || !seatGrid || !customEditor) return;

  // 리사이저는 결과 그리드(seatGrid)에만 영향. 자유배치 캔버스는 자동 분배 유지.
  function applyHeight(h) {
    seatGrid.style.flex = `0 0 ${h}px`;
  }

  function getMaxHeight() {
    const panelRect = panel.getBoundingClientRect();
    const headerEl = panel.querySelector('.preview-header-row');
    const footerEl = panel.querySelector('.preview-actions');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const footerH = footerEl ? footerEl.getBoundingClientRect().height : 0;
    const resizerH = resizer.getBoundingClientRect().height;
    const cs = getComputedStyle(panel);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    // 패널 안에서 그리드가 차지할 수 있는 최대 = 패널 - 다른 모든 자식 - 패널 padding - 안전 마진
    const byPanel = panelRect.height - headerH - footerH - resizerH - padTop - padBottom - 8;
    // 푸터가 viewport 안에 들어가도록 추가 안전망
    const seatTop = seatGrid.getBoundingClientRect().top;
    const byViewport = window.innerHeight - seatTop - resizerH - footerH - 16;
    return Math.max(160, Math.min(byPanel, byViewport));
  }

  // 저장된 사용자 설정 복원 (max로 클램프)
  function restoreSaved() {
    const saved = parseInt(localStorage.getItem(PREVIEW_GRID_HEIGHT_KEY), 10);
    if (!saved || saved < 120) return;
    applyHeight(Math.min(saved, getMaxHeight()));
  }
  // 첫 layout이 안정화된 다음 프레임에 적용
  requestAnimationFrame(restoreSaved);

  // 윈도우 리사이즈 시 max를 넘는 부분 재클램프
  window.addEventListener('resize', () => {
    const cur = parseInt(seatGrid.style.flex?.match(/\d+/)?.[0]) || 0;
    if (cur > 0) {
      const safe = Math.min(cur, getMaxHeight());
      if (safe !== cur) applyHeight(safe);
    }
  });

  function getActiveGrid() {
    return seatGrid;
  }

  let dragging = false;
  let startY = 0;
  let startH = 0;

  function onDown(e) {
    e.preventDefault();
    dragging = true;
    resizer.classList.add('dragging');
    const t = e.touches ? e.touches[0] : e;
    startY = t.clientY;
    startH = getActiveGrid().getBoundingClientRect().height;
    document.body.style.cursor = 'ns-resize';
  }
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    const delta = t.clientY - startY;
    const newH = Math.max(120, Math.min(getMaxHeight(), startH + delta));
    applyHeight(newH);
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    const h = Math.round(getActiveGrid().getBoundingClientRect().height);
    localStorage.setItem(PREVIEW_GRID_HEIGHT_KEY, String(h));
  }

  resizer.addEventListener('mousedown', onDown);
  resizer.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);

  // 키보드 접근성: 위/아래 화살표로 ±20px 조절
  resizer.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const cur = getActiveGrid().getBoundingClientRect().height;
    const step = e.shiftKey ? 60 : 20;
    const next = Math.max(120, Math.min(getMaxHeight(), cur + (e.key === 'ArrowDown' ? step : -step)));
    applyHeight(next);
    localStorage.setItem(PREVIEW_GRID_HEIGHT_KEY, String(Math.round(next)));
  });

  // 더블클릭으로 기본값(자동) 복원
  resizer.addEventListener('dblclick', () => {
    seatGrid.style.flex = '';
    localStorage.removeItem(PREVIEW_GRID_HEIGHT_KEY);
  });
}

// === 반 관리 초기화 ===
function initClassManager() {
  const classSelect = document.getElementById('class-select');
  const addBtn = document.getElementById('btn-add-class');
  const renameBtn = document.getElementById('btn-rename-class');
  const deleteBtn = document.getElementById('btn-delete-class');

  function renderClassList() {
    const classes = store.getClassList();
    const active = store.getActiveClass();
    classSelect.innerHTML = '';
    classes.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === active) opt.selected = true;
      classSelect.appendChild(opt);
    });
  }

  renderClassList();

  classSelect.addEventListener('change', () => {
    store.switchClass(classSelect.value);
    location.reload();
  });

  addBtn.addEventListener('click', async () => {
    const classes = store.getClassList();
    if (classes.length >= 15) {
      showToast('최대 15개 반까지 만들 수 있습니다.', 'warning');
      return;
    }
    const name = prompt('새 반 이름을 입력하세요:');
    if (!name || name.trim().length === 0) return;
    if (store.addClass(name.trim())) {
      store.switchClass(name.trim());
      location.reload();
    } else {
      showToast('이미 같은 이름의 반이 있습니다.', 'warning');
    }
  });

  renameBtn.addEventListener('click', () => {
    const current = store.getActiveClass();
    const newName = prompt('새 이름을 입력하세요:', current);
    if (!newName || newName.trim().length === 0) return;
    if (store.renameClass(current, newName.trim())) {
      renderClassList();
      showToast(`'${newName.trim()}'(으)로 이름이 변경되었습니다.`, 'success');
    } else {
      showToast('이름 변경에 실패했습니다. 중복된 이름일 수 있습니다.', 'warning');
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const classes = store.getClassList();
    if (classes.length <= 1) {
      showToast('마지막 반은 삭제할 수 없습니다.', 'warning');
      return;
    }
    const current = store.getActiveClass();
    const confirmed = await showConfirm(`'${current}' 반을 삭제하시겠습니까?\n모든 설정이 삭제됩니다.`);
    if (!confirmed) return;
    if (store.removeClass(current)) {
      location.reload();
    }
  });
}
