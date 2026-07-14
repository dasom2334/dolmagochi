import { BALANCE } from './balance';

/** Flowtime 휴식 길이 산정: <25→5, 25–50→10, 50–90→20, ≥90→30 (분). */
export function restMinutesFor(focusMinutes: number): number {
  for (const [maxExclusive, restMin] of BALANCE.REST_TABLE) {
    if (focusMinutes < maxExclusive) return restMin;
  }
  return BALANCE.REST_TABLE[BALANCE.REST_TABLE.length - 1][1];
}

export interface Care {
  points: number;
  carryMinutes: number;
}

/**
 * 정성 이월 누적: 집중 분을 carryMinutes에 더하고,
 * 25분이 찰 때마다 1정성으로 환산. 나머지는 이월.
 */
export function accrueCare(care: Care, focusMinutes: number): Care {
  const total = care.carryMinutes + focusMinutes;
  const gained = Math.floor(total / BALANCE.CARE_MINUTES_PER_POINT);
  return {
    points: care.points + gained,
    carryMinutes: total - gained * BALANCE.CARE_MINUTES_PER_POINT,
  };
}

/** 초 → "MM:SS" 또는 "H:MM:SS" (일지 타임스탬프용) */
export function formatElapsed(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}
