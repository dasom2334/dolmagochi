import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { attachRate } from '../security';
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
const init = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(T0, 'lie'),
  ...over,
});

describe('attachRate — 잠복 축적 → 개막 → 위기 감쇠 (M18)', () => {
  it('개막 전엔 PRE_RATE, 개막부터 티어 스케일 × 위기 감쇠', () => {
    expect(attachRate(1, 0)).toBe(BALANCE.ATTACH_PRE_RATE);
    expect(attachRate(2, 5)).toBe(BALANCE.ATTACH_PRE_RATE);
    expect(attachRate(BALANCE.ATTACH_ONSET_TIER, 0)).toBe(1);
    // 티어가 깊을수록 크게
    expect(attachRate(7, 0)).toBeGreaterThan(attachRate(3, 0));
    // 위기를 겪을수록 무디게, 하한 아래로는 안 내려간다
    expect(attachRate(3, 2)).toBeLessThan(attachRate(3, 0));
    expect(attachRate(3, 99)).toBeCloseTo(BALANCE.ATTACH_RATE_FLOOR);
  });
});

describe('잠복기 (1~2티어) — 쌓이되 터지지 않는다', () => {
  it('과접근을 반복해도 잠수가 발동하지 않는다', () => {
    const data = structuredClone(gameData);
    data.actions.find((a) => a.id === 'lie')!.intimacy = 5; // 시작 행동을 고친밀로
    let s = init();
    const rng = seq([0.0]); // 잠수 판정이 있다면 무조건 통과할 값
    for (let i = 0; i < 10; i++) {
      s = [
        { type: 'START_FOCUS', nowMs: T0 } as GameEvent,
        { type: 'END_FOCUS', nowMs: T0 } as GameEvent,
        { type: 'REST_END' } as GameEvent,
      ].reduce((st, e) => transition(st, e, { rng, data }), s);
      expect(s.presence.state).toBe('present');
    }
    // 대신 친밀위협이 조용히 쌓였다 (PRE_RATE 배율)
    expect(s.stats.intimacyThreat).toBeGreaterThan(
      BALANCE.INTIMACY_THREAT_START,
    );
  });

  it('유기불안이 상한을 넘어도 잠복기엔 병간호가 터지지 않는다', () => {
    const base = init();
    const s = run(
      {
        ...base,
        stats: { ...base.stats, abandonment: 95, intimacyThreat: 20, security: 25 },
      },
      [{ type: 'START_FOCUS', nowMs: T0 }, { type: 'END_FOCUS', nowMs: T0 }],
    );
    expect(s.presence.sick).toBe(false);
  });
});

describe('개막 스파이크 — 보장 아크가 급성을 보장한다', () => {
  it('3티어 잠수 아크: 친밀위협이 급성권으로 치솟고 회피를 목격한다', () => {
    let s = init({ relationTier: 3, pendingCrises: ['retreat'] });
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    // 발동 순간 스파이크 (이후 위기 루프가 세션마다 수렴시킨다)
    expect(s.stats.intimacyThreat).toBeGreaterThanOrEqual(BALANCE.RETREAT_SPIKE);
    expect(s.crisesWeathered).toBe(1);
    expect(s.quadrantsSeen).toContain('avoidant');
  });

  it('5티어 병간호 아크: 유기불안이 급성권으로 치솟고 집착을 목격한다', () => {
    let s = init({ relationTier: 5, pendingCrises: ['sick'] });
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.presence.sick).toBe(true);
    expect(s.stats.abandonment).toBeGreaterThanOrEqual(BALANCE.SICK_SPIKE);
    expect(s.crisesWeathered).toBe(1);
    expect(s.quadrantsSeen).toContain('clingy');
  });
});

describe('세션 포크 (M18) — 곁에서/한 발 떨어져', () => {
  it('개막 후: near는 친밀위협을, apart는 유기불안을 민다', () => {
    const base = init({ relationTier: 3 });
    const near = run(base, [{ type: 'START_FOCUS', nowMs: T0, approach: 'near' }]);
    expect(near.stats.intimacyThreat).toBeGreaterThan(
      base.stats.intimacyThreat - BALANCE.ATTACH_SOOTHE * 2,
    );
    const apart = run(base, [
      { type: 'START_FOCUS', nowMs: T0, approach: 'apart' },
    ]);
    expect(apart.stats.abandonment).toBeGreaterThan(base.stats.abandonment);
  });

  it('개막 전엔 포크 델타가 적용되지 않는다', () => {
    const base = init({ relationTier: 1 });
    const s = run(base, [{ type: 'START_FOCUS', nowMs: T0, approach: 'apart' }]);
    // 진정(행동 경로)만 걸린다 — 유기불안이 오르지 않는다
    expect(s.stats.abandonment).toBeLessThanOrEqual(base.stats.abandonment);
  });

  it('우산 대기를 거쳐도 포크 선택이 살아남는다', () => {
    const base = init({
      relationTier: 3,
      selectedAction: 'walk',
      weather: 'rain',
      items: { umbrella: { placed: false }, shoes: { placed: false } },
      unlockedActions: ['walk'],
    });
    let s = run(base, [
      { type: 'START_FOCUS', nowMs: T0, approach: 'apart' },
    ]);
    expect(s.pendingUmbrella).toBe(true);
    expect(s.pendingApproach).toBe('apart');
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0, umbrella: true }]);
    expect(s.phase).toBe('focus');
    expect(s.stats.abandonment).toBeGreaterThan(base.stats.abandonment);
    expect(s.pendingApproach).toBeNull();
  });
});

describe('확률적 잠수 판정 — 도달 가능성 (데드패스 방지)', () => {
  // M18에서 허용치 하한을 2로 올릴 때 최대 친밀도(3)가 따라 오르지 않아
  // gap 이 RETREAT_GAP(2)에 영원히 못 닿는 데드패스가 있었다.
  // 강행 선택지를 4로 올려 복원 — 이 정합이 다시 깨지면 여기서 울린다.
  const choiceMax = Math.max(
    ...gameData.actions.flatMap((a) =>
      (a.choices ?? []).flatMap((c) => c.options.map((o) => o.intimacy)),
    ),
  );
  const actionMax = Math.max(...gameData.actions.map((a) => a.intimacy));
  const allowedMin = 2; // allowedIntimacy 하한 (M18)

  it('강행 선택지는 판정 문턱에 닿는다', () => {
    expect(choiceMax - allowedMin).toBeGreaterThanOrEqual(BALANCE.RETREAT_GAP);
  });

  it('기본 행동 로테이션은 문턱 아래다 (M18 의도)', () => {
    expect(actionMax - allowedMin).toBeLessThan(BALANCE.RETREAT_GAP);
  });

  it('안정감 바닥 + 강행 선택지 → 잠수가 실제로 발동한다', async () => {
    const { intimacyOutcome, derivedSecurity } = await import('../security');
    const oc = intimacyOutcome(0, 100, choiceMax, () => 0, 1, false, true);
    expect(derivedSecurity(0, 100)).toBe(0);
    expect(oc.retreat).toBe(true);
  });
});
