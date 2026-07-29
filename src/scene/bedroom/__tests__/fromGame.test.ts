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
  supplyVariants: {},
  stats: { affection: 0 },
  session: { wetness: null, supply: null },
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

  it('personalWork 집중: 책상을 샀으면 의자, 아니면 러그 — 없는 의자에 앉을 순 없다', () => {
    const work = { phase: 'focus', selectedAction: 'personalWork' };
    expect(
      bedroomSceneFrom({ ...withItems('desk'), ...work } as GameState, 0).orb,
    ).toBe('chair');
    expect(bedroomSceneFrom({ ...base, ...work } as GameState, 0).orb).toBe('rug');
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

  it('스툴은 책상에 딸려 온다 — 책상을 사면 같이 나오고, 없으면 같이 없다', () => {
    expect(hiddenBedroomLayers(base, false).has('bd-chair')).toBe(true);
    expect(hiddenBedroomLayers(withItems('desk'), false).has('bd-chair')).toBe(false);
  });

  it('베개는 침대와 별개 품목 — 베개만 사도 나온다(러그 위 자리)', () => {
    expect(hiddenBedroomLayers(base, false).has('bd-pillow')).toBe(true);
    const off = hiddenBedroomLayers(withItems('pillow'), false);
    expect(off.has('bd-pillow')).toBe(false);
    expect(off.has('bd-bed')).toBe(true); // 침대는 아직 없다 → 렌더러가 러그 자리로 그린다
  });

  it('책상 위 물건은 책상이 있어야 놓인다 — 랩탑만 사면 허공에 뜨므로 끈 채다', () => {
    expect(hiddenBedroomLayers(withItems('laptop'), false).has('bd-laptop')).toBe(true);
    expect(hiddenBedroomLayers(withItems('lamp'), false).has('bd-lamp')).toBe(true);
    const off = hiddenBedroomLayers(withItems('desk', 'laptop', 'lamp'), false);
    expect(off.has('bd-desk')).toBe(false);
    expect(off.has('bd-laptop')).toBe(false);
    expect(off.has('bd-lamp')).toBe(false);
  });

  it('나이트드링크 하나로 협탁+잔이 같이 온다 (한 레이어)', () => {
    expect(
      hiddenBedroomLayers(withItems('nightdrink'), false).has('bd-nightstand'),
    ).toBe(false);
  });
});

describe('책상 위 카페인 — 소모품 재고·종류를 따라간다', () => {
  const withDesk = (extra: Partial<GameState>) =>
    ({ ...withItems('desk'), ...extra }) as GameState;

  it('재고가 없으면 책상 위에 없다 — 잔만 놓여 있으면 사는 의미가 없다', () => {
    expect(hiddenBedroomLayers(withItems('desk'), false).has('bd-deskplant')).toBe(true);
  });

  it('재고가 있으면 놓인다', () => {
    const st = withDesk({ supplies: { caffeine: 1 } } as Partial<GameState>);
    expect(hiddenBedroomLayers(st, false).has('bd-deskplant')).toBe(false);
  });

  it('세션에 쓰는 중이면 재고가 0이어도 놓인다', () => {
    const st = withDesk({
      session: { wetness: null, supply: { itemId: 'caffeine', variant: 'energy' } },
    } as unknown as Partial<GameState>);
    expect(hiddenBedroomLayers(st, false).has('bd-deskplant')).toBe(false);
  });

  it('종류 3종이 각각 다른 그림으로 간다 (붉은황소/3샷/아아)', () => {
    const of = (variant: string) =>
      bedroomSceneFrom(
        withDesk({
          supplies: { caffeine: 1 },
          supplyVariants: { caffeine: variant },
        } as unknown as Partial<GameState>),
        0,
      ).drink;
    expect(of('energy')).toBe('redbull');
    expect(of('triple')).toBe('coffee');
    expect(of('iced')).toBe('iced');
  });

  it('쓰는 중인 종류가 재고 종류보다 우선한다', () => {
    const st = withDesk({
      supplyVariants: { caffeine: 'triple' },
      session: { wetness: null, supply: { itemId: 'caffeine', variant: 'energy' } },
    } as unknown as Partial<GameState>);
    expect(bedroomSceneFrom(st, 0).drink).toBe('redbull');
  });
});

describe('하늘은 거실과 같은 표를 쓴다', () => {
  it('풀잎(grass)도 petals 로 합쳐진다', () => {
    expect(
      bedroomSceneFrom({ ...base, weather: 'grass' } as GameState, 0).weather,
    ).toBe('petals');
  });
});

describe('벽의 액자 — 호감도 7등분', () => {
  const framesAt = (affection: number) =>
    bedroomSceneFrom({ ...base, stats: { affection } } as unknown as GameState, 0).frames;

  it('호감도 0이면 한 장도 없다 — 아직 쌓인 추억이 없다', () => {
    expect(framesAt(0)).toBe(0);
  });

  it('한 칸(100/7≈14.3%)마다 한 장씩 늘어난다', () => {
    expect(framesAt(14)).toBe(0);
    expect(framesAt(15)).toBe(1);
    expect(framesAt(50)).toBe(3);
    expect(framesAt(99)).toBe(6);
  });

  it('가득 차면 7장에서 멈춘다 (그림이 7장뿐)', () => {
    expect(framesAt(100)).toBe(7);
    expect(framesAt(200)).toBe(7);
  });
});

describe('씬 조작(창·스탠드·화면)은 인자로 들어온다', () => {
  it('기본은 닫힌 창 + 켠 스탠드 + 켠 화면', () => {
    const s = bedroomSceneFrom(base, 0);
    expect(s.window).toBe('closed');
    expect(s.lamp).toBe('on');
    expect(s.screen).toBe('on');
  });

  it('스탠드와 화면은 따로 꺼진다 — 하나를 꺼도 다른 하나는 남는다', () => {
    const lampOff = bedroomSceneFrom(base, 0, false, false, true);
    expect(lampOff.lamp).toBe('off');
    expect(lampOff.screen).toBe('on');
    const screenOff = bedroomSceneFrom(base, 0, false, true, false);
    expect(screenOff.lamp).toBe('on');
    expect(screenOff.screen).toBe('off');
  });

  it('열림이 그대로 실린다', () => {
    expect(bedroomSceneFrom(base, 0, true).window).toBe('open');
  });
});
