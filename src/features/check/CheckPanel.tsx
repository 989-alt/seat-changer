import { useState } from 'react';
import { ClipboardCheck, Loader2, TriangleAlert } from 'lucide-react';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { randomizeSeats, verifyAssignment } from '@/core/randomizer';
import type { Violation } from '@/core/randomizer';
import type { Assignment } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';

export interface CheckResult {
  mapping?: Assignment;
  violations: Violation[];
  error?: string;
}

/** randomizeSeats의 실패 사유를 교사가 읽을 수 있는 문장으로 바꾼다. */
const REASON_TEXT: Record<string, string> = {
  'no-layout': '배치 방식을 알 수 없습니다. 배치 설정을 다시 확인하세요.',
  'no-students': '학생 명단이 비어 있습니다. 명단을 먼저 입력하세요.',
  capacity: '좌석이 모자랍니다. 행·열을 늘리거나 삭제한 자리를 되살리세요.',
  constraints: '규칙을 모두 만족하는 자리를 찾지 못했습니다. 분리 규칙이나 고정 자리를 줄여 보세요.',
};

/**
 * 규칙 검사 패널. 미리보기 전용이라 결과를 저장하지 않는다(recordAssignment를 부르지 않는다).
 */
export function CheckPanel({ onResult }: { onResult: (r: CheckResult) => void }) {
  const data = useAppStore((s) => s.data);
  const [busy, setBusy] = useState(false);
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setViolations(null);
    const result = await randomizeSeats(data);
    if (result.ok) {
      const found = verifyAssignment(result.mapping, data);
      setViolations(found);
      onResult({ mapping: result.mapping, violations: found });
    } else {
      const message = `${REASON_TEXT[result.reason] ?? '자리를 만들지 못했습니다.'} (${result.detail})`;
      setError(message);
      onResult({ violations: [], error: message });
    }
    setBusy(false);
  };

  return (
    <PaperCard title="규칙 검사" tilt="none">
      <div data-card="check" className="font-body text-[14px] text-ink">
        <WoodButton
          variant="secondary"
          onClick={run}
          disabled={busy}
          icon={busy ? <Loader2 aria-hidden className="pointer-events-none h-4 w-4" /> : <ClipboardCheck aria-hidden className="pointer-events-none h-4 w-4" />}
          aria-label="규칙 검사"
        >
          {busy ? '규칙 검사 중' : '규칙 검사'}
        </WoodButton>
        <p className="mt-2 text-[13px] text-mute">미리보기 전용입니다. 결과는 저장되지 않습니다.</p>

        {error && (
          <p role="status" className="mt-3 flex items-start gap-2 font-bold text-ink">
            <TriangleAlert aria-hidden className="pointer-events-none mt-[2px] h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {violations && violations.length === 0 && (
          <p role="status" className="mt-3 font-bold text-ink">
            규칙을 모두 지킬 수 있습니다.
          </p>
        )}

        {violations && violations.length > 0 && (
          <div role="status" className="mt-3">
            <p className="font-bold text-ink">지키지 못한 규칙 {violations.length}건</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {violations.map((v, i) => (
                <li key={`${v.kind}-${i}`} className="text-ink">
                  {v.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PaperCard>
  );
}
