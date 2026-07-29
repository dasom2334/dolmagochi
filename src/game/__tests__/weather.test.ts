import { describe, expect, it } from 'vitest';

import { seasonAt, timeOfDayAt } from '../timeOfDay';
import { deriveLayers } from '../../audio/layers';
import { createInitialState, transition, weathersOfSeason } from '../stateMachine';
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

  it('SET_WEATHER: 무료(M22)·계절 의존 (T0=1월 겨울: 눈 O, 꽃잎비 X)', () => {
    const base = createInitialState(T0, 'lie');
    // 계절 전용 날씨는 그 계절에만 — 꽃잎비는 봄 것이다
    expect(run(base, [{ type: 'SET_WEATHER', weather: 'petals', nowMs: T0 }]).weather).toBe('clear');
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

  it('맑음·흐림·안개·비·장대비는 네 계절 공통 (M22)', () => {
    const base = createInitialState(T0, 'lie');
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const s = run(base, [{ type: 'SET_SEASON', mode: season, nowMs: T0 }]);
      for (const w of ['clear', 'cloud', 'fog', 'rain', 'downpour'] as const) {
        expect(weathersOfSeason(season)).toContain(w);
        expect(run(s, [{ type: 'SET_WEATHER', weather: w, nowMs: T0 }]).weather).toBe(w);
      }
    }
  });

  it('계절 전용 날씨는 제 계절에서만 (꽃잎비=봄·풀잎비=여름·낙엽비=가을·눈=겨울)', () => {
    const only = {
      petals: 'spring', grass: 'summer', leaves: 'autumn', snow: 'winter',
    } as const;
    for (const [weather, home] of Object.entries(only)) {
      for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
        expect(weathersOfSeason(season).includes(weather as never)).toBe(season === home);
      }
    }
  });

  it('계절 (M12): 자동 판정·고정 설정·날씨 이어가기·계절 전용 날씨', () => {
    // 1월=겨울, 4월=봄, 7월=여름, 10월=가을
    expect(seasonAt(new Date(2026, 3, 10).getTime())).toBe('spring');
    expect(seasonAt(new Date(2026, 6, 10).getTime())).toBe('summer');
    expect(seasonAt(new Date(2026, 9, 10).getTime())).toBe('autumn');
    expect(seasonAt(T0)).toBe('winter');
    // 계절을 바꿔도 **날씨는 이어진다** — 계절만 보려던 사람의 날씨가 맑음으로
    // 지워지면 안 된다. 예전엔 새 계절에 없는 날씨를 재추첨해서 대개 맑음이 됐다.
    // 계절 전용 날씨(꽃잎·풀잎·낙엽·눈)는 넷이 한 자리라 그 계절의 짝으로 바뀐다.
    const base = createInitialState(T0, 'lie');
    let s: GameState = { ...base, weather: 'snow' };
    s = run(s, [{ type: 'SET_SEASON', mode: 'spring', nowMs: T0 }], seq([0.9]));
    expect(s.settings.season).toBe('spring');
    expect(s.weather).toBe('petals'); // 눈 → 봄이면 꽃잎비
    // 봄 고정 상태에서는 꽃잎비를 고를 수 있다
    const rich: GameState = { ...s, care: { points: 2, carryMinutes: 0 }, weather: 'clear' };
    expect(run(rich, [{ type: 'SET_WEATHER', weather: 'petals', nowMs: T0 }]).weather).toBe('petals');
    // 네 계절이 한 바퀴 — 흩날리는 것은 계속 흩날린다
    const seasonal: [string, GameState['weather']][] = [
      ['spring', 'petals'],
      ['summer', 'grass'],
      ['autumn', 'leaves'],
      ['winter', 'snow'],
    ];
    for (const [from, w] of seasonal) {
      for (const [to, expected] of seasonal) {
        const moved = run(
          { ...rich, weather: w, settings: { ...rich.settings, season: from } } as GameState,
          [{ type: 'SET_SEASON', mode: to as never, nowMs: T0 }],
          seq([0.1]),
        );
        expect(moved.weather, `${from}:${w} → ${to}`).toBe(expected);
      }
    }
    // 계절을 안 타는 날씨는 그대로 이어간다 — 비는 겨울 표에 없어도 남는다
    for (const w of ['clear', 'rain', 'downpour'] as const) {
      expect(
        run({ ...rich, weather: w }, [{ type: 'SET_SEASON', mode: 'winter', nowMs: T0 }], seq([0.1])).weather,
      ).toBe(w);
    }
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
    expect(s.settings.noiseCustom).toEqual(
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
    expect(s.settings.noiseCustom).toContain('cicadas');
    // 자동이었다면 겨울에 매미는 도출조차 되지 않는다 — 커스텀이니 남는다
    expect(
      deriveLayers({
        phase: 'room', actionId: null, ownedItems: [],
        weather: 'clear', season: 'winter', timeOfDay: 'day',
      }),
    ).not.toContain('cicadas');
  });

  /** 리뷰 지적: 두 모드가 noiseMuted 한 필드를 공유하면, 커스텀을 한 번 거쳤다
   *  돌아온 순간 자동의 음소거 설정이 통째로 덮여 자동이 영영 조용해졌다. */
  it('커스텀을 거쳐도 자동의 음소거 설정은 그대로다 (필드 분리)', () => {
    const base = createInitialState(T0, 'lie');
    // 자동에서 '벽난로'만 꺼 둔다
    let s = run(base, [{ type: 'SET_NOISE_LAYER', layer: 'fireplace', muted: true }]);
    expect(s.settings.noiseMuted).toEqual(['fireplace']);
    // 커스텀에 들렀다 온다
    s = run(s, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    s = run(s, [{ type: 'SET_NOISE_LAYER', layer: 'cicadas', muted: false }]);
    s = run(s, [{ type: 'SET_NOISE_MODE', mode: 'auto', nowMs: T0 }]);
    // 자동의 음소거는 손대지 않은 그대로여야 한다
    expect(s.settings.noiseMode).toBe('auto');
    expect(s.settings.noiseMuted).toEqual(['fireplace']);
    // 커스텀 설정도 살아 있어 다시 들어가면 이어진다
    expect(s.settings.noiseCustom).toContain('cicadas');
  });

  it('같은 모드 재지정은 no-op — 커스텀 설정이 초기화되지 않는다', () => {
    const base = createInitialState(T0, 'lie');
    let s = run(base, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    s = run(s, [{ type: 'SET_NOISE_LAYER', layer: 'cicadas', muted: false }]);
    const again = run(s, [{ type: 'SET_NOISE_MODE', mode: 'custom', nowMs: T0 }]);
    expect(again.settings.noiseCustom).toEqual(s.settings.noiseCustom);
  });
});

/** 리뷰 지적: SET_SEASON에 phase 게이트가 없어, 마른 날 시작한 산책이 도중에
 *  계절 변경 → 날씨 재추첨으로 눈·비가 되어 우산도 못 쓴 채 젖었다. */
describe('집중 중 바깥 조건 고정 (M22)', () => {
  it('집중 중에는 계절을 바꿀 수 없다 — 날씨 재추첨이 우산 판정을 뒤집는다', () => {
    const base = createInitialState(T0, 'lie');
    const focusing: GameState = {
      ...base,
      phase: 'focus',
      selectedAction: 'walk',
      weather: 'clear',
    };
    const after = run(focusing, [{ type: 'SET_SEASON', mode: 'summer', nowMs: T0 }]);
    expect(after.settings.season).toBe('auto'); // 그대로
    expect(after.weather).toBe('clear'); // 재추첨 안 함
  });

  it('마른 산책이 도중에 젖는 일이 없다 (계절 잠금 회귀)', () => {
    const base = createInitialState(T0, 'lie');
    let s: GameState = {
      ...base,
      weather: 'clear',
      selectedAction: 'walk',
      items: { shoes: { placed: false }, umbrella: { placed: false } },
    };
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(s.pendingUmbrella).toBe(false); // 마른 날이라 우산을 묻지 않았다
    // 집중 중 계절을 흔들어도 (rng를 눈 쪽으로 몰아도) 날씨는 안 바뀐다
    s = run(s, [{ type: 'SET_SEASON', mode: 'winter', nowMs: T0 }], seq([0.99]));
    expect(s.weather).toBe('clear');
    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 + 60_000 }]);
    expect(s.session.wetness).toBeNull(); // 우산 없이 젖지 않았다
  });

  it('휴식·행동선택에서는 계절 변경이 정상 동작한다', () => {
    const base = createInitialState(T0, 'lie');
    const s = run(base, [{ type: 'SET_SEASON', mode: 'summer', nowMs: T0 }]);
    expect(s.settings.season).toBe('summer');
  });
});
