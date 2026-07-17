import type { GameState, TimeOfDay } from './types';

/**
 * 시간대 판정 (M12) — 씬 이미지·ASMR 소리에만 영향 (B23: UI 테마와 독립).
 * 06–08 동틀녘·17–19 해질녘 = twilight, 08–17 = day, 그 외 = night.
 */
export function timeOfDayAt(nowMs: number): TimeOfDay {
  const h = new Date(nowMs).getHours();
  if (h >= 8 && h < 17) return 'day';
  if ((h >= 6 && h < 8) || (h >= 17 && h < 19)) return 'twilight';
  return 'night';
}

/** 설정 반영 — auto면 실시간, 아니면 고정값 */
export function resolveTimeOfDay(
  settings: GameState['settings'],
  nowMs: number,
): TimeOfDay {
  return settings.timeOfDay === 'auto' ? timeOfDayAt(nowMs) : settings.timeOfDay;
}
