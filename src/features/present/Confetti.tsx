// 컨페티. 외부 라이브러리 없이 canvas + requestAnimationFrame으로 직접 그린다.
// 색은 코르크 팔레트(globals.css의 토큰 값)에서 가져왔다.
import { useEffect, useRef, useState } from 'react';

const COLORS = ['#E4B04A', '#D2553D', '#FFFBF0', '#FDE6B8', '#E8F1D9', '#7B5130'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
}

export interface ConfettiProps {
  active: boolean;
  count?: number;
  durationMs?: number;
}

function makePieces(count: number, width: number, height: number): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      x: Math.random() * width,
      // 화면 위쪽 바깥에서 떨어진다
      y: -Math.random() * height * 0.5,
      vx: (Math.random() - 0.5) * 120,
      vy: 120 + Math.random() * 220,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 6,
      w: 7 + Math.random() * 7,
      h: 10 + Math.random() * 10,
      color: COLORS[i % COLORS.length] as string,
    });
  }
  return pieces;
}

export function Confetti({ active, count = 140, durationMs = 2800 }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // active는 다음 뽑기를 시작할 때까지 true로 남는다. 캔버스는 화면 전체를 덮는
  // fixed 요소라 연출이 끝나면 스스로 내려가야 한다(인쇄·화면 캡처에 끼어들지 않게).
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    setFlying(active);
  }, [active]);

  useEffect(() => {
    if (!flying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    // 캔버스를 지원하지 않는 환경(테스트 등)에서는 조용히 내려간다.
    if (!ctx) {
      setFlying(false);
      return;
    }
    const draw = ctx;

    const width = window.innerWidth;
    const height = window.innerHeight;
    // 교실 TV·고해상도 화면에서 조각이 뭉개지지 않도록 백버퍼는 기기 픽셀로 잡고
    // 그리는 좌표는 CSS 픽셀 그대로 쓴다.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pieces = makePieces(count, width, height);

    let raf = 0;
    let last = performance.now();
    const started = last;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      draw.clearRect(0, 0, width, height);
      for (const p of pieces) {
        p.vy += 320 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        draw.save();
        draw.translate(p.x, p.y);
        draw.rotate(p.rot);
        draw.fillStyle = p.color;
        draw.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        draw.restore();
      }
      if (now - started < durationMs) {
        raf = requestAnimationFrame(frame);
        return;
      }
      draw.clearRect(0, 0, width, height);
      setFlying(false);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [flying, count, durationMs]);

  if (!flying) return null;
  return (
    <canvas
      ref={canvasRef}
      data-testid="confetti"
      aria-hidden="true"
      className="present-confetti pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}
