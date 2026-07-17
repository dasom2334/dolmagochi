import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { timeOfDayAt } from '../timeOfDay';
import { deriveLayers } from '../../audio/layers';
import { createInitialState, transition } from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const DAY = 86_400_000;

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(1)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}

describe('timeOfDayAt — 시간대 판정 (M12)', () => {
  const at = (h: number) => timeOfDayAt(new Date(2026, 0, 10, h, 30).getTime());
  it('한낮 08–17, 동틀녘·해질녘 06–08/17–19, 그 외 밤', () => {
    expect(at(10)).toBe('day');
    expect(at(7)).toBe('twilight');
    expect(at(17)).toBe('twilight');
    expect(at(22)).toBe('night');
    expect(at(3)).toBe('night');
  });
});

describe('날씨 (M12) — 자연 변화·정성 변경·게이지 무영향', () => {
  it('SETTLE: 달력일당 1회 자연 추첨, 같은 날 재호출은 유지', () => {
    let s = createInitialState(T0, 'lie');
    // rng 0.95 → 누적표 마지막(눈)
    s = run(s, [{ type: 'SETTLE', nowMs: T0 }], seq([0.95]));
    expect(s.weather).toBe('snow');
    // 같은 날 → 그대로 (rng 0.1이라도)
    s = run(s, [{ type: 'SETTLE', nowMs: T0 + 3_600_000 }], seq([0.1]));
    expect(s.weather).toBe('snow');
    // 다음 날 → 재추첨 (0.1 → 맑음)
    s = run(s, [{ type: 'SETTLE', nowMs: T0 + DAY }], seq([0.1]));
    expect(s.weather).toBe('clear');
  });

  it('SET_WEATHER: 정성 지불, 부족하면 불가, 같은 날씨는 무료 no-op', () => {
    const base = createInitialState(T0, 'lie');
    const rich: GameState = { ...base, care: { points: 3, carryMinutes: 0 } };
    const changed = run(rich, [{ type: 'SET_WEATHER', weather: 'rain', nowMs: T0 }]);
    expect(changed.weather).toBe('rain');
    expect(changed.care.points).toBe(3 - BALANCE.WEATHER_CHANGE_COST);
    // 같은 날씨 → no-op
    expect(run(changed, [{ type: 'SET_WEATHER', weather: 'rain', nowMs: T0 }]).care.points)
      .toBe(changed.care.points);
    // 정성 부족 → 불가
    const poor: GameState = { ...base, care: { points: 0, carryMinutes: 0 } };
    expect(run(poor, [{ type: 'SET_WEATHER', weather: 'rain', nowMs: T0 }]).weather).toBe('clear');
  });

  it('우산 플로우: 비 오는 산책 + 우산 보유 → 대기 → 선택 후 시작', () => {
    const base = createInitialState(T0, 'lie');
    let s: GameState = {
      ...base,
      weather: 'rain',
      selectedAction: 'walk',
      items: { shoes: { placed: false }, umbrella: { placed: false } },
    };
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(s.pendingUmbrella).toBe(true);
    expect(s.phase).toBe('actionSelect'); // 아직 시작 안 함
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0, umbrella: true }]);
    expect(s.phase).toBe('focus');
    expect(s.session.umbrella).toBe(true);
  });

  it('젖음: 우산 없이 비 산책 → wetness + 관찰 문장, 우산 쓰면 없음 (게이지 무영향)', () => {
    const base = createInitialState(T0, 'lie');
    const start: GameState = {
      ...base,
      weather: 'downpour',
      selectedAction: 'walk',
      items: { shoes: { placed: false }, umbrella: { placed: false } },
    };
    const moodBefore = start.stats.mood;
    let s = run(start, [
      { type: 'START_FOCUS', nowMs: T0, umbrella: false },
      { type: 'END_FOCUS', nowMs: T0 + 60_000 },
    ]);
    expect(s.session.wetness).toBe('wet');
    expect(s.stats.mood).toBeGreaterThanOrEqual(moodBefore); // B12: 게이지 무영향
    // 다음 세션 시작에 사라진다
    s = run(s, [{ type: 'REST_END' }, { type: 'START_FOCUS', nowMs: T0, umbrella: true }]);
    expect(s.session.wetness).toBeNull();
    // 우산 경로
    const dry = run(start, [
      { type: 'START_FOCUS', nowMs: T0, umbrella: true },
      { type: 'END_FOCUS', nowMs: T0 + 60_000 },
    ]);
    expect(dry.session.wetness).toBeNull();
  });
});

describe('deriveLayers — 날씨 레이어 (M12)', () => {
  it('실내 비 = 창밖의 비, 야외 비 = 빗속(새소리 물러남), 우산 = 우산 소리', () => {
    expect(
      deriveLayers({ phase: 'room', actionId: null, ownedItems: [], weather: 'rain' }),
    ).toContain('rainSoft');
    const outdoor = deriveLayers({
      phase: 'focus', actionId: 'walk', ownedItems: [], weather: 'downpour',
    });
    expect(outdoor).toContain('rainHard');
    expect(outdoor).not.toContain('birdsWind');
    expect(
      deriveLayers({
        phase: 'focus', actionId: 'walk', ownedItems: [], weather: 'rain', umbrella: true,
      }),
    ).toContain('umbrellaRain');
    // 눈·맑음은 빗소리 없음
    expect(
      deriveLayers({ phase: 'room', actionId: null, ownedItems: [], weather: 'snow' }),
    ).not.toContain('rainSoft');
  });
});
