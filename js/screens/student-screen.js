// 학생 뽑기 화면 로직
import { store } from '../data/store.js';
import { renderSeatGrid, getTotalSeatsForLayout, getLayout } from '../components/seat-grid.js';
import { randomizeSeats } from '../algorithm/seat-randomizer.js';
import { showToast, showConfirm } from '../utils/toast.js';

function verifyAssignment(result, data) {
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
    const assignment = data.lastAssignment?.mapping || null;
    renderSeatGrid(container, data, assignment, { animate });
  }

  // 초기 표시: 항상 명단 순서로 배치 (교사 미리보기 결과 무시)
  const data = store.load();
  updateEmptyState(data);

  if (data.students.length > 0) {
    // 학생 화면 진입 시 항상 명단 순서로 기초 배치 표시
    store.update({ lastAssignment: null });
    const rosterOrder = createRosterOrder(data);
    renderSeatGrid(container, data, rosterOrder);
    drawBtn.style.display = 'inline-flex';
    redrawBtn.style.display = 'none';
    showResultToolbar(false);
  }

  // 자리 뽑기
  async function doDraw(isRedraw = false) {
    const current = store.load();
    if (current.students.length === 0) {
      showToast('학생 명단이 없습니다. 교사 설정에서 명단을 입력하세요.', 'warning');
      return;
    }

    // 학생 수 vs 좌석 수 검증
    const totalSeats = getTotalSeatsForLayout(current);
    if (current.students.length > totalSeats) {
      showToast(`학생 수(${current.students.length}명)가 좌석 수(${totalSeats}석)보다 많습니다.`, 'error');
      return;
    }

    // 다시 뽑기 시 확인
    if (isRedraw) {
      const confirmed = await showConfirm('현재 자리 배치 결과가 사라집니다.\n정말 다시 뽑으시겠어요?');
      if (!confirmed) return;
    }

    drawBtn.disabled = true;
    redrawBtn.disabled = true;
    drawBtn.classList.add('loading');

    // 슬롯머신 애니메이션
    await slotAnimation(container, current);

    // 실제 배치
    const result = randomizeSeats(current);
    if (!result) {
      showToast('자리 배치에 실패했습니다. 조건을 확인해 주세요.', 'error', 3500);
      drawBtn.disabled = false;
      redrawBtn.disabled = false;
      drawBtn.classList.remove('loading');
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

    // history fallback 확인
    const historyFallback = result._historyFallback;
    if (historyFallback) delete result._historyFallback;

    store.update({ lastAssignment: { mapping: result, timestamp: Date.now() }, ...historyUpdate });

    // 결과 애니메이션
    renderSeatGrid(container, current, result, { animate: true });

    drawBtn.style.display = 'none';
    redrawBtn.style.display = 'inline-flex';
    drawBtn.disabled = false;
    redrawBtn.disabled = false;
    drawBtn.classList.remove('loading');
    showResultToolbar(true);

    // 결과 검증
    const violations = verifyAssignment(result, current);
    if (violations.length > 0) {
      showToast(`규칙 위반 ${violations.length}건 발견`, 'error', 4000);
    } else if (historyFallback) {
      showToast('이전 자리를 완전히 피할 수 없어 일부 중복이 있을 수 있습니다.', 'warning', 4000);
    } else {
      showToast('자리 배치 완료!', 'success');
    }
  }

  drawBtn.addEventListener('click', () => doDraw(false));
  redrawBtn.addEventListener('click', () => doDraw(true));

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
      const canvas = await renderToCanvas(container, current);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `자리배치_${dateStr}.png`;
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

        // 전체 설정 + 결과 복원
        store.update({
          students: imported.students || [],
          classSize: (imported.students || []).length,
          layoutType: imported.layoutType || 'exam',
          layoutSettings: imported.layoutSettings || { columns: 6, rows: 5, customDesks: [] },
          fixedSeats: imported.fixedSeats || [],
          separationRules: imported.separationRules || [],
          lastAssignment: {
            mapping: imported.assignment,
            timestamp: imported.timestamp || Date.now()
          }
        });

        const dateStr = imported.date || '(알 수 없음)';
        showToast(`${dateStr} 자리 배치를 불러왔습니다.`, 'success');

        // 화면 갱신
        renderCurrent(true);
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

  // === 인쇄 ===
  printBtn.addEventListener('click', () => {
    window.print();
  });

  // === 전체 화면 ===
  fullscreenBtn.addEventListener('click', () => {
    const screen = document.getElementById('student-screen');
    if (!document.fullscreenElement) {
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
    }
  });

  // 탭 간 동기화
  store.initSync(() => {
    const d = store.load();
    updateEmptyState(d);
    if (d.students.length === 0) return;

    const rosterOrder = createRosterOrder(d);
    renderSeatGrid(container, d, rosterOrder);
    drawBtn.style.display = 'inline-flex';
    redrawBtn.style.display = 'none';
    showResultToolbar(false);
  });
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
 */
function renderToCanvas(container) {
  return new Promise((resolve) => {
    const gridEl = container.querySelector('.seat-grid, .pair-grid, .ushape-grid, [style*="position:relative"]');
    const blackboardEl = container.querySelector('.blackboard');

    const seats = container.querySelectorAll('.seat');
    if (seats.length === 0) {
      throw new Error('No seats');
    }

    // Calculate bounds
    const containerRect = container.getBoundingClientRect();
    const padding = 40;
    const titleHeight = 50;
    const canvasWidth = Math.max(containerRect.width + padding * 2, 600);
    const canvasHeight = containerRect.height + padding * 2 + titleHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * 2; // 2x for retina
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
    ctx.fillText(`자리 배치 - ${dateStr}`, canvasWidth / 2, 30);

    // Blackboard
    if (blackboardEl) {
      const bbRect = blackboardEl.getBoundingClientRect();
      const bbX = bbRect.left - containerRect.left + padding;
      const bbY = titleHeight;
      ctx.fillStyle = '#2D5016';
      roundRect(ctx, bbX, bbY, bbRect.width, bbRect.height, 4);
      ctx.fill();
      ctx.fillStyle = '#D1FAE5';
      ctx.font = '14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('칠 판', bbX + bbRect.width / 2, bbY + bbRect.height / 2 + 5);
    }

    // Seats
    seats.forEach(seat => {
      const seatRect = seat.getBoundingClientRect();
      const x = seatRect.left - containerRect.left + padding;
      const y = seatRect.top - containerRect.top + padding + titleHeight;

      // Background
      const isAssigned = seat.classList.contains('assigned');
      const isFixed = seat.classList.contains('fixed');
      ctx.fillStyle = isFixed ? '#FEF3C7' : isAssigned ? '#D1FAE5' : '#F1F5F9';
      ctx.strokeStyle = isFixed ? '#FCD34D' : isAssigned ? '#6EE7B7' : '#E2E8F0';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, seatRect.width, seatRect.height, 6);
      ctx.fill();
      ctx.stroke();

      // Number
      const numEl = seat.querySelector('.seat-number');
      if (numEl) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(numEl.textContent, x + 4, y + 12);
      }

      // Name
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
