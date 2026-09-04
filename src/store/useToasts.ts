// 화면 우하단 토스트 큐. persist 없는 독립 zustand 스토어(Task 계약서 3-1).
// useAppStore와 달리 저장하지 않는다 — 알림은 세션 안에서만 의미가 있다.
import { create } from 'zustand';

export interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  items: ToastItem[];
  push(message: string, action?: { label: string; onAction: () => void }): number;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  items: [],
  push: (message, action) => {
    const id = nextId++;
    const item: ToastItem = { id, message, actionLabel: action?.label, onAction: action?.onAction };
    set((s) => ({ items: [...s.items, item] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
