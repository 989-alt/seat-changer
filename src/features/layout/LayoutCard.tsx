// 교사 설정 "배치" 카드. 배치 종류·행열·모둠·자유배치 편집기와
// 삭제한 자리 복구, Undo/Redo를 한자리에 모은다.
import { useEffect, useId } from 'react';
import { RotateCcw, Undo2, Redo2 } from 'lucide-react';
import type { LayoutType } from '@/core/model/types';
import { groupLayout } from '@/core/layouts/group';
import { PaperCard } from '@/components/cork/PaperCard';
import { useAppStore, useTemporal } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { CustomDeskEditor, NumberField } from './CustomDeskEditor';
import { GroupPositionEditor } from './GroupPositionEditor';

const MIN_GRID = 1;
const MAX_GRID = 12;
const MIN_GROUP_SIZE = 2;
const MAX_GROUP_SIZE = 8;
const MAX_GROUP_COUNT = 20;

const LAYOUTS: { type: LayoutType; label: string; desc: string }[] = [
  { type: 'exam', label: '시험대형', desc: '한 명씩 떨어져 앉는 줄 배치입니다.' },
  { type: 'pair', label: '짝꿍', desc: '두 명씩 짝을 지어 앉습니다.' },
  { type: 'ushape', label: 'ㄷ자', desc: '교탁을 둘러싸는 ㄷ자 배치입니다.' },
  { type: 'custom', label: '자유배치', desc: '책상을 원하는 자리에 직접 놓습니다.' },
  { type: 'group', label: '모둠', desc: '모둠별로 책상을 모아 놓습니다.' },
];

const GRID_LAYOUTS: LayoutType[] = ['exam', 'pair', 'ushape'];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.trunc(v)));

/** 입력 요소에 포커스가 있으면 단축키를 가로채지 않는다. */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

const HEADER_BTN =
  'inline-flex items-center gap-1 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-3 py-1 font-hand text-[15px] font-bold text-ink disabled:cursor-not-allowed disabled:border-mute disabled:text-mute';

export function LayoutCard() {
  const data = useAppStore((s) => s.data);
  const update = useAppStore((s) => s.update);
  const updateLayoutSettings = useAppStore((s) => s.updateLayoutSettings);
  const setGridSize = useAppStore((s) => s.setGridSize);
  const restoreAllSeats = useAppStore((s) => s.restoreAllSeats);
  const push = useToasts((s) => s.push);
  const { undo, redo, pastStates, futureStates } = useTemporal();

  const groupId = useId();
  const ls = data.layoutSettings;
  const disabledCount = ls.disabledSeats.length;
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // R83: 행·열은 반드시 setGridSize로 바꾼다(비활성 좌석 정리가 함께 일어난다).
  const applyGrid = (columns: number, rows: number) => {
    const { clearedDisabled } = setGridSize(columns, rows);
    if (clearedDisabled > 0) {
      push(`행·열을 바꿔 삭제한 자리 ${clearedDisabled}개를 되살렸습니다.`);
    }
  };

  const setGroupCount = (raw: number) => {
    const count = clamp(raw, 0, MAX_GROUP_COUNT);
    const base = clamp(ls.groupSize || 4, MIN_GROUP_SIZE, MAX_GROUP_SIZE);
    const groupSizes = Array.from({ length: count }, (_, i) => ls.groupSizes[i] ?? base);
    updateLayoutSettings({ groupCount: count, groupSizes });
  };

  // manual로 바꿀 때 저장된 위치가 없으면 현재 자동 위치를 초기값으로 채운다.
  // (이미 저장된 위치가 있으면 그대로 둔다.)
  const setGroupLayoutMode = (manual: boolean) => {
    if (!manual) {
      updateLayoutSettings({ groupLayoutMode: 'auto' });
      return;
    }
    const saved = ls.groupPositions ?? [];
    updateLayoutSettings({
      groupLayoutMode: 'manual',
      groupPositions: saved.length > 0 ? saved : groupLayout.calcAutoPositions(groupLayout.getGroupSizes(ls)),
    });
  };

  const setGroupSizeAt = (index: number, raw: number) => {
    const groupSizes = ls.groupSizes.map((n, i) => (i === index ? clamp(raw, 1, MAX_GROUP_SIZE) : n));
    updateLayoutSettings({ groupSizes });
  };

  return (
    <PaperCard title="배치" tilt="r">
      <div data-card="layout">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={restoreAllSeats}
            disabled={disabledCount === 0}
            aria-label={`삭제한 자리 모두 복구 (${disabledCount}개)`}
            className={HEADER_BTN}
          >
            <RotateCcw size={16} aria-hidden="true" className="pointer-events-none" />
            삭제한 자리 모두 복구 ({disabledCount}개)
          </button>
          <button type="button" onClick={() => undo()} disabled={!canUndo} aria-label="되돌리기" className={HEADER_BTN}>
            <Undo2 size={16} aria-hidden="true" className="pointer-events-none" />
            되돌리기
          </button>
          <button type="button" onClick={() => redo()} disabled={!canRedo} aria-label="다시하기" className={HEADER_BTN}>
            <Redo2 size={16} aria-hidden="true" className="pointer-events-none" />
            다시하기
          </button>
        </div>

        <fieldset className="mt-3 border-0 p-0">
          <legend className="font-hand text-[17px] font-bold text-ink">배치 종류</legend>
          <div className="mt-1 grid gap-1">
            {LAYOUTS.map((l) => (
              <label key={l.type} className="flex items-start gap-2 font-body text-sm text-ink">
                <input
                  type="radio"
                  name={`${groupId}-layout`}
                  value={l.type}
                  checked={data.layoutType === l.type}
                  onChange={() => update({ layoutType: l.type })}
                  className="mt-1 accent-[#2E5A4E]"
                />
                <span>
                  <span className="font-hand text-[17px] font-bold">{l.label}</span>
                  <span className="ml-2 text-mute">{l.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {GRID_LAYOUTS.includes(data.layoutType) && (
          <div className="mt-3 flex flex-wrap items-center gap-3 font-body text-sm text-ink">
            <NumberField
              label="열"
              value={ls.columns}
              min={MIN_GRID}
              max={MAX_GRID}
              onCommit={(v) => applyGrid(v, ls.rows)}
            />
            <NumberField
              label="행"
              value={ls.rows}
              min={MIN_GRID}
              max={MAX_GRID}
              onCommit={(v) => applyGrid(ls.columns, v)}
            />
            <span className="text-mute">행·열을 바꾸면 삭제한 자리는 모두 되살아납니다.</span>
          </div>
        )}

        {data.layoutType === 'group' && (
          <div className="mt-3 font-body text-sm text-ink">
            <div className="flex flex-wrap items-center gap-3">
              <NumberField
                label="모둠 인원"
                value={ls.groupSize}
                min={MIN_GROUP_SIZE}
                max={MAX_GROUP_SIZE}
                onCommit={(v) =>
                  updateLayoutSettings({ groupSize: clamp(v, MIN_GROUP_SIZE, MAX_GROUP_SIZE) })
                }
              />
              <NumberField
                label="모둠 수"
                value={ls.groupCount}
                min={0}
                max={MAX_GROUP_COUNT}
                onCommit={setGroupCount}
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ls.groupLayoutMode === 'manual'}
                  onChange={(e) => setGroupLayoutMode(e.target.checked)}
                  className="accent-[#2E5A4E]"
                />
                모둠 위치를 직접 정하기
              </label>
            </div>

            {ls.groupSizes.length > 0 && (
              <div data-testid="group-sizes" className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-bold">모둠별 인원</span>
                {ls.groupSizes.map((n, i) => (
                  <NumberField
                    key={i}
                    label={`${i + 1}모둠`}
                    value={n}
                    min={1}
                    max={MAX_GROUP_SIZE}
                    width="w-16"
                    onCommit={(v) => setGroupSizeAt(i, v)}
                  />
                ))}
              </div>
            )}

            {ls.groupLayoutMode === 'manual' && (
              <GroupPositionEditor
                sizes={groupLayout.getGroupSizes(ls)}
                positions={ls.groupPositions ?? []}
                onChange={(groupPositions) => updateLayoutSettings({ groupPositions })}
              />
            )}
          </div>
        )}

        {data.layoutType === 'custom' && (
          <CustomDeskEditor
            desks={ls.customDesks}
            onChange={(customDesks) => updateLayoutSettings({ customDesks })}
          />
        )}
      </div>
    </PaperCard>
  );
}
