// 발표 화면 효과음. 오디오 파일 없이 Web Audio API로 합성한다(스펙 6절).
// AudioContext는 첫 사용자 조작 때 만들고, 지원하지 않는 환경(jsdom 등)에서는 조용히 무시한다.

export type SoundKind = 'tick' | 'shuffle' | 'reveal' | 'fanfare';

/** 음소거 상태 저장 키 (스펙 6절) */
export const SOUND_KEY = 'seat-changer-sound';

type AudioContextCtor = new () => AudioContext;

interface Note {
  /** 시작 주파수(Hz) */
  freq: number;
  /** 끝 주파수(Hz). 있으면 그 사이를 미끄러진다. */
  endFreq?: number;
  /** 시작 시각 오프셋(초) */
  at: number;
  /** 길이(초) */
  dur: number;
  type: OscillatorType;
  gain: number;
}

// 코르크 톤에 맞춘 짧고 부드러운 소리. 볼륨은 교실 스피커를 고려해 낮게 잡았다.
const RECIPES: Record<SoundKind, Note[]> = {
  tick: [{ freq: 880, at: 0, dur: 0.05, type: 'square', gain: 0.05 }],
  shuffle: [
    { freq: 320, at: 0, dur: 0.05, type: 'triangle', gain: 0.04 },
    { freq: 420, at: 0.06, dur: 0.05, type: 'triangle', gain: 0.04 },
    { freq: 360, at: 0.12, dur: 0.05, type: 'triangle', gain: 0.04 },
    { freq: 480, at: 0.18, dur: 0.05, type: 'triangle', gain: 0.04 },
    { freq: 400, at: 0.24, dur: 0.05, type: 'triangle', gain: 0.04 },
  ],
  reveal: [{ freq: 660, endFreq: 990, at: 0, dur: 0.16, type: 'triangle', gain: 0.07 }],
  fanfare: [
    { freq: 523.25, at: 0, dur: 0.22, type: 'triangle', gain: 0.08 },
    { freq: 659.25, at: 0.12, dur: 0.22, type: 'triangle', gain: 0.08 },
    { freq: 783.99, at: 0.24, dur: 0.22, type: 'triangle', gain: 0.08 },
    { freq: 1046.5, at: 0.36, dur: 0.4, type: 'triangle', gain: 0.09 },
  ],
};

let ctx: AudioContext | null = null;
let mutedCache: boolean | null = null;

function contextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** 첫 호출 때만 AudioContext를 만든다. 만들 수 없으면 null. */
function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = contextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isMuted(): boolean {
  if (mutedCache === null) {
    mutedCache = false;
    try {
      if (typeof window !== 'undefined') {
        mutedCache = window.localStorage.getItem(SOUND_KEY) === 'off';
      }
    } catch {
      mutedCache = false;
    }
  }
  return mutedCache;
}

export function setMuted(next: boolean): void {
  mutedCache = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SOUND_KEY, next ? 'off' : 'on');
    }
  } catch {
    // 저장하지 못해도 이번 세션의 음소거 상태는 유지한다.
  }
}

function playNote(ac: AudioContext, start: number, note: Note): void {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = note.type;
  const t0 = start + note.at;
  const t1 = t0 + note.dur;
  osc.frequency.setValueAtTime(note.freq, t0);
  if (note.endFreq !== undefined) osc.frequency.linearRampToValueAtTime(note.endFreq, t1);
  // 딸깍 소리를 막으려고 짧게 올렸다가 지수로 내린다.
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(amp);
  amp.connect(ac.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

export function playSound(kind: SoundKind): void {
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    // 사용자 조작 전에는 정지 상태로 만들어지는 브라우저가 있다.
    if (ac.state === 'suspended') void ac.resume();
    const start = ac.currentTime;
    for (const note of RECIPES[kind]) playNote(ac, start, note);
  } catch {
    // 오디오를 지원하지 않거나 재생이 막힌 환경에서는 조용히 넘어간다.
  }
}
