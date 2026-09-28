// 발표 화면(스펙 6절, 개선 스펙 2026-09-28). 전체화면으로 띄워 학생들이 함께 보는 화면이다.
// 뽑기 연출의 상태는 useDrawSequence, 조작 막대는 PresentControls, 이미지 그리기는
// boardImage가 맡는다. 이 파일은 화면 구성과 저장(스토어)·인쇄·시점 전환을 잇는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ToastHost } from '@/components/Toast';
import { SeatBoard } from '@/features/layout/SeatBoard';
import { assignRoles } from '@/core/groups/roles';
import { groupLayout } from '@/core/layouts/group';
import type { Assignment, ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { useGroupSettings } from '@/features/groups/useGroupSettings';
import { Confetti } from '@/features/present/Confetti';
import { PresentControls, type PresentStatus } from '@/features/present/PresentControls';
import { IMAGE_EXT, renderBoardToCanvas } from '@/features/present/boardImage';
import { loadableLastAssignment } from '@/features/present/lastAssignment';
import { fitPrintPage, PRINT_MARGIN_MM, type PrintFit } from '@/features/present/printFit';
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

/** 지난 배치를 불러오지 못했을 때의 안내(개선 스펙 3-4). */
const STALE_NOTICE = '명단이나 배치가 바뀌어 지난 배치는 불러오지 않았습니다.';

export function PresentPage() {
  const data = useAppStore((s) => s.data);
  const activeClass = useAppStore((s) => s.activeClass);
  const recordAssignment = useAppStore((s) => s.recordAssignment);
  const replaceLastAssignment = useAppStore((s) => s.replaceLastAssignment);
  const update = useAppStore((s) => s.update);
  const pushToast = useToasts((s) => s.push);

  const groupSettings = useGroupSettings((s) => s.settings);
  const loadGroupSettings = useGroupSettings((s) => s.load);
  const recordRoles = useGroupSettings((s) => s.recordRoles);

  const reducedMotion = useReducedMotion();
  const [muted, setMutedState] = useState(() => isMuted());
  const [swapFirst, setSwapFirst] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printFit, setPrintFit] = useState<PrintFit>({ orientation: 'landscape', zoom: 1 });
  const [rolesByStudent, setRolesByStudent] = useState<Record<string, string>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const rolesDrawRef = useRef(0);
  // 교실 TV(1920x1080)에서 뒷자리 학생도 읽을 수 있도록 배치도를 남는 공간만큼 키운다.
  // SeatBoard의 lg 크기가 기준값이고, 여기서는 그 결과를 통째로 확대·축소만 한다.
  const [boardScale, setBoardScale] = useState(1);

  // 처음 열 때 한 번만 지난 배치를 검사한다(개선 스펙 3-4). 교환 저장으로 data가
  // 바뀌어도 다시 검사하지 않는다(useDrawSequence도 initialMapping을 첫 렌더에만 읽는다).
  const [initial] = useState(() => loadableLastAssignment(data));
  const staleNotifiedRef = useRef(false);
  useEffect(() => {
    // StrictMode 개발 모드에서 effect가 두 번 돌아도 안내는 한 번만 띄운다.
    if (!initial.stale || staleNotifiedRef.current) return;
    staleNotifiedRef.current = true;
    pushToast(STALE_NOTICE);
  }, [initial.stale, pushToast]);

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
    onSwapped: replaceLastAssignment,
    initialMapping: initial.mapping,
    reducedMotion,
    playSound: play,
  });

  const teacherView = data.viewPerspective === 'teacher';

  useEffect(() => {
    loadGroupSettings(activeClass);
  }, [activeClass, loadGroupSettings]);

  // 모둠 역할은 뽑기 한 번에 한 번만 배정한다. 자리 교환으로 매핑이 바뀌어도
  // 역할은 학생을 따라가므로 다시 배정하지 않는다(역할이 갑자기 뒤바뀌지 않게).
  // 다시 연 지난 배치(drawId 0)에는 역할을 표시하지 않는다(개선 스펙 3-4 한계).
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
  // 카운트다운·셔플·줄 공개 중에는 조작 막대를 가린다(자리는 지킨다). 한 명씩 뽑기의
  // 짧은 공개 사이에는 막대를 그대로 두고 버튼만 잠근다(막대가 깜빡이지 않게).
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
    // renderBoardToCanvas는 getBoundingClientRect로 좌표를 읽는다. 확대된 상태 그대로 읽으면
    // 상자와 글자 비례가 흔들리므로, 캡처하는 동안만 확대를 끄고 원래 크기의 좌표를 읽는다.
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

  // 인쇄 용지 방향·배율(개선 스펙 3-3). 화면 배치도의 transform 이전 크기
  // (offsetWidth/offsetHeight)가 인쇄용 배치도와 같은 lg 크기다.
  const measurePrintFit = useCallback(
    (): PrintFit => fitPrintPage(boardRef.current?.offsetWidth ?? 0, boardRef.current?.offsetHeight ?? 0),
    [],
  );

  // 인쇄: 학생 시선·선생님 시선 양면 보기를 만든 뒤 인쇄한다
  // (legacy/js/screens/student-screen.js:788-835와 같은 구성).
  //
  // 양면 보기는 인쇄가 시작되는 순간에만 DOM에 올린다. 화면에는 배치도가 하나뿐이어야
  // 좌석 클릭·이미지 저장·E2E 선택자가 흔들리지 않기 때문이다. 브라우저는 beforeprint를
  // 처리한 뒤에 인쇄용 레이아웃을 잡으므로, 그 안에서 flushSync로 DOM(용지 방향 규칙 포함)을
  // 동기 반영하면 인쇄 버튼뿐 아니라 사용자가 직접 Ctrl+P를 눌러도 같은 결과가 나온다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const before = () =>
      flushSync(() => {
        setPrintFit(measurePrintFit());
        setPrinting(true);
      });
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [measurePrintFit]);

  const handlePrint = useCallback(() => {
    // beforeprint를 지원하지 않는 브라우저를 위해 버튼 경로에서도 직접 올려 둔다.
    flushSync(() => {
      setPrintFit(measurePrintFit());
      setPrinting(true);
    });
    try {
      window.print();
    } catch {
      // 인쇄를 막는 환경(테스트 등)에서는 조용히 넘어간다.
    }
    setPrinting(false);
  }, [measurePrintFit]);

  const highlightSeats = useMemo(() => {
    const out: number[] = [];
    if (swapFirst !== null) out.push(swapFirst);
    if (seq.spotlightSeat !== null) out.push(seq.spotlightSeat);
    return out;
  }, [seq.spotlightSeat, swapFirst]);

  // 조작 막대 상태 칸(고정 높이). 우선순위: 한 명씩 뽑기 이름 > 교환 중 안내 > 기본 안내.
  const status: PresentStatus | null = seq.lotteryName
    ? { text: seq.lotteryName, tone: 'lottery' }
    : swapFirst !== null
      ? { text: `${swapFirst + 1}번 자리를 골랐습니다. 바꿀 자리를 누르세요 (같은 자리를 다시 누르면 취소)`, tone: 'hint' }
      : canSwap
        ? { text: '두 자리를 차례로 누르면 서로 바뀝니다', tone: 'hint' }
        : null;

  const boardProps = {
    data,
    mapping: seq.mapping ?? undefined,
    size: 'lg' as const,
    perspective: data.viewPerspective,
    // 학생이 보는 화면·인쇄물에는 고정 자리를 드러내지 않는다(개선 스펙 3-5).
    showFixed: false,
    groupNames: isGroup ? groupNames : undefined,
    roles: isGroup ? seatRoles : undefined,
  };

  return (
    <main data-page="present" className="flex min-h-screen flex-col texture-cork p-3 md:p-4">
      <div className="present-screen-only mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-3">
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
            className={`absolute left-1/2 top-1/2 w-max origin-center ${seq.spotlightSeat !== null ? 'present-spotlight' : ''}`}
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

        <PresentControls
          classLabel={activeClass}
          status={status}
          hidden={drawing}
          hasResult={hasResult}
          running={seq.running}
          lottery={seq.phase === 'lottery'}
          teacherView={teacherView}
          muted={muted}
          onStart={() => void seq.start()}
          onStartLottery={() => void seq.startLottery()}
          onRevealOne={() => void seq.revealOne()}
          onRevealAll={seq.revealAll}
          onTogglePerspective={togglePerspective}
          onToggleSound={toggleSound}
          onSaveImage={saveImage}
          onPrint={handlePrint}
        />
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
          {/* 용지 방향은 배치도 모양에 맞춰 고른다(개선 스펙 3-3). 용지 크기는 프린터 설정을 따른다. */}
          <style>{`@page { size: ${printFit.orientation}; margin: ${PRINT_MARGIN_MM}mm; }`}</style>
          {/* 한 배치도가 페이지 경계에서 잘리지 않도록 시점별로 한 장씩 나눈다. */}
          <section className="present-print-page">
            <p className="present-print-title font-body text-[18px] font-bold text-ink">[ {activeClass} · 학생 시선 ]</p>
            <div className="present-print-board" style={{ zoom: printFit.zoom }}>
              <SeatBoard {...boardProps} perspective="student" />
            </div>
          </section>
          <section className="present-print-page">
            <p className="present-print-title font-body text-[18px] font-bold text-ink">[ {activeClass} · 선생님 시선 ]</p>
            <div className="present-print-board" style={{ zoom: printFit.zoom }}>
              <SeatBoard {...boardProps} perspective="teacher" />
            </div>
          </section>
        </div>
      )}

      <ToastHost />
    </main>
  );
}
