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

/** 25분 집중(units=1) — 게이지는 END_FOCUS 시간 정산이므로 시간이 흘러야 한다 */
function ticks25(): GameEvent[] {
  const out: GameEvent[] = [];
  for (let t = 0; t < 1500; t += 10) out.push({ type: 'TICK', dtSec: 10 });
  return out;
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

  it('소모품: 배치를 묻지 않고 바로 내놓는다, 재고 있으면 재구매 거절', () => {
    let s = restRich();
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    expect(s.supplies['nightdrink']).toBe(1);
    // 재고 그림이 사자마자 방에 보이므로 배치를 되묻지 않는다 — 배치된 채로 들어온다
    expect(s.items['nightdrink']).toEqual({ placed: true });
    expect(s.pendingPlacement).toBeNull();
    const points = s.care.points;
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    expect(s.care.points).toBe(points); // 거절 — 재고가 아직 있다
  });

  it('소모: 세션 시작 시 재고 소모+종류 추첨 → 종료 시 종류 보너스·기억토큰 → 재구매 가능', () => {
    let s = restRich();
    s = run(s, [
      { type: 'BUY', itemId: 'nightdrink', nowMs: T0 },
      { type: 'SET_PLACEMENT', itemId: 'nightdrink', placed: true },
    ]);
    // rng 0.0 → variants[0] = milk (생리 +3)
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.0]));
    expect(s.supplies['nightdrink']).toBe(0);
    expect(s.session.supply).toEqual({ itemId: 'nightdrink', variant: 'milk' });
    s = run(s, [...ticks25(), { type: 'END_FOCUS', nowMs: T0 + 1_500_000 }]);
    // 25분(units=1): 누워있기 5×1 + 우유 3(소모품은 플랫) − 시간 감소 1.2×(25/60)
    expect(s.stats.needs.physiological).toBeCloseTo(5 + 3 - 0.5, 5);
    // 사용 대사가 일지에 남는다
    expect(
      s.session.journal.some((j) => j.text.includes('우유')),
    ).toBe(true);
    // 소모 후 재구매 가능 — 배치는 기억되고, 프롬프트는 다시 뜨지 않는다
    s = run(s, [{ type: 'BUY', itemId: 'nightdrink', nowMs: T0 }]);
    expect(s.supplies['nightdrink']).toBe(1);
    expect(s.pendingPlacement).toBeNull();
    expect(s.items['nightdrink']).toEqual({ placed: true }); // 저번 자리 그대로
  });

  it('진열 종류 고정: 휴식의 진열(offers)이 구매·소모 종류로 이어진다', () => {
    let s = restRich();
    s = { ...s, rest: { ...s.rest, offers: { nightdrink: 'cocoa' } } };
    s = run(s, [
      { type: 'BUY', itemId: 'nightdrink', nowMs: T0 },
      { type: 'SET_PLACEMENT', itemId: 'nightdrink', placed: false },
      { type: 'START_FOCUS', nowMs: T0 },
    ]);
    expect(s.supplyVariants['nightdrink']).toBe('cocoa'); // 진열 종류로 고정
    expect(s.session.supply).toEqual({ itemId: 'nightdrink', variant: 'cocoa' });
  });

  it('체인 보너스: 베개 보유 시 누워있기 게이지 +1 누적', () => {
    let s = restRich();
    s = run(s, [
      { type: 'BUY', itemId: 'pillow', nowMs: T0 },
      { type: 'SET_PLACEMENT', itemId: 'pillow', placed: false },
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks25(),
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    // 25분(units=1): 행동 5×1 + 베개 1×1 (체인도 시간 정산) − 감소 0.5
    expect(s.stats.needs.physiological).toBeCloseTo(5 + 1 - 0.5, 5);
  });

  it('부재(잠수) 세션: 소모품이 소모되지 않고 사용 대사도 남지 않는다', () => {
    let s = restRich();
    s = run(s, [
      { type: 'BUY', itemId: 'nightdrink', nowMs: T0 },
      { type: 'SET_PLACEMENT', itemId: 'nightdrink', placed: false },
    ]);
    s = {
      ...s,
      presence: { ...s.presence, state: 'absent' },
    };
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks25(),
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    expect(s.supplies['nightdrink']).toBe(1); // 재고 보존
    expect(s.session.supply).toBeNull();
    expect(s.session.journal.some((j) => j.text.includes('우유'))).toBe(false);
  });

  it('잠 깨는 것: 개인작업이 발동하지 않은 세션엔 재고로 되돌아가고 거짓 서술이 없다', () => {
    let s = restRich();
    // 욕구 미충족(생리 0) → 개인작업 판정 자체가 없다
    s = {
      ...s,
      selectedAction: 'free',
      supplies: { caffeine: 1 },
      supplyVariants: { caffeine: 'energy' },
    };
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks25(),
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    expect(s.session.freeWorked).toBe(false);
    expect(s.supplies['caffeine']).toBe(1); // 반환
    expect(s.stats.selfActualization).toBe(0); // bonusSelfAct 미적용
    // 사용 대사 3종이 공유하는 도입부 — 하나라도 남았다면 거짓 서술이다
    expect(s.session.journal.some((j) => j.text.includes('오늘 집은 건'))).toBe(false);
  });

  it('소모품 없이 세션 진행: 보너스 없음, 행동은 정상', () => {
    let s = restRich();
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks25(),
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    expect(s.session.supply).toBeNull();
    expect(s.stats.needs.physiological).toBeCloseTo(5 - 0.5, 5); // 행동 기본만(25분=만액)
  });
});
