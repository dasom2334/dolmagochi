import { BALANCE } from './balance';
import type { FlowtimeSettings } from './types';

/** 기본 Flowtime 배정표 — 기획서 규칙(REST_TABLE)에서 파생. bounds=[25,50,90], rests=[5,10,20,30]. */
export const DEFAULT_FLOWTIME: FlowtimeSettings = {
  bounds: BALANCE.REST_TABLE.slice(0, -1).map(([b]) => b),
  rests: BALANCE.REST_TABLE.map(([, r]) => r),
};

/** 방어 복제 — 상태에 넣을 새 인스턴스(기본 배열을 공유·변형하지 않도록). */
export function cloneFlowtime(f: FlowtimeSettings = DEFAULT_FLOWTIME): FlowtimeSettings {
  return { bounds: [...f.bounds], rests: [...f.rests] };
}

/**
 * Flowtime 휴식 길이 산정(분). 기본 배정표는 기획서 규칙(<25→5·25~50→10·50~90→20·90+→30),
 * 사용자가 설정에서 수정하면 그 표(flowtime)를 쓴다.
 */
export function restMinutesFor(
  focusMinutes: number,
  flowtime: FlowtimeSettings = DEFAULT_FLOWTIME,
): number {
  const { bounds, rests } = flowtime;
  for (let i = 0; i < bounds.length; i++) {
    if (focusMinutes < bounds[i]) return rests[i];
  }
  return rests[rests.length - 1];
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
