import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { acquiredBadges, badgeEarned, pickMoment, settleBadges } from '../badges';
import { createInitialState, transition } from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(1)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}
const def = (id: string) => gameData.badges.find((b) => b.id === id)!;

describe('badgeEarned / settleBadges — 도감 판정 (M11a)', () => {
  it('토큰·마일스톤·위기·티어·4분면 조건 판정', () => {
    const s = createInitialState(T0, 'lie');
    expect(badgeEarned(def('act-lie'), s)).toBe(false);
    const earned: GameState = {
      ...s,
      memory: { lie: { w: 3, count: 1, lastAt: T0 }, 'buy-fan': { w: 3, count: 1, lastAt: T0 } },
      milestonesFired: ['hours-50'],
      crisisArcsFired: ['retreat'],
      relationTier: 4,
      quadrantsSeen: ['chaotic'],
    };
    expect(badgeEarned(def('act-lie'), earned)).toBe(true);
    expect(badgeEarned(def('first-buy'), earned)).toBe(true); // tokenPrefix
    expect(badgeEarned(def('ms-hours-50'), earned)).toBe(true);
    expect(badgeEarned(def('crisis-retreat'), earned)).toBe(true);
    expect(badgeEarned(def('crisis-sick'), earned)).toBe(false);
    expect(badgeEarned(def('tier-4'), earned)).toBe(true);
    expect(badgeEarned(def('tier-7'), earned)).toBe(false);
    expect(badgeEarned(def('quad-chaotic'), earned)).toBe(true);
  });

  it('settleBadges: 최초 충족 시각 스탬프 — 1회성·멱등', () => {
    const s: GameState = {
      ...createInitialState(T0, 'lie'),
      memory: { lie: { w: 3, count: 1, lastAt: T0 } },
    };
    const settled = settleBadges(s, gameData.badges, T0 + 1000);
    expect(settled.badges['act-lie']).toEqual({ at: T0 + 1000 });
    // 재정산해도 시각은 그대로 (멱등)
    const again = settleBadges(settled, gameData.badges, T0 + 9999);
    expect(again.badges['act-lie']).toEqual({ at: T0 + 1000 });
  });

  it('acquiredBadges: 획득분만, 획득 순 — 미획득은 존재 자체 비노출', () => {
    const s: GameState = {
      ...createInitialState(T0, 'lie'),
      badges: { 'act-read': { at: T0 + 2 }, 'act-lie': { at: T0 + 1 } },
    };
    const list = acquiredBadges(gameData.badges, s);
    expect(list.map((b) => b.def.id)).toEqual(['act-lie', 'act-read']);
  });

  it('END_FOCUS 뒤에는 행동 토큰 뱃지가 자동 정산된다', () => {
    const s = run(createInitialState(T0, 'lie'), [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 + 60_000 },
    ]);
    expect('act-lie' in s.badges).toBe(true);
  });
});

describe('pickMoment — 추억 순간 추첨 (M11a)', () => {
  it('집중: 현재 행동 조건에 맞는 순간만, 기록된 추억은 제외', () => {
    const s: GameState = { ...createInitialState(T0, 'lie'), selectedAction: 'lie' };
    const mo = pickMoment(gameData.moments, s, seq([0.0]));
    expect(mo?.id).toBe('mo-lie-breath');
    // 이미 기록됐으면 후보에서 빠진다 — 해당 행동의 순간을 전부 기록하면 null
    const lieMoments = gameData.moments.filter((m) => m.when?.action === 'lie');
    const done: GameState = {
      ...s,
      remembrances: lieMoments.map((m) => ({
        id: m.id,
        summaryId: 'x',
        revealId: 'y',
        at: T0,
      })),
    };
    expect(pickMoment(gameData.moments, done, seq([0.0]))).toBeNull();
  });

  it('휴식 작은 행동: restAct 키가 맞는 순간만', () => {
    const s = createInitialState(T0, 'lie');
    // 작은 행동 4종 모두 자기 키의 순간만 후보로 잡힌다 (M11b 배치3에서 4종×2로 확장)
    for (const act of gameData.restActs) {
      const mo = pickMoment(gameData.moments, s, seq([0.0]), act.key);
      expect(mo, `${act.key} 순간 없음`).not.toBeNull();
      expect(mo!.restAct).toBe(act.key);
    }
    // 없는 키는 후보가 없다
    expect(pickMoment(gameData.moments, s, seq([0.0]), 'nope')).toBeNull();
  });

  it('세션 중 확률 발동 → remembrance 기록 + 일지, 세션당 1회', () => {
    let s: GameState = { ...createInitialState(T0, 'lie'), selectedAction: 'lie' };
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    // 반추 틱(10분)마다 굴린다 — rng 0.0이면 즉시 발동
    const ticks: GameEvent[] = [];
    for (let t = 0; t < BALANCE.REFLECT_INTERVAL_SEC * 3; t += 10)
      ticks.push({ type: 'TICK', dtSec: 10 });
    s = run(s, ticks, seq([0.0]));
    expect(s.remembrances.map((r) => r.id)).toEqual(['mo-lie-breath']);
    expect(s.session.momentFired).toBe(true);
    // 이후 틱에서 더 발동하지 않는다 (세션당 1회)
    expect(s.remembrances).toHaveLength(1);
  });

  it('선택 기록: 선택지 유래 추억은 라벨·결과가 저장된다', () => {
    // walk 선택지 c0.o0가 walk-pause 추억을 남긴다 (actions.json)
    const base = createInitialState(T0, 'lie');
    let s: GameState = {
      ...base,
      selectedAction: 'walk',
      items: { shoes: { placed: false } },
      unlockedActions: ['walk'],
    };
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    const ticks: GameEvent[] = [];
    for (let t = 0; t < BALANCE.CHOICE_FIRST_AT_SEC; t += 10)
      ticks.push({ type: 'TICK', dtSec: 10 });
    s = run(s, ticks, seq([0.99])); // 순간·잠수 미발동 유지
    expect(s.session.choiceState).not.toBeNull();
    s = run(s, [{ type: 'CHOICE_PICKED', optionIndex: 0, nowMs: T0 + 300_000 }], seq([0.99, 0.0]));
    const rem = s.remembrances.find((r) => r.id === 'walk-pause');
    expect(rem).toBeDefined();
    expect(rem!.pickedLabelId).toBe('act.walk.c0.o0.label');
    expect(rem!.resultId).toBe('act.walk.c0.o0.r0');
  });
});
