import { useMemo, useState } from 'react';
import { Check, Circle, Eye, Trash2, X } from 'lucide-react';
import { WoodButton } from '@/components/cork/WoodButton';
import { ToastHost } from '@/components/Toast';
import { ClassBar } from '@/features/classes/ClassBar';
import { RosterCard } from '@/features/roster/RosterCard';
import { LayoutCard } from '@/features/layout/LayoutCard';
import { RulesCard } from '@/features/rules/RulesCard';
import { GroupsCard } from '@/features/groups/GroupsCard';
import { HistoryCard } from '@/features/history/HistoryCard';
import { SeatBoard } from '@/features/layout/SeatBoard';
import { CheckPanel, type CheckResult } from '@/features/check/CheckPanel';
import { STEPS, stepDone } from '@/features/check/progress';
import { getLayout } from '@/core/layouts';
import type { Assignment, ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';

/**
 * 미리보기 배치. 마지막 배정이 있으면 그대로 쓰고, 없으면 명단 순서대로
 * 사용 가능한 좌석에 채운다(비활성 좌석은 건너뛴다).
 */
function buildPreview(data: ClassData): Assignment {
  if (data.lastAssignment) return data.lastAssignment.mapping;
  const disabled = new Set(data.layoutSettings.disabledSeats ?? []);
  const positions = getLayout(data.layoutType).getSeatPositions(data.layoutSettings);
  const mapping: Assignment = {};
  let next = 0;
  for (const p of positions) {
    if (next >= data.students.length) break;
    if (disabled.has(p.index)) continue;
    const name = data.students[next];
    if (name !== undefined) mapping[p.index] = name;
    next += 1;
  }
  return mapping;
}

/**
 * 위반 메시지에 이름이 등장하는 학생의 좌석을 강조 대상으로 본다.
 * Violation은 좌석 인덱스를 담지 않으므로, 검사에 쓴 배치에서 되짚는다.
 */
function violationSeatsOf(result: CheckResult | null): number[] {
  if (!result?.mapping || result.violations.length === 0) return [];
  const text = result.violations.map((v) => v.message).join(' ');
  const seats: number[] = [];
  for (const [seat, name] of Object.entries(result.mapping)) {
    if (name && text.includes(name)) seats.push(Number(seat));
  }
  return seats;
}

export function TeacherPage() {
  const data = useAppStore((s) => s.data);
  const update = useAppStore((s) => s.update);
  const deleteSeat = useAppStore((s) => s.deleteSeat);
  const restoreSeat = useAppStore((s) => s.restoreSeat);
  const push = useToasts((s) => s.push);

  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const done = stepDone(data);
  const previewMapping = useMemo(() => buildPreview(data), [data]);
  const violationSeats = violationSeatsOf(checkResult);
  const passed = checkResult !== null && !checkResult.error && checkResult.violations.length === 0;
  const noStudents = data.students.length === 0;

  const goPresent = () => {
    window.location.href = '/present';
  };

  const removeSeat = (seatIndex: number) => {
    setSelectedSeat(null);
    deleteSeat(seatIndex);
    push(String(seatIndex + 1) + '번 자리를 삭제했습니다.', {
      label: '되돌리기',
      onAction: () => restoreSeat(seatIndex),
    });
  };

  const togglePerspective = () => {
    update({ viewPerspective: data.viewPerspective === 'student' ? 'teacher' : 'student' });
  };

  return (
    <main data-page="teacher" className="min-h-screen texture-cork">
      <div className="mx-auto max-w-[1400px] px-5 py-6">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-hand text-4xl font-bold text-ink">자리바꾸기</h1>
          <div className="min-w-0 grow">
            <ClassBar />
          </div>
          <WoodButton
            variant={passed ? 'primary' : 'secondary'}
            size="lg"
            onClick={goPresent}
            disabled={noStudents}
            aria-label="학생들 앞에서 뽑기"
          >
            학생들 앞에서 뽑기
          </WoodButton>
        </header>

        <ol data-testid="progress-steps" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          {STEPS.map((step, i) => (
            <li
              key={step.key}
              data-step={step.key}
              data-done={done[step.key] ? 'true' : 'false'}
              className="flex items-center gap-2 font-body text-[15px] font-bold text-ink"
            >
              {done[step.key] ? (
                <Check aria-hidden className="pointer-events-none h-5 w-5" />
              ) : (
                <Circle aria-hidden className="pointer-events-none h-5 w-5" />
              )}
              <span>
                {i + 1}. {step.label}
              </span>
              <span className="sr-only">{done[step.key] ? '완료' : '아직'}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <div className="flex max-h-[calc(100vh-13rem)] flex-col gap-5 overflow-y-auto pr-1 lg:pb-4">
            <RosterCard />
            <LayoutCard />
            <RulesCard />
            <GroupsCard />
            <HistoryCard />
          </div>

          <div className="flex flex-col gap-5">
            <section
              aria-label="배치도 미리보기"
              className="rounded-note border-2 border-cork-dark bg-paper p-4 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-hand text-[21px] font-bold text-ink">배치도 미리보기</h2>
                <WoodButton
                  variant="secondary"
                  size="md"
                  onClick={togglePerspective}
                  icon={<Eye aria-hidden className="pointer-events-none h-4 w-4" />}
                  aria-label={data.viewPerspective === 'student' ? '선생님 시선으로 보기' : '학생 시선으로 보기'}
                >
                  {data.viewPerspective === 'student' ? '선생님 시선으로 보기' : '학생 시선으로 보기'}
                </WoodButton>
              </div>

              {selectedSeat !== null && (
                <div
                  data-testid="seat-popover"
                  className="mt-3 flex flex-wrap items-center gap-2 rounded-note border-2 border-cork-dark bg-paper-2 px-3 py-2 font-body text-[14px] text-ink"
                >
                  <span className="font-bold">{selectedSeat + 1}번 자리</span>
                  <WoodButton
                    variant="danger"
                    size="md"
                    onClick={() => removeSeat(selectedSeat)}
                    icon={<Trash2 aria-hidden className="pointer-events-none h-4 w-4" />}
                    aria-label={String(selectedSeat + 1) + '번 자리 삭제'}
                  >
                    이 자리 삭제
                  </WoodButton>
                  <WoodButton
                    variant="secondary"
                    size="md"
                    onClick={() => setSelectedSeat(null)}
                    icon={<X aria-hidden className="pointer-events-none h-4 w-4" />}
                    aria-label="자리 메뉴 닫기"
                  >
                    닫기
                  </WoodButton>
                </div>
              )}

              <div className="mt-3">
                <SeatBoard
                  data={data}
                  mapping={previewMapping}
                  size="sm"
                  perspective={data.viewPerspective}
                  editable
                  onSeatClick={(seatIndex) => setSelectedSeat((prev) => (prev === seatIndex ? null : seatIndex))}
                  onSeatRestore={restoreSeat}
                  highlightSeats={violationSeats}
                />
              </div>
            </section>

            <CheckPanel onResult={setCheckResult} />
          </div>
        </div>
      </div>
      <ToastHost />
    </main>
  );
}
