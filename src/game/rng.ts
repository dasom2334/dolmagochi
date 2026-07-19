/** [0, 1) 난수 생성기. 모든 로직은 이 타입을 주입받아 테스트에서 시드 고정이 가능하다. */
export type Rng = () => number;

/** 시드 기반 결정적 RNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = Math.random;

/** min 이상 max 이하 정수 균등 추출. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 배열에서 균등 추출. 빈 배열이면 undefined. */
export function pick<T>(rng: Rng, arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

/** FNV-1a 문자열 해시 (uint32) — 결정적 파생값(오늘의 기분·도감 타일 문양)의 공용 씨앗 */
export function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
