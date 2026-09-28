// 발표 화면 조작 막대(개선 스펙 3-2). 얇은 한 줄: 반 이름 + 고정 높이 상태 칸 + 버튼.
// 뽑는 동안에는 언마운트하지 않고 가려서(invisible) 높이를 지킨다. 막대가 빠졌다 들어오면
// 배치도 영역이 커졌다 작아지며 배율이 흔들린다. 상태 칸도 높이가 고정이라 문구가 바뀌어도
// 배치도가 움직이지 않는다(첫 자리를 누를 때 자리가 움직이던 문제).
// 규칙 위반은 이름 없이 건수 배지로만 보이고, 누르면 막대 위에 겹쳐 펼친다(학생이 보는 화면에 규칙을 드러내지 않는다).
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  ImageDown,
  Maximize,
  Minimize,
  Play,
  Printer,
  RotateCcw,
  TriangleAlert,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WoodButton } from '@/components/cork/WoodButton';
import { useFullscreen } from './useFullscreen';

export interface PresentStatus {
  text: string;
  /** lottery: 한 명씩 뽑기에서 지금 공개하는 이름(크게), hint: 자리 바꾸기 안내 */
  tone: 'lottery' | 'hint';
}

export interface PresentControlsProps {
  classLabel: string;
  status: PresentStatus | null;
  /** 규칙 위반 문구. 발표 화면은 이름을 기본으로 드러내지 않고 건수 배지만 보인다(누르면 펼침). */
  violations: string[];
  /** 카운트다운·셔플·줄 공개 중. 막대를 가리되 자리는 지킨다. */
  hidden: boolean;
  hasResult: boolean;
  running: boolean;
  lottery: boolean;
  teacherView: boolean;
  muted: boolean;
  onStart: () => void;
  onStartLottery: () => void;
  onRevealOne: () => void;
  onRevealAll: () => void;
  onTogglePerspective: () => void;
  onToggleSound: () => void;
  onSaveImage: () => void;
  onPrint: () => void;
}

const ICON = 'pointer-events-none';

export function PresentControls({
  classLabel,
  status,
  violations,
  hidden,
  hasResult,
  running,
  lottery,
  teacherView,
  muted,
  onStart,
  onStartLottery,
  onRevealOne,
  onRevealAll,
  onTogglePerspective,
  onToggleSound,
  onSaveImage,
  onPrint,
}: PresentControlsProps) {
  const fullscreen = useFullscreen();
  // 위반 목록은 교사가 배지를 눌렀을 때만 펼친다. 학생이 보는 화면에 규칙(학생 이름)이
  // 기본으로 뜨지 않게 하려는 것이다. 위반이 0건이 되면 다음에 다시 생겨도 접힌 채로 시작한다.
  const [showViolations, setShowViolations] = useState(false);
  useEffect(() => {
    if (violations.length === 0) setShowViolations(false);
  }, [violations.length]);
  const statusLook =
    status?.tone === 'lottery' ? 'font-hand text-[30px] font-bold leading-9' : 'font-body text-[15px] font-bold leading-9';
  return (
    <footer
      data-present="controls"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-note bg-paper px-3 py-2 shadow-card ${hidden ? 'invisible' : ''}`}
    >
      <span data-present="class" className="shrink-0 font-hand text-[20px] font-bold text-ink">
        {classLabel}
      </span>
      <p
        data-present="status"
        data-tone={status?.tone}
        aria-live="polite"
        className={`h-9 min-w-[min(100%,34rem)] flex-1 truncate text-ink ${statusLook}`}
      >
        {status?.text ?? ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {violations.length > 0 && (
          <div className="relative">
            <WoodButton
              variant="secondary"
              aria-expanded={showViolations}
              onClick={() => setShowViolations((open) => !open)}
              icon={<TriangleAlert size={18} aria-hidden="true" className={ICON} />}
            >
              규칙 위반 {violations.length}건
            </WoodButton>
            {showViolations && (
              // 막대 위에 겹쳐 띄운다. 흐름 밖(absolute)이라 배치도 크기가 바뀌지 않는다.
              <section
                data-present="violations"
                className="absolute bottom-full left-0 z-40 mb-2 w-[min(28rem,90vw)] rounded-note bg-paper p-4 text-ink shadow-card"
              >
                <h2 className="font-hand text-[20px] font-bold">규칙 위반 {violations.length}건</h2>
                <ul className="mt-2 list-disc pl-6 font-body text-[15px]">
                  {violations.map((message, i) => (
                    <li key={`${i}-${message}`}>{message}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        <WoodButton
          variant="primary"
          disabled={running}
          onClick={onStart}
          icon={
            hasResult ? (
              <RotateCcw size={18} aria-hidden="true" className={ICON} />
            ) : (
              <Play size={18} aria-hidden="true" className={ICON} />
            )
          }
        >
          {hasResult ? '다시 뽑기' : '자리 뽑기'}
        </WoodButton>

        {lottery ? (
          <>
            <WoodButton variant="primary" disabled={running} onClick={onRevealOne}>
              다음 학생 공개
            </WoodButton>
            <WoodButton variant="secondary" disabled={running} onClick={onRevealAll}>
              모두 공개
            </WoodButton>
          </>
        ) : (
          <WoodButton
            variant="secondary"
            disabled={running}
            onClick={onStartLottery}
            icon={<UserRound size={18} aria-hidden="true" className={ICON} />}
          >
            한 명씩 뽑기
          </WoodButton>
        )}

        <WoodButton
          variant="secondary"
          onClick={onTogglePerspective}
          aria-label={`${teacherView ? '선생님 시선' : '학생 시선'} (누르면 시점이 바뀝니다)`}
          icon={<Eye size={18} aria-hidden="true" className={ICON} />}
        >
          {teacherView ? '선생님 시선' : '학생 시선'}
        </WoodButton>

        <WoodButton
          variant="secondary"
          onClick={onToggleSound}
          icon={
            muted ? (
              <VolumeX size={18} aria-hidden="true" className={ICON} />
            ) : (
              <Volume2 size={18} aria-hidden="true" className={ICON} />
            )
          }
        >
          {muted ? '소리 켜기' : '소리 끄기'}
        </WoodButton>

        <WoodButton
          variant="secondary"
          onClick={onSaveImage}
          disabled={!hasResult || running}
          icon={<ImageDown size={18} aria-hidden="true" className={ICON} />}
        >
          이미지 저장
        </WoodButton>

        <WoodButton
          variant="secondary"
          onClick={onPrint}
          disabled={!hasResult || running}
          icon={<Printer size={18} aria-hidden="true" className={ICON} />}
        >
          인쇄
        </WoodButton>

        {fullscreen.supported && (
          <WoodButton
            variant="secondary"
            onClick={fullscreen.toggle}
            icon={
              fullscreen.active ? (
                <Minimize size={18} aria-hidden="true" className={ICON} />
              ) : (
                <Maximize size={18} aria-hidden="true" className={ICON} />
              )
            }
          >
            {fullscreen.active ? '전체 화면 끝내기' : '전체 화면'}
          </WoodButton>
        )}

        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-4 py-2 font-hand text-[15px] font-bold text-ink shadow-note"
        >
          <ArrowLeft size={18} aria-hidden="true" className={ICON} />
          교사 화면으로
        </a>
      </div>
    </footer>
  );
}
