import { describe, expect, it } from 'vitest';

import { seasonAt, timeOfDayAt } from '../timeOfDay';
import { ALL_LAYERS, deriveLayers } from '../../audio/layers';
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

describe('날씨 (M12) — 자연 변화·직접 변경·게이지 무영향', () => {
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

  it('SET_WEATHER: 무료(M22)·계절 의존 (T0=1월 겨울: 눈만, 비 불가)', () => {
    const base = createInitialState(T0, 'lie');
    // 겨울에 비는 고를 수 없다 (계절 의존)
    expect(run(base, [{ type: 'SET_WEATHER', weather: 'rain', nowMs: T0 }]).weather).toBe('clear');
    const changed = run(base, [{ type: 'SET_WEATHER', weather: 'snow', nowMs: T0 }]);
    expect(changed.weather).toBe('snow');
    // 정성 0이어도 바꿀 수 있고, 정성이 깎이지도 않는다
    const poor: GameState = { ...base, care: { points: 0, carryMinutes: 0 } };
    const free = run(poor, [{ type: 'SET_WEATHER', weather: 'snow', nowMs: T0 }]);
    expect(free.weather).toBe('snow');
    expect(free.care.points).toBe(0);
    // 집중 중에는 바꿀 수 없다 (우산 판정 모순 방지)
    const focusing: GameState = { ...base, phase: 'focus' };
    expect(run(focusing, [{ type: 'SET_WEATHER', weather: 'snow', nowMs: T0 }]).weather)
      .toBe('clear');
  });

  it('계절 (M12): 자동 판정·고정 설정·무효 날씨 재추첨·계절 전용 날씨', () => {
    // 1월=겨울, 4월=봄, 7월=여름, 10월=가을
    expect(seasonAt(new Date(2026, 3, 10).getTime())).toBe('spring');
    expect(seasonAt(new Date(2026, 6, 10).getTime())).toBe('summer');
    expect(seasonAt(new Date(2026, 9, 10).getTime())).toBe('autumn');
    expect(seasonAt(T0)).toBe('winter');
    // 겨울 눈 상태에서 봄으로 고정 → 눈은 봄에 무효 → 재추첨 (rng 0.9 → 꽃잎비)
    const base = createInitialState(T0, 'lie');
    let s: GameState = { ...base, weather: 'snow' };
    s = run(s, [{ type: 'SET_SEASON', mode: 'spring', nowMs: T0 }], seq([0.9]));
    expect(s.settings.season).toBe('spring');
    expect(s.weather).toBe('petals'); // 봄 표 [맑음 .5, 비 .2, 꽃잎비 .3]의 끝
    // 봄 고정 상태에서는 꽃잎비를 고를 수 있다
    const rich: GameState = { ...s, care: { points: 2, carryMinutes: 0 }, weather: 'clear' };
    expect(run(rich, [{ type: 'SET_WEATHER', weather: 'petals', nowMs: T0 }]).weather).toBe('petals');
    // 겨울로 되돌리면 꽃잎비는 무효 → 재추첨
    const back = run(
      { ...rich, weather: 'petals' },
      [{ type: 'SET_SEASON', mode: 'winter', nowMs: T0 }],
      seq([0.1]),
    );
    expect(back.weather).toBe('clear');
  });

  it('꽃잎비·낙엽비는 마른 날씨 — 우산 플로우·젖음 없음', () => {
    const base = createInitialState(T0, 'lie');
    let s: GameState = {
      ...base,
      weather: 'petals',
      selectedAction: 'walk',
      items: { shoes: { placed: false }, umbrella: { placed: false } },
    };
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(s.pendingUmbrella).toBe(false);
    expect(s.phase).toBe('focus'); // 바로 출발
    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 + 60_000 }]);
    expect(s.session.wetness).toBeNull();
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
    let s = run(start, [
      { type: 'START_FOCUS', nowMs: T0, umbrella: false },
      { type: 'END_FOCUS', nowMs: T0 + 60_000 },
    ]);
    expect(s.session.wetness).toBe('wet'); // B12: 날씨는 서술만, 게이지 무영향
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

  it('여름 매미: 낮·황혼에만, 밤·비·다른 계절엔 없음 — 실내에도 창 너머로', () => {
    const base = { phase: 'focus' as const, actionId: 'walk', ownedItems: [] };
    expect(
      deriveLayers({ ...base, season: 'summer', timeOfDay: 'day', weather: 'clear' }),
    ).toContain('cicadas');
    expect(
      deriveLayers({ phase: 'room', actionId: null, ownedItems: [], season: 'summer', timeOfDay: 'twilight', weather: 'clear' }),
    ).toContain('cicadas');
    expect(
      deriveLayers({ ...base, season: 'summer', timeOfDay: 'night', weather: 'clear' }),
    ).not.toContain('cicadas');
    expect(
      deriveLayers({ ...base, season: 'summer', timeOfDay: 'day', weather: 'rain' }),
    ).not.toContain('cicadas');
    expect(
      deriveLayers({ ...base, season: 'autumn', timeOfDay: 'day', weather: 'clear' }),
    ).not.toContain('cicadas');
  });
});

describe('소리풍경 모드 (M22) — 자동 / 완전 커스텀', () => {
  it('커스텀 진입은 지금 들리던 소리에서 출발한다 (13겹 동시 재생 방지)', () => {
    const base = createInitialState(T0, 'lie');
    const s = run(base, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    expect(s.settings.noiseMode).toBe('custom');
    // 진입 시점에 울리던 레이어만 켜져 있다 = 나머지는 전부 음소거 목록에
    const audible = ALL_LAYERS.filter((l) => !s.settings.noiseMuted.includes(l));
    expect(audible).toEqual(
      deriveLayers({
        phase: 'room',
        actionId: null,
        ownedItems: [],
        weather: base.weather,
        umbrella: false,
        season: 'winter',
        timeOfDay: timeOfDayAt(T0),
      }),
    );
  });

  it('커스텀에서 켠 레이어는 상황을 무시하고 남는다 (겨울 매미)', () => {
    const base = createInitialState(T0, 'lie'); // T0 = 1월 겨울
    let s = run(base, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    s = run(s, [{ type: 'SET_NOISE_LAYER', layer: 'cicadas', muted: false }]);
    expect(s.settings.noiseMuted).not.toContain('cicadas');
    // 겨울이라 자동 모드였다면 매미는 도출되지 않는다 — 커스텀이니 남는다
    expect(
      deriveLayers({
        phase: 'room', actionId: null, ownedItems: [],
        weather: 'clear', season: 'winter', timeOfDay: 'day',
      }),
    ).not.toContain('cicadas');
  });

  it('자동으로 되돌려도 음소거 목록은 보존된다 (되돌아올 자리)', () => {
    const base = createInitialState(T0, 'lie');
    let s = run(base, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    const muted = s.settings.noiseMuted;
    s = run(s, [{ type: 'SET_NOISE_MODE', mode: 'auto', nowMs: T0 }]);
    expect(s.settings.noiseMode).toBe('auto');
    expect(s.settings.noiseMuted).toEqual(muted);
  });

  it('같은 모드 재지정은 no-op — 커스텀 설정이 초기화되지 않는다', () => {
    const base = createInitialState(T0, 'lie');
    let s = run(base, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    s = run(s, [{ type: 'SET_NOISE_LAYER', layer: 'cicadas', muted: false }]);
    const again = run(s, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    expect(again.settings.noiseMuted).toEqual(s.settings.noiseMuted);
  });
});
