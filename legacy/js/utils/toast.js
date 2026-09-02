// Toast 알림 & Confirm 모달 유틸리티

/**
 * Toast 알림 표시
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'success', duration = 2500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icons[type] || '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);

  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, duration);
}

/**
 * 모달 포커스 트랩: Tab 키가 모달 내부에서만 순환
 * @returns {Function} cleanup - 해제 함수
 */
export function trapFocus(container) {
  const focusable = container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return () => {};
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  container.addEventListener('keydown', handler);
  first.focus();
  return () => container.removeEventListener('keydown', handler);
}

/**
 * 확인 모달 표시
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-modal');
    const msgEl = overlay.querySelector('.confirm-message');
    const yesBtn = overlay.querySelector('.confirm-yes');
    const noBtn = overlay.querySelector('.confirm-no');

    msgEl.textContent = message;
    overlay.classList.add('active');

    const prevFocus = document.activeElement;
    const releaseTrap = trapFocus(overlay);

    function cleanup(result) {
      releaseTrap();
      overlay.classList.remove('active');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      overlay.removeEventListener('click', onOverlay);
      overlay.removeEventListener('keydown', onEsc);
      if (prevFocus) prevFocus.focus();
      resolve(result);
    }

    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onOverlay(e) {
      if (e.target === overlay) cleanup(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') cleanup(false);
    }

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    overlay.addEventListener('click', onOverlay);
    overlay.addEventListener('keydown', onEsc);
  });
}
