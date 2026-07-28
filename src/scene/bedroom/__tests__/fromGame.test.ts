import { describe, it, expect } from 'vitest';
import { bedroomSceneFrom, hiddenBedroomLayers } from '../fromGame';
import type { GameState } from '../../../game/types';

/**
 * 침실 fromGame — 거실과 같은 이유로 여기가 틀리면 원인을 씬 쪽에서 찾게 된다.
 * 특히 돌의 자리 규칙(작업=의자, 누워있기=침대, 없으면 러그)과
 * 책상 위 물건의 겹게이팅(책상 없이 랩탑·스탠드가 허공에 뜨는 것)을 잡는다.
 */
const base = {
  era: 'raising',
  presence: { state: 'present' },
  apart: { visiting: false },
  items: {},
  supplies: {},
  session: { wetness: null },
  weather: 'clear',
  settings: { timeOfDay: 'day', season: 'summer' },
  relationTier: 0,
  planted: false,
  plantedAt: null,
  treeBondDays: 0,
  memory: {},
} as unknown as GameState;

const withItems = (...ids: string[]) =>
  ({
    ...base,
    items: Object.fromEntries(ids.map((id) => [id, { placed: true }])),
  }) as GameState;

describe('돌의 자리 — 작업=의자, 누워있기=침대(없으면 러그)', () => {
  it('휴식(페이저로 구경)에는 러그', () => {
    expect(bedroomSceneFrom(base, 0).orb).toBe('rug');
  });

  it('personalWork 집중에는 의자(스툴은 품목이 아니라 늘 있다)', () => {
    const st = { ...base, phase: 'focus', selectedAction: 'personalWork' } as GameState;
    expect(bedroomSceneFrom(st, 0).orb).toBe('chair');
  });

  it('lie 집중: 침대를 샀으면 침대, 아니면 러그', () => {
    const lie = { phase: 'focus', selectedAction: 'lie' };
    expect(
      bedroomSceneFrom({ ...withItems('bed'), ...lie } as GameState, 0).orb,
    ).toBe('bed');
    expect(bedroomSceneFrom({ ...base, ...lie } as GameState, 0).orb).toBe('rug');
  });

  it('부재·심은 뒤에는 없다', () => {
    expect(
      bedroomSceneFrom(
        { ...base, presence: { state: 'away' } } as unknown as GameState,
        0,
      ).orb,
    ).toBe('none');
    expect(
      bedroomSceneFrom({ ...base, planted: true } as GameState, 0).orb,
    ).toBe('none');
  });
});

describe('안 산 물건은 방에 없다', () => {
  it('침대·책상·랩탑·스탠드·협탁(나이트드링크)·선풍기가 전부 꺼진다', () => {
    const off = hiddenBedroomLayers(base, false);
    for (const id of [
      'bd-bed',
      'bd-desk',
      'bd-laptop',
      'bd-lamp',
      'bd-nightstand',
      'bd-fan',
      'bd-deskplant',
    ]) {
      expect(off.has(id), id).toBe(true);
    }
    // 발광도 소품을 따라 꺼진다
    expect(off.has('lamp-glow')).toBe(true);
    expect(off.has('screen-glow')).toBe(true);
  });

  it('스툴은 품목이 아니라 늘 켜져 있다 — 돌의 작업 자리', () => {
    expect(hiddenBedroomLayers(base, false).has('bd-chair')).toBe(false);
  });

  it('책상 위 물건은 책상이 있어야 놓인다 — 랩탑만 사면 허공에 뜨므로 끈 채다', () => {
    expect(hiddenBedroomLayers(withItems('laptop'), false).has('bd-laptop')).toBe(true);
    expect(hiddenBedroomLayers(withItems('lamp'), false).has('bd-lamp')).toBe(true);
    const off = hiddenBedroomLayers(withItems('desk', 'laptop', 'lamp'), false);
    expect(off.has('bd-desk')).toBe(false);
    expect(off.has('bd-laptop')).toBe(false);
    expect(off.has('bd-lamp')).toBe(false);
    expect(off.has('bd-deskplant')).toBe(false); // 카페인 연출은 책상에 딸려 온다
  });

  it('나이트드링크 하나로 협탁+잔이 같이 온다 (한 레이어)', () => {
    expect(
      hiddenBedroomLayers(withItems('nightdrink'), false).has('bd-nightstand'),
    ).toBe(false);
  });
});

describe('하늘은 거실과 같은 표를 쓴다', () => {
  it('풀잎(grass)도 petals 로 합쳐진다', () => {
    expect(
      bedroomSceneFrom({ ...base, weather: 'grass' } as GameState, 0).weather,
    ).toBe('petals');
  });
});

describe('씬 조작(창·작업등)은 인자로 들어온다', () => {
  it('기본은 닫힌 창 + 켠 등', () => {
    const s = bedroomSceneFrom(base, 0);
    expect(s.window).toBe('closed');
    expect(s.lamp).toBe('on');
  });

  it('열림·끔이 그대로 실린다', () => {
    const s = bedroomSceneFrom(base, 0, true, false);
    expect(s.window).toBe('open');
    expect(s.lamp).toBe('off');
  });
});
