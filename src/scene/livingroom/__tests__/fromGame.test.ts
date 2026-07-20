import { describe, it, expect } from 'vitest';
import { hiddenLayers, sceneStateFrom } from '../fromGame';
import type { GameState } from '../../../game/types';
import type { DialoguesData } from '../../../data/schema';

/**
 * fromGame 은 게임과 씬의 **유일한 접점**이라, 여기가 틀리면 원인을 씬 쪽에서 찾게 된다.
 * 실제로 거실을 캔버스로 갈아 끼울 때 돌 상태(이끼·젖음·새싹)와 소품 게이팅이
 * 통째로 빠졌고, 화면을 눈으로 보고서야 알았다. 그 회귀들을 여기서 잡는다.
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

const D = {} as DialoguesData;
const withItems = (...ids: string[]) =>
  ({
    ...base,
    items: Object.fromEntries(ids.map((id) => [id, { placed: true }])),
  }) as GameState;

describe('창밖 나무 = 묘목이 된 돌', () => {
  it('심기 전에는 세 레이어가 전부 꺼진다', () => {
    const off = hiddenLayers(base, false, D);
    for (const id of ['tree-v1', 'tree-v2', 'tree-bare']) {
      expect(off.has(id)).toBe(true);
    }
  });

  it('심은 뒤에는 활엽(v2)만 켜진다 — 겨울 앙상한 가지도 함께 열린다', () => {
    const off = hiddenLayers(
      { ...base, planted: true, plantedAt: 0 } as GameState,
      false,
      D,
    );
    expect(off.has('tree-v2')).toBe(false);
    expect(off.has('tree-bare')).toBe(false);
    expect(off.has('tree-v1')).toBe(true); // 침엽은 안 쓴다
    expect(sceneStateFrom({ ...base, planted: true } as GameState, 0).tree).toBe('v2');
  });
});

describe('안 산 물건은 방에 없다', () => {
  it('벽난로·거실 스탠드·담요는 씬 배경에 구워져 있어도 꺼진다', () => {
    const off = hiddenLayers(base, false, D);
    for (const id of [
      'g-fireplace',
      'fire',
      'lamp',
      'lamp-glow',
      'p-blanket',
      'p-blanket-wrap',
    ]) {
      expect(off.has(id)).toBe(true);
    }
  });

  it('사면 켜진다', () => {
    const off = hiddenLayers(withItems('fireplace', 'floorlamp', 'blanket'), false, D);
    for (const id of ['g-fireplace', 'fire', 'lamp', 'p-blanket']) {
      expect(off.has(id)).toBe(false);
    }
  });

  it('침실 램프(lamp)를 사도 거실 스탠드는 안 켜진다 — 다른 물건이다', () => {
    expect(hiddenLayers(withItems('lamp'), false, D).has('lamp')).toBe(true);
  });
});

describe('책장', () => {
  it('처음엔 여섯 칸이 전부 비어 있다', () => {
    const off = hiddenLayers(base, false, D);
    for (let n = 1; n <= 6; n++) expect(off.has(`bk-${n}`)).toBe(true);
  });

  it('1번째 칸 — 배치형 책(책·헌책)을 살수록 왼쪽부터 는다', () => {
    const off = hiddenLayers(withItems('book', 'book2'), false, D);
    expect(off.has('bk-1')).toBe(false);
    expect(off.has('bk-2')).toBe(false);
    expect(off.has('bk-3')).toBe(true);
  });

  it('2번째 칸 — 일회용 책은 **누적 구매 수**만큼 꽂힌다', () => {
    // supplies 는 0/1 이라 못 센다. memory 의 buy-readbook count 가 누적이다.
    const twice = {
      ...base,
      memory: { 'buy-readbook': { w: 2, count: 2, lastAt: 0 } },
    } as unknown as GameState;
    const off = hiddenLayers(twice, false, D);
    expect(off.has('bk2-1')).toBe(false);
    expect(off.has('bk2-2')).toBe(false);
    expect(off.has('bk2-3')).toBe(true);
    expect(off.has('bk2-4')).toBe(true);
  });

  it('2번째 칸도 처음엔 비어 있다', () => {
    const off = hiddenLayers(base, false, D);
    for (let n = 1; n <= 4; n++) expect(off.has(`bk2-${n}`)).toBe(true);
  });
});

describe('돌', () => {
  it('부재 중이면 돌은 꺼지고 자리를 sill 로 둬 러그에 자국이 남는다', () => {
    const away = { ...base, presence: { state: 'away' } } as unknown as GameState;
    expect(hiddenLayers(away, false, D).has('orb-rug')).toBe(true);
    // 렌더러는 orb !== 'rug' 일 때만 눌린 자국(rug-mark)을 그린다
    expect(sceneStateFrom(away, 0).orb).toBe('sill');
  });

  it('이끼를 놓으면 이끼만 켜진다', () => {
    const off = hiddenLayers(withItems('moss'), false, D);
    expect(off.has('orb-moss')).toBe(false);
    expect(off.has('orb-wet')).toBe(true);
    expect(off.has('orb-snow')).toBe(true);
  });

  it('비를 맞으면 젖고, 눈을 맞으면 눈이 쌓인다', () => {
    const wet = { ...base, session: { wetness: 'wet' } } as unknown as GameState;
    expect(hiddenLayers(wet, false, D).has('orb-wet')).toBe(false);
    const snowy = { ...base, session: { wetness: 'snowy' } } as unknown as GameState;
    expect(hiddenLayers(snowy, false, D).has('orb-snow')).toBe(false);
  });

  it('부재 중이면 돌 상태도 같이 사라진다 — 돌이 없는데 이끼만 뜰 수는 없다', () => {
    const away = {
      ...withItems('moss'),
      presence: { state: 'away' },
    } as unknown as GameState;
    expect(hiddenLayers(away, false, D).has('orb-moss')).toBe(true);
  });
});

describe('시간·계절·날씨 번역', () => {
  it('게임 twilight 은 씬에서 sunset 이다', () => {
    const st = sceneStateFrom(
      { ...base, settings: { timeOfDay: 'twilight', season: 'autumn' } } as GameState,
      0,
    );
    expect(st.time).toBe('sunset');
    expect(st.season).toBe('autumn');
  });

  it('낙엽은 꽃잎과 한 종류로 합쳐져 있다 — 색은 계절이 정한다', () => {
    expect(
      sceneStateFrom({ ...base, weather: 'leaves' } as GameState, 0).weather,
    ).toBe('petals');
  });
});
