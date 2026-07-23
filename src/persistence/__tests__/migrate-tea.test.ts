import { describe, expect, it } from 'vitest';
import { migrateState } from '../migrate';
import { createInitialState, SCHEMA_VERSION } from '../../game/stateMachine';
import type { GameState } from '../../game/types';

/**
 * v27 → v28: 따뜻한 차의 변형 키 coffee → herb.
 *
 * 코드가 변형 키로 문구 id를 조립하므로(`shop.tea.use.${variant}`), 옛 키가 남은
 * 세이브는 [MISSING TEXT]가 뜨고 보너스도 안 붙는다. 키가 남는 자리가 넷이라
 * 하나라도 빠뜨리면 조용히 깨진다 — 그래서 넷을 다 잡아 둔다.
 */
const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

/** 옛 키가 네 자리에 모두 남아 있는 v27 세이브 */
function v27WithCoffee(): GameState {
  const s = createInitialState(T0, 'lie');
  return {
    ...s,
    schemaVersion: 27,
    supplies: { tea: 1 },
    supplyVariants: { tea: 'coffee' },
    rest: { ...s.rest, offers: { tea: 'coffee' } },
    badges: { 'use-tea-coffee': { at: T0 } },
    memory: { 'use-tea-coffee': { w: 1, count: 1, lastAt: T0 } },
  } as unknown as GameState;
}

describe('v27 → v28: 차 변형 키 coffee → herb', () => {
  it('아직 안 쓴 재고의 변형이 옮겨진다 — 안 옮기면 쓸 때 문구가 깨진다', () => {
    const s = migrateState(v27WithCoffee())!;
    expect(s.supplyVariants.tea).toBe('herb');
  });

  it('이번 휴식의 진열 종류도 옮겨진다 — 상점 이름이 깨지지 않게', () => {
    const s = migrateState(v27WithCoffee())!;
    expect(s.rest.offers.tea).toBe('herb');
  });

  it('모은 뱃지가 유지된다 — 도감에서 사라지면 안 된다', () => {
    const s = migrateState(v27WithCoffee())!;
    expect(s.badges['use-tea-herb']).toBeDefined();
    expect(s.badges['use-tea-coffee']).toBeUndefined();
  });

  it('기억 토큰도 함께 옮겨진다', () => {
    const s = migrateState(v27WithCoffee())!;
    expect(s.memory['use-tea-herb']).toBeDefined();
    expect(s.memory['use-tea-coffee']).toBeUndefined();
  });

  it('최신 버전까지 올라간다', () => {
    expect(migrateState(v27WithCoffee())!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('옛 키가 없던 세이브는 건드리지 않는다', () => {
    const base = createInitialState(T0, 'lie');
    const clean = {
      ...base,
      schemaVersion: 27,
      supplyVariants: { tea: 'green' },
    } as unknown as GameState;
    const s = migrateState(clean)!;
    expect(s.supplyVariants.tea).toBe('green');
  });
});
