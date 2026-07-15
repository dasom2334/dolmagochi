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
 * 어떤 입력이든 유효한 배정표로 정규화한다 — SET_FLOWTIME·세이브 로드/임포트 공용.
 * 불변식을 강제해 restMinutesFor가 절대 undefined/NaN을 내지 않게 한다:
 * - 원소는 양의 정수(clamp), bounds는 오름차순 정렬(라벨=실제 배정 일치)
 * - rests.length === bounds.length + 1 (부족하면 마지막 값으로 채우고, 남으면 자른다)
 * 구조 자체가 배열이 아니면 기본 배정표로 폴백.
 */
export function normalizeFlowtime(input: unknown): FlowtimeSettings {
  const f = input as { bounds?: unknown; rests?: unknown } | null | undefined;
  if (!f || !Array.isArray(f.bounds) || !Array.isArray(f.rests)) {
    return cloneFlowtime();
  }
  const clamp = (n: unknown) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) && v >= 1 ? v : 1;
  };
  const bounds = f.bounds.map(clamp).sort((a, b) => a - b);
  const rests = f.rests.map(clamp);
  const target = bounds.length + 1;
  while (rests.length < target) rests.push(rests[rests.length - 1] ?? 5);
  rests.length = target; // 남는 항목은 자른다
  return { bounds, rests };
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
