import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
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
/** 50분 세션 1회 (틱 생략 — 정산은 END_FOCUS nowMs 차이로) */
function session(s: GameState, startAt: number, mins = 50, rng?: Rng): GameState {
  const ticks: GameEvent[] = [];
  for (let t = 0; t < mins * 60; t += 60) ticks.push({ type: 'TICK', dtSec: 60 });
  return run(
    s,
    [{ type: 'START_FOCUS', nowMs: startAt }, ...ticks, { type: 'END_FOCUS', nowMs: startAt + mins * 60_000 }],
    rng ?? seq([0.9]), // 방문·순간 미발동 경로 고정
  );
}
function apartBase(): GameState {
  const s = createInitialState(T0, 'lie');
  return {
    ...s,
    era: 'apart',
    phase: 'actionSelect',
  };
}

describe('2차 독립기 (M14) — 묘목 성장·붙잡기 스펙트럼', () => {
  it('apart 비방문 세션: 성장 += 2.0×units, 시듦 회복', () => {
    let s: GameState = { ...apartBase(), witherLevel: 1 };
    s = session(s, T0); // 50분 = 2u
    expect(s.sproutGrowth).toBeCloseTo(BALANCE.SPROUT_GROWTH_PER_UNIT * 2, 5);
    expect(s.witherLevel).toBeCloseTo(1 - BALANCE.SPROUT_RECOVER, 5);
  });

  it('자발 방문 중에는 성장 정지·시듦 없음, 강제 체류(붙잡기)는 의존도↑·시듦', () => {
    // 자발 방문
    let s: GameState = {
      ...apartBase(),
      apart: { visiting: true, visitSessionsLeft: 3, leavePending: false, holdCount: 0, held: false },
    };
    s = session(s, T0);
    expect(s.sproutGrowth).toBe(0);
    expect(s.witherLevel).toBe(0);
    // 강제 체류
    let h: GameState = {
      ...apartBase(),
      apart: { visiting: true, visitSessionsLeft: 2, leavePending: false, holdCount: 1, held: true },
    };
    const dep0 = h.stats.dependence;
    h = session(h, T0);
    expect(h.witherLevel).toBeCloseTo(BALANCE.SPROUT_WITHER_HELD, 5);
    expect(h.stats.dependence).toBe(dep0 + BALANCE.DEPENDENCE_PER_HELD_SESSION);
  });

  it('보내주기 → letGoCount, 붙잡기 → held', () => {
    const pending: GameState = {
      ...apartBase(),
      phase: 'rest',
      apart: { visiting: true, visitSessionsLeft: 0, leavePending: true, holdCount: 0, held: false },
    };
    const letGo = run(pending, [{ type: 'VISIT_HOLD', hold: false }]);
    expect(letGo.letGoCount).toBe(1);
    const held = run(pending, [{ type: 'VISIT_HOLD', hold: true }]);
    expect(held.apart.held).toBe(true);
  });

  it('개화 목격 → 일지, 완주 + 게이트(보내주기 1회) → 심기 이벤트·planted', () => {
    // 개화 직전
    let s: GameState = { ...apartBase(), sproutGrowth: BALANCE.SPROUT_BLOOM_AT - 1 };
    s = session(s, T0);
    expect(s.bloomSeen).toBe(true);
    // 완주 + 게이트: 보내주기 이력 있음
    let g: GameState = {
      ...apartBase(),
      sproutGrowth: 99,
      bloomSeen: true,
      letGoCount: 1,
    };
    g = session(g, T0);
    expect(g.planted).toBe(true);
    expect(g.rest.talkState?.kind).toBe('planting');
    // 게이트 미충족(보내주기 0·균형 목격 0)이면 심지 않는다
    let ng: GameState = { ...apartBase(), sproutGrowth: 99, bloomSeen: true };
    ng = session(ng, T0);
    expect(ng.planted).toBe(false);
  });

  it('동거: 균형 애착이면 절반 속도 성장(잠식 역전), 불안정이면 시듦', () => {
    const base = createInitialState(T0, 'lie');
    let bal: GameState = {
      ...base,
      era: 'cohabit',
      phase: 'actionSelect',
      stats: { ...base.stats, abandonment: 20, intimacyThreat: 25, security: 95 },
    };
    bal = session(bal, T0);
    expect(bal.sproutGrowth).toBeCloseTo(
      BALANCE.SPROUT_GROWTH_PER_UNIT * BALANCE.SPROUT_GROWTH_COHABIT_FACTOR * 2,
      5,
    );
    expect(bal.balancedSeen).toBe(true);
    let un: GameState = {
      ...base,
      era: 'cohabit',
      phase: 'actionSelect',
      stats: { ...base.stats, abandonment: 0, intimacyThreat: 70, security: 30 },
    };
    un = session(un, T0);
    expect(un.sproutGrowth).toBe(0);
    expect(un.witherLevel).toBeCloseTo(BALANCE.SPROUT_WITHER_COHABIT, 5);
  });

  it('제2의 이별: 친밀위협 급성 연속 임계 → 돌이 스스로 떠난다 (붙잡기 없음)', () => {
    const base = createInitialState(T0, 'lie');
    let s: GameState = {
      ...base,
      era: 'cohabit',
      phase: 'actionSelect',
      highThreatStreak: BALANCE.FAREWELL2_STREAK - 1,
      stats: { ...base.stats, abandonment: 0, intimacyThreat: 95, security: 5 },
    };
    s = session(s, T0);
    expect(s.era).toBe('apart');
    expect(s.rest.talkState?.kind).toBe('farewell2');
  });
});

describe('2차 도감 뱃지 (M14)', () => {
  it('보내주기·개화·심기·제2의 이별이 뱃지로 정산된다', () => {
    let s: GameState = {
      ...apartBase(),
      letGoCount: 1,
      bloomSeen: true,
      sproutGrowth: 99,
    };
    s = session(s, T0); // 완주 + 게이트 → 심기까지
    expect('let-go' in s.badges).toBe(true);
    expect('bloom' in s.badges).toBe(true);
    expect('planted' in s.badges).toBe(true);
    // 제2의 이별
    const base = createInitialState(T0, 'lie');
    let f: GameState = {
      ...base,
      era: 'cohabit',
      phase: 'actionSelect',
      highThreatStreak: BALANCE.FAREWELL2_STREAK - 1,
      stats: { ...base.stats, abandonment: 0, intimacyThreat: 95, security: 5 },
    };
    f = session(f, T0);
    expect(f.crisisArcsFired).toContain('farewell2');
    expect('second-farewell' in f.badges).toBe(true);
  });
});

describe('apart 제2의 이별 (M14b) — 붙잡기 사다리 한계·방문 차단·게이트', () => {
  const ladderMax = gameData.text['dlg.visitLeave.holdResult'].length;

  function pendingVisit(holdCount: number): GameState {
    return {
      ...apartBase(),
      phase: 'rest',
      rest: { ...apartBase().rest, endsAt: T0 },
      apart: { visiting: true, visitSessionsLeft: 0, leavePending: true, holdCount, held: true },
    };
  }

  it('사다리 안에서는 단계별 대사로 붙잡기, 소진 후엔 돌이 스스로 떠난다', () => {
    // 아직 사다리 안 — 정상 붙잡기
    const held = run(pendingVisit(ladderMax - 1), [{ type: 'VISIT_HOLD', hold: true }]);
    expect(held.apart.visiting).toBe(true);
    expect(held.apart.holdCount).toBe(ladderMax);
    // 소진 후 — 만류가 닿지 않는다
    const gone = run(pendingVisit(ladderMax), [{ type: 'VISIT_HOLD', hold: true }]);
    expect(gone.apart.visiting).toBe(false);
    expect(gone.visitBlockedUntil).toBe(T0 + BALANCE.VISIT_BLOCK_DAYS * 86_400_000);
    expect(gone.crisisArcsFired).toContain('farewell2');
    expect(gone.rest.talkState?.kind).toBe('farewell2');
    // 다음 시각 이벤트(SETTLE)에서 '두 번째 이별' 뱃지가 정산된다
    expect('second-farewell' in run(gone, [{ type: 'SETTLE', nowMs: T0 }]).badges).toBe(true);
  });

  it('차단 기간에는 방문이 오지 않고, 지나면 다시 온다', () => {
    const blocked: GameState = {
      ...apartBase(),
      visitBlockedUntil: T0 + 3 * 86_400_000,
    };
    // rng 0.0 → 방문 확정 조건이지만 차단 중이라 안 온다
    let s = run(blocked, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.0, 0.9]));
    expect(s.apart.visiting).toBe(false);
    // 차단 만료 후엔 온다
    let after: GameState = { ...blocked, phase: 'actionSelect' };
    after = run(after, [{ type: 'START_FOCUS', nowMs: T0 + 4 * 86_400_000 }], seq([0.0, 0.9]));
    expect(after.apart.visiting).toBe(true);
  });

  it('심기 게이트: 보내주기 없이는 균형 목격만으로 열리지 않는다 (M14b)', () => {
    let s: GameState = {
      ...apartBase(),
      sproutGrowth: 99,
      bloomSeen: true,
      balancedSeen: true, // 균형 목격만으로는 부족
    };
    s = session(s, T0);
    expect(s.planted).toBe(false);
  });

  it('시듦 회복이 1 경계를 내려오면 힌트 관찰 문장이 남는다', () => {
    let s: GameState = { ...apartBase(), witherLevel: 1.1 };
    s = session(s, T0);
    expect(s.witherLevel).toBeLessThan(1);
    expect(
      s.session.journal.some((j) =>
        j.text.includes('묘목이 조금 기운을 차렸다'),
      ),
    ).toBe(true);
  });
});
