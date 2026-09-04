// 규칙 카드: 고정 자리 / 분리 규칙 / 성별 규칙 / 이력 배제 (계약서 3-4)
// props 없이 스토어를 직접 읽고 쓴다.
import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { useAppStore } from '@/store/useAppStore';
import { getLayout } from '@/core/layouts';
import type { ClassData, GenderRule } from '@/core/model/types';

const GENDER_OPTIONS: { value: GenderRule; label: string; desc: string }[] = [
  { value: 'none', label: '사용 안 함', desc: '성별을 따지지 않고 섞습니다.' },
  { value: 'same', label: '같은 성별끼리', desc: '옆자리는 같은 성별이 되도록 맞춥니다.' },
  { value: 'mixed', label: '남녀 섞어', desc: '옆자리는 다른 성별이 되도록 맞춥니다.' },
  {
    value: 'mixedFirst',
    label: '남녀 짝 우선',
    desc: '가능한 만큼 남녀 짝을 먼저 만들고 나머지는 자유롭게 둡니다.',
  },
];

const DISTANCES = [1, 2, 3, 4, 5];
const EXCLUDE_COUNTS = [1, 2, 3] as const;

/**
 * 새 고정 자리가 기존 분리 규칙과 부딪히는지 미리 살핀다(R74).
 * 상대 학생도 고정 자리를 가진 경우에만 거리 계산이 가능하다.
 * 판정 기준은 verifyAssignment의 분리 위반과 같은 "거리 <= 최소 거리"다.
 */
export function findFixedSeatConflicts(
  data: ClassData,
  studentName: string,
  seatIndex: number
): string[] {
  if (!studentName || !Number.isInteger(seatIndex)) return [];
  const layout = getLayout(data.layoutType);
  const positions = layout.getSeatPositions(data.layoutSettings);
  const posOf = (i: number) => positions.find((p) => p.index === i);
  const mine = posOf(seatIndex);
  if (!mine) return [];

  const out: string[] = [];
  for (const rule of data.separationRules) {
    let other: string | null = null;
    if (rule.studentA === studentName) other = rule.studentB;
    else if (rule.studentB === studentName) other = rule.studentA;
    if (!other) continue;
    const otherFixed = data.fixedSeats.find(
      (f) => f.studentName === other && f.seatIndex !== seatIndex
    );
    if (!otherFixed) continue;
    const otherPos = posOf(otherFixed.seatIndex);
    if (!otherPos) continue;
    const dist = layout.distance(mine, otherPos);
    if (dist <= rule.minDistance) {
      out.push(
        `${studentName}과(와) ${other}의 분리 규칙과 부딪힙니다 (거리 ${dist}, 최소 ${rule.minDistance}).`
      );
    }
  }
  return out;
}

export function RulesCard() {
  const data = useAppStore((s) => s.data);
  const update = useAppStore((s) => s.update);

  const seatCount = useMemo(
    () => getLayout(data.layoutType).getSeatPositions(data.layoutSettings).length,
    [data.layoutType, data.layoutSettings]
  );

  const [fixStudent, setFixStudent] = useState('');
  const [fixSeat, setFixSeat] = useState('1');
  const [sepA, setSepA] = useState('');
  const [sepB, setSepB] = useState('');
  const [sepDist, setSepDist] = useState(1);

  const seatIndex = Number(fixSeat) - 1;
  const seatValid = Number.isInteger(seatIndex) && seatIndex >= 0 && seatIndex < seatCount;
  const conflicts = seatValid ? findFixedSeatConflicts(data, fixStudent, seatIndex) : [];

  const pairExists = data.separationRules.some(
    (r) =>
      (r.studentA === sepA && r.studentB === sepB) || (r.studentA === sepB && r.studentB === sepA)
  );
  const canAddSeparation = Boolean(sepA) && Boolean(sepB) && sepA !== sepB && !pairExists;

  const addFixed = () => {
    if (!fixStudent || !seatValid) return;
    // 한 학생은 한 자리만, 한 자리에는 한 학생만 남긴다.
    const rest = data.fixedSeats.filter(
      (f) => f.studentName !== fixStudent && f.seatIndex !== seatIndex
    );
    update({ fixedSeats: [...rest, { studentName: fixStudent, seatIndex }] });
  };

  const removeFixed = (name: string, index: number) => {
    update({
      fixedSeats: data.fixedSeats.filter((f) => !(f.studentName === name && f.seatIndex === index)),
    });
  };

  const addSeparation = () => {
    if (!canAddSeparation) return;
    update({
      separationRules: [
        ...data.separationRules,
        { studentA: sepA, studentB: sepB, minDistance: sepDist },
      ],
    });
  };

  const removeSeparation = (i: number) => {
    update({ separationRules: data.separationRules.filter((_, idx) => idx !== i) });
  };

  const noGender = data.students.filter((n) => !Object.hasOwn(data.studentGenders, n));
  const selectClass =
    'rounded-[6px] border-2 border-cork-dark bg-paper px-2 py-1 font-body text-[14px] text-ink';
  const rowClass =
    'flex items-center justify-between gap-2 rounded-[6px] border border-cork-dark bg-paper-2 px-2 py-1 font-body text-[14px] text-ink';
  const legendClass = 'font-hand text-[17px] font-bold text-ink';
  const hintClass = 'mt-2 font-body text-[13px] text-mute';
  const iconBtnClass = 'rounded-[4px] border border-cork-dark bg-paper p-1 text-ink';

  const studentOptions = (
    <>
      <option value="">학생 선택</option>
      {data.students.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </>
  );

  return (
    <div data-card="rules">
      <PaperCard title="규칙">
        <div className="space-y-5">
          <fieldset>
            <legend className={legendClass}>고정 자리</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="고정할 학생"
                className={selectClass}
                value={fixStudent}
                onChange={(e) => setFixStudent(e.target.value)}
              >
                {studentOptions}
              </select>
              <input
                aria-label="자리 번호"
                type="number"
                min={1}
                max={Math.max(1, seatCount)}
                className={`${selectClass} w-20`}
                value={fixSeat}
                onChange={(e) => setFixSeat(e.target.value)}
              />
              <span className="font-body text-[13px] text-mute">번 자리 (1 - {seatCount})</span>
              <WoodButton variant="secondary" onClick={addFixed} disabled={!fixStudent || !seatValid}>
                고정 자리 추가
              </WoodButton>
            </div>
            {conflicts.length > 0 && (
              <p
                data-testid="fixed-conflict"
                className="mt-2 font-body text-[13px] font-bold text-apple"
              >
                {conflicts.join(' ')}
              </p>
            )}
            {data.fixedSeats.length === 0 ? (
              <p className={hintClass}>고정한 자리가 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.fixedSeats.map((f) => (
                  <li key={`${f.studentName}-${f.seatIndex}`} className={rowClass}>
                    <span>
                      {f.studentName} - {f.seatIndex + 1}번 자리
                    </span>
                    <button
                      type="button"
                      aria-label={`${f.studentName} - ${f.seatIndex + 1}번 자리 삭제`}
                      className={iconBtnClass}
                      onClick={() => removeFixed(f.studentName, f.seatIndex)}
                    >
                      <Trash2 size={16} aria-hidden className="pointer-events-none" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset>
            <legend className={legendClass}>분리 규칙</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="분리할 학생 1"
                className={selectClass}
                value={sepA}
                onChange={(e) => setSepA(e.target.value)}
              >
                {studentOptions}
              </select>
              <select
                aria-label="분리할 학생 2"
                className={selectClass}
                value={sepB}
                onChange={(e) => setSepB(e.target.value)}
              >
                {studentOptions}
              </select>
              <select
                aria-label="최소 거리"
                className={selectClass}
                value={sepDist}
                onChange={(e) => setSepDist(Number(e.target.value))}
              >
                {DISTANCES.map((d) => (
                  <option key={d} value={d}>
                    최소 거리 {d}
                  </option>
                ))}
              </select>
              <WoodButton variant="secondary" onClick={addSeparation} disabled={!canAddSeparation}>
                분리 규칙 추가
              </WoodButton>
            </div>
            {pairExists && <p className={hintClass}>이미 등록한 짝입니다.</p>}
            {data.separationRules.length === 0 ? (
              <p className={hintClass}>분리 규칙이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.separationRules.map((r, i) => (
                  <li key={`${r.studentA}-${r.studentB}-${i}`} className={rowClass}>
                    <span>
                      {r.studentA} - {r.studentB} (최소 거리 {r.minDistance})
                    </span>
                    <button
                      type="button"
                      aria-label={`${r.studentA} - ${r.studentB} 분리 규칙 삭제`}
                      className={iconBtnClass}
                      onClick={() => removeSeparation(i)}
                    >
                      <Trash2 size={16} aria-hidden className="pointer-events-none" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset>
            <legend className={legendClass}>성별 규칙</legend>
            <div className="mt-2 space-y-1">
              {GENDER_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-start gap-2 font-body text-[14px] text-ink">
                  <input
                    type="radio"
                    name="genderRule"
                    className="mt-1"
                    value={o.value}
                    checked={data.genderRule === o.value}
                    onChange={() => update({ genderRule: o.value })}
                  />
                  <span>
                    <span className="font-bold">{o.label}</span>
                    <span className="ml-1 text-mute">{o.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {noGender.length > 0 && data.genderRule !== 'none' && (
              <p className={hintClass}>
                성별을 정하지 않은 학생 {noGender.length}명은 규칙에서 빠집니다.
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className={legendClass}>이력 배제</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 font-body text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={data.useHistoryExclusion}
                  onChange={(e) => update({ useHistoryExclusion: e.target.checked })}
                />
                <span>최근에 앉았던 자리는 피하기</span>
              </label>
              <div className="flex items-center gap-2 font-body text-[14px] text-ink">
                <span>최근 몇 번까지 피할지</span>
                <select
                  aria-label="자리 이력 배제 횟수"
                  className={selectClass}
                  value={data.historyExcludeCount}
                  disabled={!data.useHistoryExclusion}
                  onChange={(e) =>
                    update({ historyExcludeCount: Number(e.target.value) as 1 | 2 | 3 })
                  }
                >
                  {EXCLUDE_COUNTS.map((c) => (
                    <option key={c} value={c}>
                      {c}회
                    </option>
                  ))}
                </select>
              </div>
              {data.layoutType === 'group' && (
                <>
                  <label className="flex items-center gap-2 font-body text-[14px] text-ink">
                    <input
                      type="checkbox"
                      checked={data.useGroupExclusion}
                      onChange={(e) => update({ useGroupExclusion: e.target.checked })}
                    />
                    <span>최근에 같은 모둠이던 친구는 피하기</span>
                  </label>
                  <div className="flex items-center gap-2 font-body text-[14px] text-ink">
                    <span>모둠 이력을 몇 번까지 피할지</span>
                    <select
                      aria-label="모둠 이력 배제 횟수"
                      className={selectClass}
                      value={data.groupExcludeCount}
                      disabled={!data.useGroupExclusion}
                      onChange={(e) =>
                        update({ groupExcludeCount: Number(e.target.value) as 1 | 2 | 3 })
                      }
                    >
                      {EXCLUDE_COUNTS.map((c) => (
                        <option key={c} value={c}>
                          {c}회
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </fieldset>
        </div>
      </PaperCard>
    </div>
  );
}
