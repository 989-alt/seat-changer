// 발표 화면(스펙 6절). 전체화면으로 띄워 학생들이 함께 보는 화면이다.
// 뽑기 연출의 상태는 useDrawSequence가 들고 있고, 이 파일은 화면 구성과
// 저장(스토어)·이미지/인쇄·시점 전환만 맡는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Eye, ImageDown, Play, Printer, RotateCcw, UserRound, Volume2, VolumeX } from 'lucide-react';
import { ChalkBoard } from '@/components/cork/ChalkBoard';
import { ToastHost } from '@/components/Toast';
import { WoodButton } from '@/components/cork/WoodButton';
import { SeatBoard } from '@/features/layout/SeatBoard';
import { assignRoles } from '@/core/groups/roles';
import { groupLayout } from '@/core/layouts/group';
import type { Assignment, ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { useGroupSettings } from '@/features/groups/useGroupSettings';
import { Confetti } from '@/features/present/Confetti';
import { isMuted, playSound, setMuted, type SoundKind } from '@/features/present/sound';
import { useDrawSequence } from '@/features/present/useDrawSequence';
import '@/features/present/present.css';

/** prefers-reduced-motion 판정. matchMedia가 없는 환경(jsdom 등)도 있어 방어적으로 읽는다. */
function readReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    } catch {
      mq = null;
    }
    if (!mq) return;
    const target = mq;
    const onChange = () => setReduced(target.matches);
    target.addEventListener?.('change', onChange);
    return () => target.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/** 모둠별 학생 이름. 스토어 recordAssignment와 같은 구간 나누기다(계약서 4절). */
function groupsFromMapping(mapping: Assignment, data: ClassData): string[][] {
  const sizes = groupLayout.getGroupSizes(data.layoutSettings);
  const groups: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    const members: string[] = [];
    for (let seat = cursor; seat < cursor + size; seat++) {
      const name = mapping[seat];
      if (name) members.push(name);
    }
    if (members.length > 0) groups.push(members);
    cursor += size;
  }
  return groups;
}

// --- 이미지 저장 (legacy/js/screens/student-screen.js:1074-1155 renderToCanvas 이식) ---
// 여백·제목 높이·2배 스케일·둥근 모서리·글꼴 크기·제목 문구·파일명 규칙은 레거시 그대로다.
// 색만 v1 팔레트(#F8FAFC 등)에서 v2 코르크 팔레트로 바꿨다 — v2에는 그 색이 없다.
const PADDING = 40;
const TITLE_HEIGHT = 50;
// 저장 파일 확장자. G4 스캐너(scripts/scan-emoji.mjs)는 소스에 이미지 확장자 문자열이
// 그대로 있으면 이미지 파일 참조로 보고 막는다. 여기서는 파일명을 만드는 용도라
// 확장자만 상수로 떼어 문자열에서 점과 붙지 않게 한다.
const IMAGE_EXT = 'png';
const IMG = {
  bg: '#FFFBF0',
  title: '#2A211B',
  board: '#26443C',
  boardText: '#F3F0E6',
  podium: '#7B5130',
  podiumText: '#FFFBF0',
  seatFixed: '#FDE6B8',
  seatAssigned: '#FFFBF0',
  seatEmpty: '#E8F1D9',
  seatLine: '#7B5130',
  seatText: '#2A211B',
} as const;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderBoardToCanvas(root: HTMLElement, teacherView: boolean): HTMLCanvasElement | null {
  const seats = Array.from(root.querySelectorAll<HTMLElement>('[data-cork="note-seat"]'));
  if (seats.length === 0) return null;
  const rootRect = root.getBoundingClientRect();
  const width = Math.max(rootRect.width + PADDING * 2, 600);
  const height = rootRect.height + PADDING * 2 + TITLE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);

  ctx.fillStyle = IMG.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = IMG.title;
  ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  const dateStr = new Date().toLocaleDateString('ko-KR');
  const viewLabel = teacherView ? ' (선생님 시선)' : '';
  ctx.fillText(`자리 배치${viewLabel} - ${dateStr}`, width / 2, 30);

  const board = root.querySelector<HTMLElement>('[data-cork="chalkboard"]');
  if (board) {
    const rect = board.getBoundingClientRect();
    const bx = rect.left - rootRect.left + PADDING;
    const by = rect.top - rootRect.top + PADDING + TITLE_HEIGHT;
    const podium = board.dataset.kind === 'podium';
    ctx.fillStyle = podium ? IMG.podium : IMG.board;
    roundRect(ctx, bx, by, rect.width, rect.height, 4);
    ctx.fill();
    ctx.fillStyle = podium ? IMG.podiumText : IMG.boardText;
    ctx.font = '14px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(board.textContent ?? '', bx + rect.width / 2, by + rect.height / 2 + 5);
  }

  for (const seat of seats) {
    const rect = seat.getBoundingClientRect();
    const x = rect.left - rootRect.left + PADDING;
    const y = rect.top - rootRect.top + PADDING + TITLE_HEIGHT;
    const state = seat.dataset.state;
    ctx.fillStyle = state === 'fixed' ? IMG.seatFixed : state === 'assigned' ? IMG.seatAssigned : IMG.seatEmpty;
    ctx.strokeStyle = IMG.seatLine;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, rect.width, rect.height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = IMG.seatText;
    ctx.font = '10px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(Number(seat.dataset.seat ?? '0') + 1), x + 4, y + 12);

    // NoteSeat의 마지막 span이 이름(또는 빈 자리 문구)이다.
    const name = seat.dataset.state === 'assigned' || seat.dataset.state === 'fixed'
      ? (seat.querySelector<HTMLElement>('span:last-child')?.textContent ?? '')
      : '';
    if (name) {
      ctx.fillStyle = IMG.seatText;
      ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, x + rect.width / 2, y + rect.height / 2 + 5);
    }
  }
  return canvas;
}

export function PresentPage() {
  const data = useAppStore((s) => s.data);
  const activeClass = useAppStore((s) => s.activeClass);
  const recordAssignment = useAppStore((s) => s.recordAssignment);
  const update = useAppStore((s) => s.update);
  const pushToast = useToasts((s) => s.push);

  const groupSettings = useGroupSettings((s) => s.settings);
  const loadGroupSettings = useGroupSettings((s) => s.load);
  const recordRoles = useGroupSettings((s) => s.recordRoles);

  const reducedMotion = useReducedMotion();
  const [muted, setMutedState] = useState(() => isMuted());
  const [swapFirst, setSwapFirst] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [rolesByStudent, setRolesByStudent] = useState<Record<string, string>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const rolesDrawRef = useRef(0);
  // 교실 TV(1920x1080)에서 뒷자리 학생도 읽을 수 있도록 배치도를 남는 공간만큼 키운다.
  // SeatBoard의 lg 크기가 기준값이고, 여기서는 그 결과를 통째로 확대·축소만 한다.
  const [boardScale, setBoardScale] = useState(1);

  // 배치도를 남는 공간에 맞춰 확대한다. offsetWidth/offsetHeight는 transform 이전의
  // 레이아웃 크기라 확대해도 값이 변하지 않으므로 되먹임 루프가 생기지 않는다.
  useEffect(() => {
    const area = boardAreaRef.current;
    const board = boardRef.current;
    if (!area || !board) return;
    const compute = () => {
      const availW = area.clientWidth;
      const availH = area.clientHeight;
      const naturalW = board.offsetWidth;
      const naturalH = board.offsetHeight;
      if (!availW || !availH || !naturalW || !naturalH) return;
      const next = Math.min(availW / naturalW, availH / naturalH);
      setBoardScale(Math.min(2.6, Math.max(0.4, next)));
    };
    compute();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(compute);
    ro?.observe(area);
    ro?.observe(board);
    window.addEventListener('resize', compute);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  const play = useCallback((kind: SoundKind) => playSound(kind), []);
  const seq = useDrawSequence({
    data,
    onAssigned: recordAssignment,
    reducedMotion,
    playSound: play,
  });

  const teacherView = data.viewPerspective === 'teacher';

  useEffect(() => {
    loadGroupSettings(activeClass);
  }, [activeClass, loadGroupSettings]);

  // 모둠 역할은 뽑기 한 번에 한 번만 배정한다. 자리 교환으로 매핑이 바뀌어도
  // 역할은 학생을 따라가므로 다시 배정하지 않는다(역할이 갑자기 뒤바뀌지 않게).
  useEffect(() => {
    if (seq.drawId === rolesDrawRef.current) return;
    rolesDrawRef.current = seq.drawId;
    if (!seq.mapping || data.layoutType !== 'group') {
      setRolesByStudent({});
      return;
    }
    const groups = groupsFromMapping(seq.mapping, data);
    const { byStudent, relaxed } = assignRoles({
      groups,
      roles: groupSettings.roles,
      roleHistory: groupSettings.roleHistory,
    });
    setRolesByStudent(byStudent);
    recordRoles(byStudent);
    if (relaxed) pushToast('직전과 같은 역할을 피하지 못해 일부 역할이 겹칩니다.');
  }, [seq.drawId, seq.mapping, data, groupSettings.roles, groupSettings.roleHistory, recordRoles, pushToast]);

  const seatRoles = useMemo(() => {
    const out: Record<number, string> = {};
    if (!seq.mapping) return out;
    for (const [seat, name] of Object.entries(seq.mapping)) {
      const role = Object.hasOwn(rolesByStudent, name) ? rolesByStudent[name] : undefined;
      if (role) out[Number(seat)] = role;
    }
    return out;
  }, [seq.mapping, rolesByStudent]);

  const groupNames = useMemo(() => {
    const out: Record<number, string> = {};
    groupSettings.names.forEach((name, i) => {
      if (name) out[i] = name;
    });
    return out;
  }, [groupSettings.names]);

  const isGroup = data.layoutType === 'group';
  const hasResult = seq.mapping !== null;
  // 카운트다운·셔플·줄 공개 중에는 조작 막대를 감춘다. 한 명씩 뽑기의 짧은
  // 공개 사이에는 막대를 남겨 두고 버튼만 잠근다(막대가 깜빡이지 않게).
  const drawing = seq.phase === 'countdown' || seq.phase === 'shuffling' || seq.phase === 'revealing';
  const canSwap = hasResult && seq.revealedSeats === 'all' && !seq.running;

  const handleSeatClick = useCallback(
    (seat: number) => {
      if (swapFirst === null) {
        setSwapFirst(seat);
        return;
      }
      if (swapFirst === seat) {
        setSwapFirst(null);
        return;
      }
      const nameA = seq.mapping?.[swapFirst] ?? '빈 자리';
      const nameB = seq.mapping?.[seat] ?? '빈 자리';
      seq.swap(swapFirst, seat);
      setSwapFirst(null);
      pushToast(`${nameA} - ${nameB} 자리를 바꿨습니다.`);
    },
    [pushToast, seq, swapFirst],
  );

  const togglePerspective = useCallback(() => {
    update({ viewPerspective: teacherView ? 'student' : 'teacher' });
  }, [teacherView, update]);

  const toggleSound = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playSound('tick');
  }, [muted]);

  const saveImage = useCallback(() => {
    const root = boardRef.current;
    if (!root) return;
    // renderBoardToCanvas는 getBoundingClientRect로 좌표를 읽고 글자 크기는 상수로 그린다.
    // 확대된 상태 그대로 읽으면 상자만 커지고 글자는 그대로라 비율이 깨지므로,
    // 캡처하는 동안만 확대를 끄고 원래 크기의 좌표를 읽는다.
    const restore = root.style.transform;
    root.style.transform = 'translate(-50%, -50%)';
    const canvas = renderBoardToCanvas(root, teacherView);
    root.style.transform = restore;
    if (!canvas || typeof canvas.toBlob !== 'function') {
      pushToast('이미지 저장에 실패했습니다.');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        pushToast('이미지 저장에 실패했습니다.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix = teacherView ? '_선생님시선' : '';
      link.download = `자리배치${suffix}_${new Date().toISOString().slice(0, 10)}.${IMAGE_EXT}`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast('이미지로 저장했습니다.');
    }, 'image/png');
  }, [pushToast, teacherView]);

  // 인쇄: 학생 시선·선생님 시선 양면 보기를 만든 뒤 인쇄하고 정리한다
  // (legacy/js/screens/student-screen.js:788-835와 같은 구성).
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done, { once: true });
    // afterprint를 지원하지 않는 환경 폴백
    const timer = window.setTimeout(done, 5000);
    try {
      window.print();
    } catch {
      done();
    }
    return () => {
      window.removeEventListener('afterprint', done);
      window.clearTimeout(timer);
    };
  }, [printing]);

  const highlightSeats = useMemo(() => {
    const out: number[] = [];
    if (swapFirst !== null) out.push(swapFirst);
    if (seq.spotlightSeat !== null) out.push(seq.spotlightSeat);
    return out;
  }, [seq.spotlightSeat, swapFirst]);

  const boardProps = {
    data,
    mapping: seq.mapping ?? undefined,
    size: 'lg' as const,
    perspective: data.viewPerspective,
    groupNames: isGroup ? groupNames : undefined,
    roles: isGroup ? seatRoles : undefined,
  };

  return (
    <main data-page="present" className="flex min-h-screen flex-col texture-cork p-4 md:p-8">
      <div className="present-screen-only mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6">
        <header className="flex items-center gap-4">
          <ChalkBoard label={`${activeClass} 자리 배치`} className="flex-1" />
        </header>

        {/*
          transform: scale은 그리기만 바꾸고 레이아웃 크기는 그대로 두기 때문에,
          배치도를 일반 흐름에 두면 작은 화면에서 원래 크기만큼 자리를 차지해
          세로 스크롤이 생긴다. 절대 위치로 띄워 남는 공간에만 그린다.
        */}
        <div ref={boardAreaRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={boardRef}
          data-present="board"
          style={{ transform: `translate(-50%, -50%) scale(${boardScale})` }}
          className={`absolute left-1/2 top-1/2 origin-center ${seq.spotlightSeat !== null ? 'present-spotlight' : ''}`}
        >
          <SeatBoard
            {...boardProps}
            revealedSeats={seq.phase === 'idle' || seq.phase === 'failed' ? 'all' : seq.revealedSeats}
            flipping={seq.phase === 'shuffling'}
            highlightSeats={highlightSeats}
            onSeatClick={canSwap ? handleSeatClick : undefined}
          />
        </div>
        </div>

        {seq.failure && (
          <p
            data-present="failure"
            data-reason={seq.failure.reason}
            className="rounded-note bg-paper p-6 text-center font-hand text-[34px] font-bold text-ink shadow-card"
          >
            {seq.failure.detail}
          </p>
        )}

        {/*
          이력 배제 완화 안내는 스토어 recordAssignment가 loadNotice로 세우고
          ToastHost가 토스트로 띄운다. 여기에 배너를 또 두면 같은 말이 두 번 나온다.
        */}

        {seq.violations.length > 0 && (
          <section data-present="violations" className="rounded-note bg-paper p-4 text-ink shadow-card">
            <h2 className="font-hand text-[24px] font-bold">규칙 위반 {seq.violations.length}건</h2>
            <ul className="mt-2 list-disc pl-6 font-body text-[16px]">
              {seq.violations.map((v) => (
                <li key={`${v.kind}-${v.message}`}>{v.message}</li>
              ))}
            </ul>
          </section>
        )}

        {swapFirst !== null && (
          <p data-present="swap-hint" className="text-center font-body text-[18px] font-bold text-ink">
            {swapFirst + 1}번 자리를 골랐습니다. 바꿀 자리를 하나 더 누르세요.
          </p>
        )}

        {seq.lotteryName && (
          <p data-present="lottery-name" className="text-center font-hand text-[34px] font-bold text-ink">
            {seq.lotteryName}
          </p>
        )}

        {!drawing && (
          <footer
            data-present="controls"
            className="flex flex-wrap items-center justify-center gap-3 rounded-note bg-paper p-4 shadow-card"
          >
            <WoodButton
              size="lg"
              variant="primary"
              disabled={seq.running}
              onClick={() => void seq.start()}
              icon={
                hasResult ? (
                  <RotateCcw size={22} aria-hidden="true" className="pointer-events-none" />
                ) : (
                  <Play size={22} aria-hidden="true" className="pointer-events-none" />
                )
              }
            >
              {hasResult ? '다시 뽑기' : '자리 뽑기'}
            </WoodButton>

            {seq.phase === 'lottery' ? (
              <>
                <WoodButton
                  size="lg"
                  variant="primary"
                  disabled={seq.running}
                  onClick={() => void seq.revealOne()}
                >
                  다음 학생 공개
                </WoodButton>
                <WoodButton variant="secondary" disabled={seq.running} onClick={seq.revealAll}>
                  모두 공개
                </WoodButton>
              </>
            ) : (
              <WoodButton
                variant="secondary"
                disabled={seq.running}
                onClick={() => void seq.startLottery()}
                icon={<UserRound size={18} aria-hidden="true" className="pointer-events-none" />}
              >
                한 명씩 뽑기
              </WoodButton>
            )}

            <WoodButton
              variant="secondary"
              onClick={togglePerspective}
              aria-label={`${teacherView ? '선생님 시선' : '학생 시선'} (누르면 시점이 바뀝니다)`}
              icon={<Eye size={18} aria-hidden="true" className="pointer-events-none" />}
            >
              {teacherView ? '선생님 시선' : '학생 시선'}
            </WoodButton>

            <WoodButton
              variant="secondary"
              onClick={toggleSound}
              icon={
                muted ? (
                  <VolumeX size={18} aria-hidden="true" className="pointer-events-none" />
                ) : (
                  <Volume2 size={18} aria-hidden="true" className="pointer-events-none" />
                )
              }
            >
              {muted ? '소리 켜기' : '소리 끄기'}
            </WoodButton>

            <WoodButton
              variant="secondary"
              onClick={saveImage}
              disabled={!hasResult || seq.running}
              icon={<ImageDown size={18} aria-hidden="true" className="pointer-events-none" />}
            >
              이미지 저장
            </WoodButton>

            <WoodButton
              variant="secondary"
              onClick={() => setPrinting(true)}
              disabled={!hasResult || seq.running}
              icon={<Printer size={18} aria-hidden="true" className="pointer-events-none" />}
            >
              인쇄
            </WoodButton>

            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-4 py-2 font-hand text-[15px] font-bold text-ink shadow-note"
            >
              <ArrowLeft size={18} aria-hidden="true" className="pointer-events-none" />
              교사 화면으로
            </a>
          </footer>
        )}
      </div>

      {seq.countdown !== null && (
        <div
          data-present="countdown"
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/70"
        >
          <span className="present-countdown-number font-hand text-[180px] font-bold leading-none text-paper">
            {seq.countdown}
          </span>
        </div>
      )}

      <Confetti active={seq.confetti} />

      {printing && hasResult && (
        <div className="present-print-only">
          <p className="font-body text-[18px] font-bold text-ink">[ 학생 시선 ]</p>
          <SeatBoard {...boardProps} perspective="student" />
          <p className="mt-6 font-body text-[18px] font-bold text-ink">[ 선생님 시선 ]</p>
          <SeatBoard {...boardProps} perspective="teacher" />
        </div>
      )}

      <ToastHost />
    </main>
  );
}
