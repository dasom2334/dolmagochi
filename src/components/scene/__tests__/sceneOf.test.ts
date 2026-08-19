import { describe, expect, it } from 'vitest';
import { sceneOf } from '../CanvasScene';
import { createInitialState } from '../../../game/stateMachine';
import type { GameState, WeatherKind } from '../../../game/types';
import { BALANCE } from '../../../game/balance';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function base(over: Partial<GameState> = {}): GameState {
  return { ...createInitialState(T0, 'read'), ...over };
}

/**
 * 이 경계는 게임 id·날씨를 렌더러의 문자열 키로 손으로 옮기는 곳이라,
 * 키가 빠져도 타입 검사가 잡지 못한다. 빠진 것이 있으면 여기서 걸린다.
 */
describe('sceneOf — 게임 상태 → 씬 매핑', () => {
  it('모든 날씨가 렌더러가 아는 값으로 접힌다 — 조용히 맑음이 되지 않게', () => {
    // 렌더러가 실제로 분기하는 날씨 값(거실 SUN_HIDDEN·구름·입자 기준)
    const KNOWN = new Set([
      'clear',
      'cloud',
      'rain',
      'downpour',
      'snow',
      'fog',
      'petals',
    ]);
    const all = new Set<WeatherKind>();
    for (const table of Object.values(BALANCE.WEATHER_BY_SEASON))
      for (const [w] of table as [WeatherKind, number][]) all.add(w);

    expect(all.size).toBeGreaterThan(0);
    for (const w of all) {
      const { st } = sceneOf(base({ weather: w }));
      expect(
        KNOWN.has(st.weather as string),
        `날씨 '${w}' 가 렌더러가 모르는 '${st.weather}' 로 넘어간다`,
      ).toBe(true);
    }
  });

  it('거실 상점 소품은 사기 전엔 꺼져 있고 사면 켜진다', () => {
    const off0 = sceneOf(base()).off;
    // 벽난로·플로어램프·새모이통이 기본으로 꺼져 있어야 한다
    for (const layer of ['g-fireplace', 'fire', 'lamp', 'p-bird'])
      expect(off0.has(layer), `${layer} 가 구매 전에 켜져 있다`).toBe(true);

    const owned = sceneOf(
      base({
        items: {
          fireplace: { placed: true },
          floorlamp: { placed: true },
          birdfeeder: { placed: true },
        },
      }),
    ).off;
    for (const layer of ['g-fireplace', 'fire', 'lamp', 'p-bird'])
      expect(owned.has(layer), `${layer} 를 샀는데 여전히 꺼져 있다`).toBe(false);
  });

  it('부재 중에는 돌을 그리지 않는다', () => {
    const away = base({
      presence: { ...base().presence, state: 'absent' },
    });
    expect(sceneOf(away).st.orb).toBe('none');
    expect(sceneOf(base()).st.orb).not.toBe('none');
  });
});
