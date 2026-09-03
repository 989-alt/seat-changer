import { useState } from 'react';
import { Check, Undo2, Dices } from 'lucide-react';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { ChalkBoard } from '@/components/cork/ChalkBoard';
import { NoteSeat } from '@/components/cork/NoteSeat';

const NAMES = [
  '김하람', '이도윤', '박서아', '최준우', '정지안', '한시우', '오유나',
  '강민재', '윤채원', '임서준', '황보아리랑', '조은우', '배아인', '신태오',
];

const GRID_SIZE = 15;
/** 고정(fixed) 좌석 자리. */
const FIXED_INDEX = 2;
/** 되살릴 수 있는 삭제 좌석 자리(onRestore 있음 → "되살리기"). */
const REMOVED_INDEX = 9;
/** 빈 좌석 자리. */
const EMPTY_INDEX = 14;

/**
 * 코르크 컴포넌트 갤러리(/dev/cork). Task 4~6 컴포넌트의 모든 상태를 한 화면에
 * 모아 Playwright 시각 게이트(G7)가 검사할 수 있게 한다. 제품 화면이 아니다.
 */
export function DevCorkPage() {
  // R32: 핸들러가 없는 좌석은 네이티브 disabled가 되어 탭 순서에서 빠진다.
  // 갤러리의 상호작용 좌석에 실제 핸들러를 주고, 클릭 횟수를 data-clicks로
  // 노출해 장식(테이프·압정)의 클릭 통과(pointer-events-none)를 검증한다.
  const [clicks, setClicks] = useState(0);
  const count = () => setClicks((n) => n + 1);

  return (
    <main data-page="dev-cork" data-clicks={clicks} className="min-h-screen texture-cork p-8">
      {/* R20: cork 배경 위 paper 텍스트는 2.57:1로 대비 미달이라 ink를 쓴다. */}
      <h1 className="mb-6 font-hand text-4xl text-ink">코르크 컴포넌트</h1>
      <div className="grid grid-cols-[360px_1fr] gap-8">
        <div className="flex flex-col gap-5">
          <PaperCard title="학생 명단" badge="22명" tilt="l">
            <ul className="grid grid-cols-3 gap-1 font-hand text-[15px]">
              {NAMES.slice(0, 9).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </PaperCard>
          <PaperCard title="자리 배치" tilt="r">
            <div className="flex flex-wrap gap-2">
              <WoodButton icon={<Check size={16} />} onClick={count}>
                규칙 검사
              </WoodButton>
              <WoodButton variant="secondary" icon={<Undo2 size={16} />} onClick={count}>
                되돌리기
              </WoodButton>
              <WoodButton variant="danger" size="lg" icon={<Dices size={24} />} onClick={count}>
                자리 뽑기
              </WoodButton>
              <WoodButton disabled>비활성</WoodButton>
            </div>
          </PaperCard>
          <PaperCard title="강조 좌석" pin={false}>
            <div className="grid grid-cols-3 gap-3">
              <NoteSeat index={0} name="김하람" state="assigned" highlight onClick={count} />
              <NoteSeat index={1} name="이도윤" state="fixed" highlight onClick={count} />
              <NoteSeat index={2} state="empty" highlight onClick={count} />
            </div>
          </PaperCard>
        </div>
        <div className="flex flex-col items-center gap-4">
          <ChalkBoard />
          {/* data-testid: e2e가 강조 카드 좌석과 헷갈리지 않고 이 그리드만 집는다. */}
          <div data-testid="seat-grid" className="grid w-full max-w-[720px] grid-cols-5 gap-3">
            {Array.from({ length: GRID_SIZE }, (_, i) => {
              const variant = (i % 3) as 0 | 1 | 2;
              if (i === FIXED_INDEX)
                return <NoteSeat key={i} index={i} name="이도윤" state="fixed" variant={variant} onClick={count} />;
              // R38: onRestore가 있으므로 "되살리기"로 표시된다.
              if (i === REMOVED_INDEX) return <NoteSeat key={i} index={i} state="disabled" onRestore={count} />;
              if (i === EMPTY_INDEX) return <NoteSeat key={i} index={i} state="empty" onClick={count} />;
              return (
                <NoteSeat
                  key={i}
                  index={i}
                  name={NAMES[i % NAMES.length]}
                  state="assigned"
                  variant={variant}
                  onClick={count}
                />
              );
            })}
          </div>
          <div className="grid w-full max-w-[720px] grid-cols-4 gap-3">
            <NoteSeat index={0} name="황보아리랑" state="assigned" size="lg" onClick={count} />
            <NoteSeat index={1} name="이도윤" state="fixed" size="lg" onClick={count} />
            <NoteSeat index={2} state="empty" size="lg" onClick={count} />
            {/* R38: onRestore가 없으므로 "삭제된 자리"로 표시되고 네이티브 disabled가 된다. */}
            <NoteSeat index={3} state="disabled" size="lg" />
          </div>
          <ChalkBoard kind="podium" />
        </div>
      </div>
    </main>
  );
}
