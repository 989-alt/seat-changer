// 난수 주입 (legacy/js/algorithm/seat-randomizer.js:28-36 이식)
// 레거시 shuffle은 Math.random을 직접 호출해 재현이 불가능했다.
// v2는 rng를 인자로 받아 같은 난수열이면 레거시와 동일한 순열을 만든다.

/** [0, 1) 범위의 난수를 돌려주는 함수 (Math.random 호환) */
export type Rng = () => number;

/**
 * Fisher-Yates shuffle (in-place)
 * 레거시 31-37행과 동일한 스왑 순서 — `Math.random()`만 `rng()`로 대체했다.
 * 호출자가 in-place 변형에 의존하므로 원본 배열을 그대로 돌려준다.
 */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

/**
 * mulberry32 — 시드 기반 결정적 난수 생성기.
 * 레거시에는 없다(테스트·재현용으로 v2에서 추가). 32비트 정수 시드.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
