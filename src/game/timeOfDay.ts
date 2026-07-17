import type { GameState, Season, TimeOfDay } from './types';

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

/**
 * 계절 판정 (M12) — 기기 날짜 기준 (북반구: 3–5 봄, 6–8 여름, 9–11 가을, 12–2 겨울).
 * 날씨 가용성이 계절에 의존한다: 눈=겨울, 꽃잎비=봄, 낙엽비=가을.
 */
export function seasonAt(nowMs: number): Season {
  const m = new Date(nowMs).getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** 설정 반영 — auto면 기기 날짜, 아니면 고정값 */
export function resolveSeason(
  settings: GameState['settings'],
  nowMs: number,
): Season {
  return settings.season === 'auto' ? seasonAt(nowMs) : settings.season;
}
