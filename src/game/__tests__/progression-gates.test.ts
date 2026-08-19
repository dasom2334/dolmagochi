import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { createInitialState, transition } from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(1)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}

/** 빈자리(apart) 기본 판 — 방문 중, 떠나려는 기색이 뜬 휴식 화면 */
function apartResting(over: Partial<GameState> = {}): GameState {
  const base = createInitialState(T0, 'lie');
  return {
    ...base,
    era: 'apart',
    phase: 'rest',
    apart: {
      visiting: true,
      visitSessionsLeft: 0,
      leavePending: true,
      holdCount: 0,
      held: false,
    },
    rest: { ...base.rest, endsAt: T0, totalSec: 300 },
    ...over,
  };
}

describe('진행 게이트 — 되감기·영구 차단 방지', () => {
  it('응답 없이 세션을 시작해도 보내준 것으로 센다 — 2차 엔딩이 막히지 않게', () => {
    const s = apartResting();
    expect(s.letGoCount).toBe(0);

    // 떠나려는 기색에 아무 버튼도 누르지 않고 다음 집중을 시작한다
    const after = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);

    expect(after.apart.visiting).toBe(false);
    expect(after.apart.leavePending).toBe(false);
    // 심기(2차 엔딩) 게이트가 요구하는 값
    expect(after.letGoCount).toBe(1);
  });

  it('명시적 보내주기와 이중으로 세지 않는다', () => {
    // VISIT_HOLD(보내주기)가 leavePending을 지우므로 exitRest는 早期 반환한다
    const held = run(apartResting(), [{ type: 'VISIT_HOLD', hold: false }]);
    expect(held.letGoCount).toBe(1);
    expect(held.apart.leavePending).toBe(false);

    const after = run(held, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(after.letGoCount).toBe(1); // 여전히 1
  });

  it('게이트 상한이 이미 자란 성장을 깎지 않는다 — 동거를 거쳐 와도 되감기 없음', () => {
    // 동거는 캡 없이 자라지만 게이트는 방문으로만 열린다(동거엔 방문이 없다).
    // 그래서 빈자리로 넘어온 첫 정산에서 SPROUT_GATES[0]=50 으로 되감겼었다.
    const grown = 90;
    expect(BALANCE.SPROUT_GATES[0]).toBeLessThan(grown); // 되감김 조건 성립 확인

    const s: GameState = {
      ...createInitialState(T0, 'lie'),
      era: 'apart',
      phase: 'focus',
      sproutGrowth: grown,
      sproutGatesCleared: 0,
      selectedAction: 'lie',
      session: { ...createInitialState(T0, 'lie').session, elapsedSec: 1500 },
    };

    const after = run(s, [{ type: 'END_FOCUS', nowMs: T0 }]);

    expect(after.sproutGrowth).toBeGreaterThanOrEqual(grown);
  });

  it('그래도 게이트는 살아 있다 — 열기 전에는 더 자라지 않는다', () => {
    const grown = 90;
    let s: GameState = {
      ...createInitialState(T0, 'lie'),
      era: 'apart',
      phase: 'focus',
      sproutGrowth: grown,
      sproutGatesCleared: 0,
      selectedAction: 'lie',
      session: { ...createInitialState(T0, 'lie').session, elapsedSec: 1500 },
    };
    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 }]);
    // 게이트(50·85)를 아직 안 열었으므로 90에서 멈춘 채 유지된다
    expect(s.sproutGrowth).toBe(grown);
  });
});
