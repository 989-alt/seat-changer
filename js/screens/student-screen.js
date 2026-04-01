// 학생 뽑기 화면 로직
import { store } from '../data/store.js';
import { renderSeatGrid, getTotalSeatsForLayout, getLayout } from '../components/seat-grid.js';
import { randomizeSeats } from '../algorithm/seat-randomizer.js';
import { showToast, showConfirm, trapFocus } from '../utils/toast.js';

function verifyStudentAssignment(result, data) {
  const layout = getLayout(data.layoutType);
  const positions = layout.getSeatPositions(data.layoutSettings);
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  const violations = [];

  for (const fs of data.fixedSeats) {
    if (!data.students.includes(fs.studentName)) continue;
    if (result[fs.seatIndex] !== fs.studentName) {
      violations.push(`고정 자리 위반: ${fs.studentName} → ${fs.seatIndex + 1}번 자리`);
    }
  }

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
          violations.push(`분리 위반: ${rule.studentA} ↔ ${rule.studentB}`);
        }
      }
    }
  }

  return violations;
}

export function initStudentScreen() {
  const container = document.getElementById('student-seat-grid');
  const drawBtn = document.getElementById('btn-draw');
  const redrawBtn = document.getElementById('btn-redraw');
  const emptyState = document.getElementById('student-empty-state');
  const toolbar = document.querySelector('.student-toolbar');
  const printBtn = document.getElementById('btn-print');
  const fullscreenBtn = document.getElementById('btn-fullscreen');
  const saveResultBtn = document.getElementById('btn-save-result');
  const saveImageBtn = document.getElementById('btn-save-image');
  const loadResultBtn = document.getElementById('btn-load-result');
  const resultImportFile = document.getElementById('result-import-file');
  const viewToggleBtn = document.getElementById('btn-toggle-view-student');

  const revealAllBtn = document.getElementById('btn-reveal-all');
  const swapModeBtn = document.getElementById('btn-swap-mode');

  // === 시선 전환 ===
  let isTeacherView = store.load().viewPerspective === 'teacher';
  let currentAssignment = null; // 현재 화면에 표시 중인 배치 결과

  // === 이름 가리기 상태 ===
  let namesHidden = false; // 현재 이름이 가려진 상태인지
  let revealedSeats = new Set(); // 개별 공개된 좌석 인덱스

  // === 자리 교환 상태 ===
  let swapMode = false;
  let swapFirstSeat = null;

  function updateToggleBtn() {
    viewToggleBtn.classList.toggle('active', isTeacherView);
    viewToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${isTeacherView ? '선생님 시선' : '학생 시선'}`;
  }
  updateToggleBtn();

  viewToggleBtn.addEventListener('click', () => {
    isTeacherView = !isTeacherView;
    store.update({ viewPerspective: isTeacherView ? 'teacher' : 'student' });
    updateToggleBtn();
    reRenderCurrentView();
  });

  function reRenderCurrentView() {
    const d = store.load();
    const assignment = currentAssignment || d.lastAssignment?.mapping || null;
    if (assignment) {
      renderSeatGrid(container, d, assignment, { teacherView: isTeacherView });
    } else if (d.students.length > 0) {
      renderSeatGrid(container, d, createRosterOrder(d), { teacherView: isTeacherView });
    }
    applyPostRenderState();
  }

  // 렌더링 후 이름 가리기/스왑 상태 재적용
  function applyPostRenderState() {
    if (namesHidden) {
      container.querySelectorAll('.seat.assigned').forEach(el => {
        const seatIdx = parseInt(el.dataset.seat);
        if (revealedSeats.has(seatIdx)) {
          // 이미 공개된 좌석: hidden-name 없이 정상 표시
        } else {
          applyFlipCard(el);
        }
      });
    }
    attachSeatClickHandlers();
  }

  // 좌석에 카드 뒤집기 DOM 구조 적용
  function applyFlipCard(el) {
    if (el.classList.contains('hidden-name')) return; // 이미 적용됨
    const name = el.querySelector('.seat-name')?.textContent || '';
    const number = el.querySelector('.seat-number')?.textContent || '';
    el.classList.add('hidden-name');

    // seat-inner > seat-front(?) + seat-back(이름) 구조 삽입
    const inner = document.createElement('div');
    inner.className = 'seat-inner';
    inner.innerHTML =
      `<div class="seat-front">?</div>` +
      `<div class="seat-back"><span class="seat-number">${number}</span><span class="seat-name">${name}</span></div>`;
    el.appendChild(inner);
  }

  // 좌석의 카드 뒤집기 DOM 제거 (공개 시)
  function removeFlipCard(el) {
    el.classList.remove('hidden-name', 'flipped');
    const inner = el.querySelector('.seat-inner');
    if (inner) inner.remove();
  }

  // 좌석 클릭 핸들러 (이름 공개 + 스왑)
  function attachSeatClickHandlers() {
    container.querySelectorAll('.seat[data-seat]').forEach(el => {
      el.addEventListener('click', () => {
        const seatIdx = parseInt(el.dataset.seat);
        const assignment = currentAssignment;
        if (!assignment) return;

        // 스왑 모드 처리: 첫 번째는 학생 있는 좌석, 두 번째는 빈 좌석도 가능
        if (swapMode) {
          if (swapFirstSeat === null && !assignment[seatIdx]) return; // 첫 선택은 학생 있는 자리만
          handleSwapClick(seatIdx, el);
          return;
        }

        // 이름 공개 처리: 클릭 시 뒤집기
        if (namesHidden && el.classList.contains('hidden-name') && !el.classList.contains('flipped')) {
          el.classList.add('flipped');
          revealedSeats.add(seatIdx);

          // 뒤집기 애니메이션 완료 후 DOM 정리
          setTimeout(() => {
            removeFlipCard(el);
            // 모든 이름이 공개되었는지 확인
            const hiddenCount = container.querySelectorAll('.seat.hidden-name:not(.flipped)').length;
            if (hiddenCount === 0) {
              namesHidden = false;
              revealAllBtn.style.display = 'none';
            }
          }, 550);
        }
      });
    });
  }

  // 스왑 클릭 처리
  function handleSwapClick(seatIdx, el) {
    if (swapFirstSeat === null) {
      // 첫 번째 좌석 선택
      swapFirstSeat = seatIdx;
      el.classList.add('swap-selected');
    } else if (swapFirstSeat === seatIdx) {
      // 같은 좌석 다시 클릭 → 선택 해제
      swapFirstSeat = null;
      el.classList.remove('swap-selected');
    } else {
      // 두 번째 좌석 선택 → 교환 실행
      const mapping = { ...currentAssignment };
      const nameA = mapping[swapFirstSeat] || null;
      const nameB = mapping[seatIdx] || null;

      // 빈자리 이동: A 학생을 빈자리로 옮김 (또는 두 학생 교환)
      if (nameA) mapping[seatIdx] = nameA; else delete mapping[seatIdx];
      if (nameB) mapping[swapFirstSeat] = nameB; else delete mapping[swapFirstSeat];

      const d = store.load();
      store.update({ lastAssignment: { mapping, timestamp: Date.now() } });
      currentAssignment = mapping;

      // 재렌더링
      renderSeatGrid(container, d, mapping, { teacherView: isTeacherView });
      applyPostRenderState();

      const labelA = nameA || '빈 자리';
      const labelB = nameB || '빈 자리';
      showToast(`${labelA} ↔ ${labelB} 자리를 바꿨습니다.`, 'success');
      swapFirstSeat = null;
    }
  }

  function updateEmptyState(data) {
    if (data.students.length === 0) {
      emptyState.style.display = 'block';
      container.style.display = 'none';
      drawBtn.style.display = 'none';
      toolbar.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      container.style.display = 'block';
    }
  }

  function showResultToolbar(visible) {
    toolbar.style.display = visible ? 'flex' : 'none';
  }

  // 명단 순서대로 기본 배치 생성
  function createRosterOrder(data) {
    const mapping = {};
    data.students.forEach((s, i) => { mapping[i] = s; });
    return mapping;
  }

  function renderCurrent(animate = false) {
    const data = store.load();
    const assignment = currentAssignment || data.lastAssignment?.mapping || null;
    renderSeatGrid(container, data, assignment, { animate, teacherView: isTeacherView });
  }

  // 초기 표시: 항상 명단 순서로 배치 (교사 미리보기 결과 무시)
  const data = store.load();
  updateEmptyState(data);

  if (data.students.length > 0) {
    // 학생 화면 진입 시 항상 명단 순서로 기초 배치 표시
    store.update({ lastAssignment: null });
    const rosterOrder = createRosterOrder(data);
    renderSeatGrid(container, data, rosterOrder, { teacherView: isTeacherView });
    drawBtn.style.display = 'inline-flex';
    redrawBtn.style.display = 'none';
    showResultToolbar(false);
  }

  // 자리 뽑기
  let _drawRunning = false;
  async function doDraw(isRedraw = false) {
    if (_drawRunning) return; // 이중 실행 방지
    _drawRunning = true;
    drawBtn.disabled = true;
    redrawBtn.disabled = true;

    try {
    const current = store.load();
    if (current.students.length === 0) {
      showToast('학생 명단이 없습니다. 교사 설정에서 명단을 입력하세요.', 'warning');
      return;
    }

    // 학생 수 vs 좌석 수 검증
    const totalSeats = getTotalSeatsForLayout(current);
    if (totalSeats === 0) {
      if (current.layoutType === 'custom') {
        showToast('자유배치 책상이 없습니다. 교사 설정에서 책상을 추가하세요.', 'warning');
      } else {
        showToast('좌석이 설정되지 않았습니다. 교사 설정을 확인하세요.', 'warning');
      }
      return;
    }
    if (current.students.length > totalSeats) {
      showToast(`학생 수(${current.students.length}명)가 좌석 수(${totalSeats}석)보다 많습니다.`, 'error');
      return;
    }

    // 다시 뽑기 시 확인
    if (isRedraw) {
      const confirmed = await showConfirm('현재 자리 배치 결과가 사라집니다.\n정말 다시 뽑으시겠어요?');
      if (!confirmed) return;
    }

    drawBtn.classList.add('loading');

    // 슬롯머신 애니메이션
    await slotAnimation(container, current);

    // 실제 배치 (비동기 - UI 블로킹 방지)
    const result = await randomizeSeats(current);
    if (!result) {
      showToast('자리 배치에 실패했습니다. 조건을 확인해 주세요.', 'error', 3500);
      return;
    }

    // 기록 저장: 현재 lastAssignment를 history에 push
    const prevAssignment = current.lastAssignment;
    const historyUpdate = {};
    if (prevAssignment && prevAssignment.mapping) {
      const history = [...(current.assignmentHistory || [])];
      history.push({
        mapping: prevAssignment.mapping,
        timestamp: prevAssignment.timestamp,
        date: new Date(prevAssignment.timestamp).toISOString().slice(0, 10)
      });
      // 최대 5개 유지
      while (history.length > 5) history.shift();
      historyUpdate.assignmentHistory = history;
    }

    // 모둠 히스토리 저장
    const groupHistoryUpdate = {};
    if (current.layoutType === 'group') {
      const groupSize = current.layoutSettings.groupSize || 4;
      const totalSeats = Object.keys(result).length;
      const groups = [];
      const groupCount = Math.ceil(totalSeats / groupSize);
      for (let g = 0; g < groupCount; g++) {
        const members = [];
        for (let s = g * groupSize; s < Math.min((g + 1) * groupSize, totalSeats); s++) {
          if (result[s]) members.push(result[s]);
        }
        if (members.length > 0) groups.push(members);
      }
      const gh = [...(current.groupHistory || [])];
      gh.push({ groups, timestamp: Date.now(), date: new Date().toISOString().slice(0, 10) });
      while (gh.length > 5) gh.shift();
      groupHistoryUpdate.groupHistory = gh;
    }

    // history fallback 확인
    const historyFallback = result._historyFallback;
    if (historyFallback) delete result._historyFallback;

    store.update({ lastAssignment: { mapping: result, timestamp: Date.now() }, ...historyUpdate, ...groupHistoryUpdate });
    currentAssignment = result;

    // 이름 가리기 상태 초기화
    namesHidden = true;
    revealedSeats.clear();
    swapMode = false;
    swapFirstSeat = null;
    swapModeBtn.classList.remove('active');

    // 결과 렌더링 (애니메이션 없이) + 즉시 ? 카드 적용
    renderSeatGrid(container, current, result, { animate: false, teacherView: isTeacherView });
    container.querySelectorAll('.seat.assigned').forEach(el => {
      applyFlipCard(el);
    });
    attachSeatClickHandlers();

    // ? 카드 등장 애니메이션 (staggered pop)
    const allCards = container.querySelectorAll('.seat.hidden-name');
    allCards.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.6)';
      el.style.transition = 'none';
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
        setTimeout(() => { el.style.transition = ''; el.style.transform = ''; }, 400);
      }, i * 50);
    });

    drawBtn.style.display = 'none';
    redrawBtn.style.display = 'inline-flex';
    revealAllBtn.style.display = 'inline-flex';
    drawBtn.disabled = false;
    redrawBtn.disabled = false;
    drawBtn.classList.remove('loading');
    showResultToolbar(true);

    // 결과 검증
    const violations = verifyStudentAssignment(result, current);
    if (violations.length > 0) {
      showToast(`규칙 위반 ${violations.length}건 발견`, 'error', 4000);
    } else if (historyFallback) {
      showToast('이전 자리를 완전히 피할 수 없어 일부 중복이 있을 수 있습니다. (기록 자동 저장됨)', 'warning', 4000);
    } else {
      const historyCount = (store.load().assignmentHistory || []).length;
      showToast(`자리 배치 완료! (기록 ${historyCount}건 저장됨)`, 'success');
    }
    } finally {
      _drawRunning = false;
      drawBtn.disabled = false;
      redrawBtn.disabled = false;
      drawBtn.classList.remove('loading');
    }
  }

  drawBtn.addEventListener('click', () => doDraw(false));
  redrawBtn.addEventListener('click', () => doDraw(true));

  // === 전체 공개 ===
  revealAllBtn.addEventListener('click', () => {
    if (!namesHidden) return;
    const hiddenSeats = container.querySelectorAll('.seat.hidden-name:not(.flipped)');
    hiddenSeats.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add('flipped');
        const seatIdx = parseInt(el.dataset.seat);
        revealedSeats.add(seatIdx);
        setTimeout(() => removeFlipCard(el), 550);
      }, i * 80);
    });
    setTimeout(() => {
      namesHidden = false;
      revealAllBtn.style.display = 'none';
    }, hiddenSeats.length * 80 + 600);
  });

  // === 자리 교환 모드 ===
  swapModeBtn.addEventListener('click', () => {
    if (!currentAssignment) return;
    swapMode = !swapMode;
    swapFirstSeat = null;
    swapModeBtn.classList.toggle('active', swapMode);

    // 스왑 모드 활성화 시 이름이 가려져 있으면 전체 공개
    if (swapMode && namesHidden) {
      revealAllBtn.click();
    }

    // 기존 swap-selected 제거
    container.querySelectorAll('.seat.swap-selected').forEach(el => {
      el.classList.remove('swap-selected');
    });

    if (swapMode) {
      showToast('교환할 첫 번째 학생의 자리를 클릭하세요.', 'info');
    }
  });

  // === 결과 저장 (JSON) ===
  saveResultBtn.addEventListener('click', () => {
    const current = store.load();
    if (!current.lastAssignment) {
      showToast('저장할 배치 결과가 없습니다.', 'warning');
      return;
    }

    const exportData = {
      version: 1,
      type: 'seat-result',
      timestamp: current.lastAssignment.timestamp,
      date: new Date(current.lastAssignment.timestamp).toISOString().slice(0, 10),
      students: current.students,
      layoutType: current.layoutType,
      layoutSettings: current.layoutSettings,
      fixedSeats: current.fixedSeats,
      separationRules: current.separationRules,
      assignment: current.lastAssignment.mapping
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `자리배치_결과_${exportData.date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('결과를 JSON 파일로 저장했습니다.', 'success');
  });

  // === 이미지 저장 ===
  saveImageBtn.addEventListener('click', async () => {
    const current = store.load();
    if (!current.lastAssignment) {
      showToast('저장할 배치 결과가 없습니다.', 'warning');
      return;
    }

    try {
      const canvas = await renderToCanvas(container, isTeacherView);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        const viewSuffix = isTeacherView ? '_선생님시선' : '';
        a.download = `자리배치${viewSuffix}_${dateStr}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('이미지로 저장했습니다.', 'success');
      }, 'image/png');
    } catch (err) {
      showToast('이미지 저장에 실패했습니다.', 'error');
    }
  });

  // === 결과 불러오기 ===
  loadResultBtn.addEventListener('click', () => resultImportFile.click());
  resultImportFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);

        // seat-result 형식 검증
        if (imported.type !== 'seat-result' || !imported.assignment) {
          showToast('올바른 자리 배치 결과 파일이 아닙니다.', 'error');
          return;
        }

        // importJSON으로 검증 경유
        const importData = { ...imported };
        delete importData.type;
        delete importData.version;
        delete importData.assignment;
        delete importData.date;
        if (!store.importJSON(JSON.stringify(importData))) {
          showToast('잘못된 결과 파일입니다.', 'error');
          return;
        }
        store.update({
          lastAssignment: {
            mapping: imported.assignment,
            timestamp: imported.timestamp || Date.now()
          }
        });

        const dateStr = imported.date || '(알 수 없음)';
        showToast(`${dateStr} 자리 배치를 불러왔습니다.`, 'success');

        // 화면 갱신
        currentAssignment = imported.assignment;
        namesHidden = false;
        revealedSeats.clear();
        swapMode = false;
        swapFirstSeat = null;
        swapModeBtn.classList.remove('active');
        revealAllBtn.style.display = 'none';
        renderCurrent(true);
        attachSeatClickHandlers();
        drawBtn.style.display = 'none';
        redrawBtn.style.display = 'inline-flex';
        showResultToolbar(true);
        updateEmptyState(store.load());
      } catch {
        showToast('파일을 읽을 수 없습니다.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  });

  // === 인쇄 (양면 보기: 학생 시선 + 선생님 시선) ===
  printBtn.addEventListener('click', () => {
    const printDual = document.getElementById('print-dual');
    const current = store.load();
    if (!current.lastAssignment) {
      window.print();
      return;
    }

    // 인쇄용 양면 보기 생성
    printDual.innerHTML = '';

    // 학생 시선
    const studentLabel = document.createElement('div');
    studentLabel.className = 'print-view-label';
    studentLabel.textContent = '[ 학생 시선 ]';
    printDual.appendChild(studentLabel);

    const studentContainer = document.createElement('div');
    studentContainer.className = 'seat-grid-container';
    renderSeatGrid(studentContainer, current, current.lastAssignment.mapping, { teacherView: false });
    printDual.appendChild(studentContainer);

    // 선생님 시선
    const teacherLabel = document.createElement('div');
    teacherLabel.className = 'print-view-label';
    teacherLabel.textContent = '[ 선생님 시선 ]';
    printDual.appendChild(teacherLabel);

    const teacherContainer = document.createElement('div');
    teacherContainer.className = 'seat-grid-container';
    renderSeatGrid(teacherContainer, current, current.lastAssignment.mapping, { teacherView: true });
    printDual.appendChild(teacherContainer);

    // 원본 배치도 숨기기
    container.classList.add('print-hidden');
    window.print();

    // 인쇄 후 정리 (afterprint 이벤트 사용)
    function cleanupPrint() {
      printDual.innerHTML = '';
      container.classList.remove('print-hidden');
      window.removeEventListener('afterprint', cleanupPrint);
    }
    window.addEventListener('afterprint', cleanupPrint, { once: true });
    // 폴백: afterprint 미지원 환경
    setTimeout(() => {
      if (container.classList.contains('print-hidden')) cleanupPrint();
    }, 5000);
  });

  // === 전체 화면 ===
  const toastContainer = document.getElementById('toast-container');
  const confirmModal = document.getElementById('confirm-modal');
  const historyModalEl = document.getElementById('history-modal');

  function moveOverlaysIntoScreen() {
    const screen = document.getElementById('student-screen');
    // 전체화면에서 모달/토스트가 보이도록 student-screen 안으로 이동
    if (toastContainer) screen.appendChild(toastContainer);
    if (confirmModal) screen.appendChild(confirmModal);
    if (historyModalEl) screen.appendChild(historyModalEl);
  }

  function moveOverlaysBack() {
    // 원래 body 레벨로 복원
    if (toastContainer) document.body.insertBefore(toastContainer, document.body.firstChild);
    if (confirmModal) document.body.insertBefore(confirmModal, toastContainer ? toastContainer.nextSibling : document.body.firstChild);
    if (historyModalEl) document.body.appendChild(historyModalEl);
  }

  fullscreenBtn.addEventListener('click', () => {
    const screen = document.getElementById('student-screen');
    if (!document.fullscreenElement) {
      moveOverlaysIntoScreen();
      screen.requestFullscreen().catch(() => {
        // Fallback: CSS-only fullscreen
        screen.classList.toggle('fullscreen');
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const screen = document.getElementById('student-screen');
    if (document.fullscreenElement) {
      fullscreenBtn.textContent = '⛶ 전체 화면 종료';
    } else {
      fullscreenBtn.textContent = '⛶ 전체 화면';
      screen.classList.remove('fullscreen');
      moveOverlaysBack();
    }
  });

  // === 배치 기록 보기 ===
  const historyBtn = document.getElementById('btn-history');
  const historyModal = document.getElementById('history-modal');
  const historyCloseBtn = document.getElementById('btn-history-close');
  const historyList = document.getElementById('history-list');

  if (historyBtn && historyModal) {
    historyBtn.addEventListener('click', () => {
      const current = store.load();
      const history = current.assignmentHistory || [];
      const lastAssignment = current.lastAssignment;

      if (history.length === 0 && !lastAssignment) {
        historyList.innerHTML = '<p class="empty-text" style="padding:2rem;text-align:center;color:#94A3B8">저장된 배치 기록이 없습니다.<br>자리 뽑기를 하면 자동으로 기록됩니다.</p>';
      } else {
        let html = '';

        // 현재 배치
        if (lastAssignment && lastAssignment.mapping) {
          const date = new Date(lastAssignment.timestamp);
          const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
          const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const studentCount = Object.values(lastAssignment.mapping).filter(Boolean).length;
          html += `<div class="history-item current">
            <div class="history-badge">현재</div>
            <div class="history-info">
              <div class="history-date">${dateStr} ${timeStr}</div>
              <div class="history-detail">${studentCount}명 배치</div>
            </div>
          </div>`;
        }

        // 과거 기록 (최신순)
        for (let i = history.length - 1; i >= 0; i--) {
          const record = history[i];
          const date = new Date(record.timestamp);
          const dateStr = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
          const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          const studentCount = record.mapping ? Object.values(record.mapping).filter(Boolean).length : 0;
          html += `<div class="history-item" data-history-index="${i}">
            <div class="history-badge past">${history.length - i}회 전</div>
            <div class="history-info">
              <div class="history-date">${dateStr} ${timeStr}</div>
              <div class="history-detail">${studentCount}명 배치</div>
            </div>
            <button class="btn btn-sm btn-outline history-restore-btn" data-idx="${i}" title="이 배치로 복원">복원</button>
          </div>`;
        }

        historyList.innerHTML = html;

        // 복원 버튼 이벤트
        historyList.querySelectorAll('.history-restore-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const d = store.load();
            const hist = d.assignmentHistory || [];
            if (!hist[idx] || !hist[idx].mapping) return;
            store.update({ lastAssignment: { mapping: hist[idx].mapping, timestamp: hist[idx].timestamp } });
            currentAssignment = hist[idx].mapping;
            namesHidden = false;
            revealedSeats.clear();
            swapMode = false;
            swapFirstSeat = null;
            swapModeBtn.classList.remove('active');
            revealAllBtn.style.display = 'none';
            renderSeatGrid(container, d, hist[idx].mapping, { animate: true, teacherView: isTeacherView });
            attachSeatClickHandlers();
            drawBtn.style.display = 'none';
            redrawBtn.style.display = 'inline-flex';
            showResultToolbar(true);
            closeHistoryModal();
            showToast('이전 배치를 복원했습니다.', 'success');
          });
        });
      }

      historyModal.classList.add('active');
      historyModal._prevFocus = document.activeElement;
      historyModal._releaseTrap = trapFocus(historyModal);
    });

    function closeHistoryModal() {
      if (historyModal._releaseTrap) historyModal._releaseTrap();
      historyModal.classList.remove('active');
      if (historyModal._prevFocus) historyModal._prevFocus.focus();
    }

    historyCloseBtn.addEventListener('click', closeHistoryModal);

    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) closeHistoryModal();
    });

    historyModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHistoryModal();
    });
  }

  // 설정 변경 감지용 스냅샷
  let _lastSnapshot = '';
  function settingsSnapshot(d) {
    return JSON.stringify([d.students, d.layoutType, d.layoutSettings, d.genderRule, d.fixedSeats, d.separationRules]);
  }
  _lastSnapshot = settingsSnapshot(store.load());

  // 화면 진입 시 최신 데이터로 갱신
  function refreshFromStore() {
    const d = store.load();
    updateEmptyState(d);
    if (d.students.length === 0) return;

    const snap = settingsSnapshot(d);
    const settingsChanged = snap !== _lastSnapshot;
    _lastSnapshot = snap;

    if (settingsChanged) {
      // 교사 설정이 바뀌었으면 배치 결과 초기화
      currentAssignment = null;
      namesHidden = false;
      revealedSeats.clear();
      swapMode = false;
      swapFirstSeat = null;
      swapModeBtn.classList.remove('active');
      revealAllBtn.style.display = 'none';

      store.update({ lastAssignment: null });
      const rosterOrder = createRosterOrder(d);
      renderSeatGrid(container, d, rosterOrder, { teacherView: isTeacherView });
      drawBtn.style.display = 'inline-flex';
      redrawBtn.style.display = 'none';
      showResultToolbar(false);
    } else {
      // 설정이 동일하면 현재 상태 유지, 시선만 반영하여 재렌더
      reRenderCurrentView();
    }
  }

  // 탭 간 동기화
  store.initSync(refreshFromStore);

  // 화면 전환 시 갱신 함수 반환
  return { refresh: refreshFromStore };
}

/**
 * 슬롯머신 애니메이션
 */
function slotAnimation(container, data) {
  return new Promise(resolve => {
    const seats = container.querySelectorAll('.seat');
    const names = data.students;
    if (seats.length === 0 || names.length === 0) {
      resolve();
      return;
    }

    let frame = 0;
    const totalFrames = 15;
    const interval = setInterval(() => {
      seats.forEach(seat => {
        const nameEl = seat.querySelector('.seat-name');
        if (nameEl) {
          nameEl.textContent = names[Math.floor(Math.random() * names.length)];
          nameEl.style.opacity = '0.6';
          seat.style.background = frame % 2 === 0 ? 'var(--seat-highlight)' : 'var(--seat-empty)';
        }
      });
      frame++;
      if (frame >= totalFrames) {
        clearInterval(interval);
        seats.forEach(seat => {
          const nameEl = seat.querySelector('.seat-name');
          if (nameEl) {
            nameEl.textContent = '';
            nameEl.style.opacity = '1';
          }
          seat.style.background = '';
        });
        setTimeout(resolve, 200);
      }
    }, 80);
  });
}

/**
 * 배치 결과를 Canvas에 렌더링하여 이미지로 변환
 * @param {HTMLElement} container - 배치도 컨테이너 (이미 올바른 시선으로 렌더링된 상태)
 * @param {boolean} teacherView - 선생님 시선 여부 (제목/파일명용)
 */
function renderToCanvas(container, teacherView = false) {
  return new Promise((resolve) => {
    const blackboardEl = container.querySelector('.blackboard');
    const seats = container.querySelectorAll('.seat');
    if (seats.length === 0) {
      throw new Error('No seats');
    }

    const containerRect = container.getBoundingClientRect();
    const padding = 40;
    const titleHeight = 50;
    const canvasWidth = Math.max(containerRect.width + padding * 2, 600);
    const canvasHeight = containerRect.height + padding * 2 + titleHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * 2;
    canvas.height = canvasHeight * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Title
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    const dateStr = new Date().toLocaleDateString('ko-KR');
    const viewLabel = teacherView ? ' (선생님 시선)' : '';
    ctx.fillText(`자리 배치${viewLabel} - ${dateStr}`, canvasWidth / 2, 30);

    // Blackboard
    if (blackboardEl) {
      const bbRect = blackboardEl.getBoundingClientRect();
      const bbX = bbRect.left - containerRect.left + padding;
      const bbY = bbRect.top - containerRect.top + padding + titleHeight;
      const isPodium = blackboardEl.classList.contains('podium');
      ctx.fillStyle = isPodium ? '#4A3728' : '#2D5016';
      roundRect(ctx, bbX, bbY, bbRect.width, bbRect.height, 4);
      ctx.fill();
      ctx.fillStyle = isPodium ? '#F5E6D3' : '#D1FAE5';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(blackboardEl.textContent, bbX + bbRect.width / 2, bbY + bbRect.height / 2 + 5);
    }

    // Seats
    seats.forEach(seat => {
      const seatRect = seat.getBoundingClientRect();
      const x = seatRect.left - containerRect.left + padding;
      const y = seatRect.top - containerRect.top + padding + titleHeight;

      const isAssigned = seat.classList.contains('assigned');
      const isFixed = seat.classList.contains('fixed');
      ctx.fillStyle = isFixed ? '#FEF3C7' : isAssigned ? '#D1FAE5' : '#F1F5F9';
      ctx.strokeStyle = isFixed ? '#FCD34D' : isAssigned ? '#6EE7B7' : '#E2E8F0';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, seatRect.width, seatRect.height, 6);
      ctx.fill();
      ctx.stroke();

      const numEl = seat.querySelector('.seat-number');
      if (numEl) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(numEl.textContent, x + 4, y + 12);
      }

      const nameEl = seat.querySelector('.seat-name');
      if (nameEl && nameEl.textContent) {
        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(nameEl.textContent, x + seatRect.width / 2, y + seatRect.height / 2 + 5);
      }
    });

    resolve(canvas);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
