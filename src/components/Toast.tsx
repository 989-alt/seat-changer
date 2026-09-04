// 토스트 호스트. 화면 우하단 고정, 큐 방식으로 여러 개가 쌓인다(Task 계약서 3-1).
// loadNotice(useAppStore)도 여기서 감시해 토스트로 띄우고 즉시 clearNotice()한다.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { WoodButton } from './cork/WoodButton';

const AUTO_DISMISS_MS = 5000;
const AUTO_DISMISS_WITH_ACTION_MS = 8000;

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const push = useToasts((s) => s.push);
  const dismiss = useToasts((s) => s.dismiss);
  const loadNotice = useAppStore((s) => s.loadNotice);
  const clearNotice = useAppStore((s) => s.clearNotice);

  // loadNotice가 생기면 토스트로 옮기고 즉시 비운다.
  useEffect(() => {
    if (!loadNotice) return;
    push(loadNotice);
    clearNotice();
  }, [loadNotice, push, clearNotice]);

  // 항목별 자동 소멸 타이머. 언마운트·항목 제거 시 정리한다.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const active = timers.current;
    const liveIds = new Set(items.map((item) => item.id));

    for (const item of items) {
      if (active.has(item.id)) continue;
      const ms = item.onAction ? AUTO_DISMISS_WITH_ACTION_MS : AUTO_DISMISS_MS;
      const timer = setTimeout(() => {
        active.delete(item.id);
        dismiss(item.id);
      }, ms);
      active.set(item.id, timer);
    }

    for (const [id, timer] of active) {
      if (!liveIds.has(id)) {
        clearTimeout(timer);
        active.delete(id);
      }
    }
  }, [items, dismiss]);

  // 언마운트 시 남은 타이머를 모두 정리한다.
  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) clearTimeout(timer);
      active.clear();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          data-cork="toast"
          className="pointer-events-auto flex items-start gap-3 rounded-note bg-paper p-3 text-ink shadow-card"
        >
          <p className="flex-1 font-body text-sm">{item.message}</p>
          {item.actionLabel && item.onAction && (
            <WoodButton
              variant="secondary"
              onClick={() => {
                item.onAction?.();
                dismiss(item.id);
              }}
            >
              {item.actionLabel}
            </WoodButton>
          )}
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => dismiss(item.id)}
            className="text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
