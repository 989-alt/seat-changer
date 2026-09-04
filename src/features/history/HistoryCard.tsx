// 자리뽑기 이력 카드. props 없음, 스토어를 직접 읽고 쓴다.
import { useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import type { AssignmentRecord } from '@/core/model/types';

/** 교사 화면(다른 담당)이 미리보기 렌더링에 쓰는 세션 저장 키. */
export const PREVIEW_HISTORY_KEY = 'seat-changer-preview-history';

function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

export function HistoryCard() {
  const data = useAppStore((s) => s.data);
  const update = useAppStore((s) => s.update);
  const push = useToasts((s) => s.push);
  const [clearArmed, setClearArmed] = useState(false);

  // assignmentHistory(오래된 것이 앞)에 lastAssignment(가장 최근)를 이어 붙여
  // 전체 이력을 시간순으로 만든다. 미리보기 인덱스는 이 배열 기준이다.
  const records: AssignmentRecord[] = data.lastAssignment
    ? [...data.assignmentHistory, data.lastAssignment]
    : data.assignmentHistory;

  const canClear = records.length > 0 || data.groupHistory.length > 0;

  function handlePreview(index: number) {
    try {
      sessionStorage.setItem(PREVIEW_HISTORY_KEY, String(index));
    } catch {
      // 저장 공간 접근 실패 시 조용히 무시한다(미리보기는 부가 기능).
    }
    push('교사 화면에서 이 결과를 볼 수 있습니다.');
  }

  function handleClearClick() {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    update({ assignmentHistory: [], groupHistory: [] });
    setClearArmed(false);
    push('기록을 비웠습니다.');
  }

  return (
    <div data-card="history">
      <PaperCard title="기록" badge={`${records.length}건`}>
        <p className="font-body text-sm text-ink">
          {records.length === 0
            ? '아직 뽑은 기록이 없습니다.'
            : `마지막 뽑기: ${formatDateTime(records[records.length - 1]!.timestamp)}`}
        </p>

        {records.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {records
              .map((record, index) => ({ record, index }))
              .reverse()
              .map(({ record, index }) => (
                <li
                  key={`${record.timestamp}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-note bg-paper px-3 py-2"
                >
                  <span className="font-body text-sm text-ink">{formatDateTime(record.timestamp)}</span>
                  <WoodButton
                    type="button"
                    variant="secondary"
                    icon={<Eye size={14} aria-hidden="true" />}
                    onClick={() => handlePreview(index)}
                  >
                    이 결과 보기
                  </WoodButton>
                </li>
              ))}
          </ul>
        )}

        <WoodButton
          type="button"
          variant="danger"
          className="mt-3"
          icon={<Trash2 size={16} aria-hidden="true" />}
          disabled={!canClear}
          onClick={handleClearClick}
        >
          {clearArmed ? '한 번 더 누르면 삭제됩니다' : '기록 비우기'}
        </WoodButton>
      </PaperCard>
    </div>
  );
}
