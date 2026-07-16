import { describe, expect, it } from 'vitest';
import { createInitialState, transition } from '../stateMachine';
import { gameData } from '../../store/gameStore';
import type { GameEvent, GameState } from '../types';
import type { Rng } from '../rng';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function run(s: GameState, events: GameEvent[], rng: Rng = seq([0.99])): GameState {
  return events.reduce((acc, e) => transition(acc, e, { rng, data: gameData }), s);
}

/** 상점 열린 휴식 상태 + 넉넉한 정성 */
function restRich(care = 20): GameState {
  const s = createInitialState(T0, 'lie');
  return {
    ...s,
    phase: 'rest',
    restStep: 'shop',
    care: { points: care, carryMinutes: 0 },
  };
}

describe('상점 2.0 — 체인·소모품·보너스', () => {
  it('체인: 이전 티어 없이 다음 티어 구매 불가, 보유하면 가능', () => {
    let s = restRich();
    s = run(s, [{ type: 'BUY', itemId: 'bed', nowMs: T0 }]);
    expect('bed' in s.items).toBe(false); // 베개 없음 → 거절
    s = run(s, [
      { type: 'BUY', itemId: 'pillow', nowMs: T0 },
      { type: 'SET_PLACEMENT', itemId: 'pillow', placed: false },
      { type: 'BUY', itemId: 'bed', nowMs: T0 },
    ]);
    expect('bed' in s.items).toBe(true);
  });

  it('소모품: 구매→재고 1, 재고 있으면 재구매 거절, 배치 흐름 없음', () => {
    let s = restRich();
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    expect(s.supplies['nightdrink']).toBe(1);
    expect('nightdrink' in s.items).toBe(false);
    expect(s.pendingPlacement).toBeNull();
    const points = s.care.points;
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    expect(s.care.points).toBe(points); // 거절 — 정성 그대로
  });

  it('소모: 세션 시작 시 재고 소모+종류 추첨 → 종료 시 종류 보너스·기억토큰 → 재구매 가능', () => {
    let s = restRich();
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    // rng 0.0 → variants[0] = milk (생리 +3)
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.0]));
    expect(s.supplies['nightdrink']).toBe(0);
    expect(s.session.supply).toEqual({ itemId: 'nightdrink', variant: 'milk' });
    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 }]);
    expect(s.stats.needs.physiological).toBe(5 + 3); // 누워있기 5 + 우유 3
    expect('use-nightdrink-milk' in s.memory).toBe(true);
    // 사용 대사가 일지에 남는다
    expect(
      s.session.journal.some((j) => j.text.includes('우유')),
    ).toBe(true);
    // 소모 후 재구매 가능
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    expect(s.supplies['nightdrink']).toBe(1);
  });

  it('체인 보너스: 베개 보유 시 누워있기 게이지 +1 누적', () => {
    let s = restRich();
    s = run(s, [
      { type: 'BUY', itemId: 'pillow', nowMs: T0 },
      { type: 'SET_PLACEMENT', itemId: 'pillow', placed: false },
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.stats.needs.physiological).toBe(5 + 1); // 행동 5 + 베개 1
  });

  it('소모품 없이 세션 진행: 보너스 없음, 행동은 정상', () => {
    let s = restRich();
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.session.supply).toBeNull();
    expect(s.stats.needs.physiological).toBe(5); // 행동 기본만
  });
});
