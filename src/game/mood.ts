/**
 * 오늘의 기분 (M17) — 기분 수치(mood)를 삭제한 뒤, "어떤 날은 좋고 어떤 날은
 * 나쁘다"를 순수 서술로만 남긴다. 게임 수치엔 아무 영향이 없다 (관찰 문구의 톤만).
 * 날짜로 고정되어 하루 내내 같은 결이고(세션마다 흔들리지 않는다), 날씨가 가볍게
 * 기울인다 — 맑은 날은 밝은 쪽으로, 비 오는 날은 가라앉는 쪽으로.
 */
import type { TextCatalog } from './text';
import type { WeatherKind } from './types';
import { fnv1a } from './rng';

export type MoodTone = 'bright' | 'calm' | 'low';

const POOL: Record<MoodTone, string> = {
  bright: 'sys.mood.bright',
  calm: 'sys.mood.calm',
  low: 'sys.mood.low',
};

/** 달력일 키 → 0~1 안정 해시 — 같은 날은 늘 같은 값 (공용 fnv1a 기반) */
function dayHash(dayKey: string): number {
  return fnv1a(dayKey) / 4294967296;
}

export function dailyMoodTone(dayKey: string, weather: WeatherKind): MoodTone {
  const r = dayHash(dayKey);
  // 기본 1/3씩, 날씨가 경계를 민다 (수치 아님 — 확률만)
  let bright = 0.34;
  let low = 0.33;
  if (weather === 'clear' || weather === 'petals' || weather === 'grass') {
    bright += 0.16;
    low -= 0.11;
  } else if (weather === 'rain' || weather === 'downpour' || weather === 'snow') {
    bright -= 0.12;
    low += 0.16;
  }
  if (r < bright) return 'bright';
  if (r > 1 - low) return 'low';
  return 'calm';
}

/** 그날의 기분 서술 한 줄 — 톤은 날짜·날씨로, 변형은 날짜로 고정 추첨 */
export function dailyMoodLine(
  catalog: TextCatalog,
  dayKey: string,
  weather: WeatherKind,
): string | null {
  const tone = dailyMoodTone(dayKey, weather);
  const variants = catalog[POOL[tone]];
  if (!variants || variants.length === 0) return null;
  // 변형 선택도 날짜로 — 톤 안에서도 날마다 다른 문구가 나오되 하루엔 고정
  const idx = Math.floor(dayHash(dayKey + '~') * variants.length);
  return (variants[idx] ?? variants[0]).join('\n');
}
