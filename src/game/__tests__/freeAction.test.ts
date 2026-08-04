import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { personalWorkProb, pickFreeAction, selfCareProb } from '../freeAction';
import { remember } from '../memory';
import { createInitialState, transition } from '../stateMachine';
import type { Rng } from '../rng';
import type { GameEvent, GameState, NeedId } from '../types';
import { gameData } from '../../store/gameStore';
import { mulberry32 } from '../rng';
import type { ReflectionDef } from '../../data/schema';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

/** 정해진 값 순서대로 돌려주는 스텁 RNG (소진 후 마지막 값 반복) */
function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(1)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}

const F = BALANCE.NEED_FILLED_THRESHOLD;

const DEFS: ReflectionDef[] = [
  { token: 'read', variants: [{ textId: 'read.base' }] },
  { token: 'selfCare-physiological', variants: [{ textId: 'sc.phys' }] },
  { token: 'selfCare-safety', variants: [{ textId: 'sc.safety' }] },
  { token: 'personalWork', variants: [{ textId: 'pw' }] },
  { token: 'default', variants: [{ textId: 'def' }] },
];

function stateWith(
  needs: Partial<Record<NeedId, number>>,
  withMemory = true,
): GameState {
  const s = createInitialState(T0, 'free');
  s.stats.needs = { physiological: 0, safety: 0, belonging: 0, esteem: 0, ...needs };
  if (withMemory) s.memory = remember({}, 'read', 3, 0);
  return s;
}

const ALL = { physiological: 100, safety: 100, belonging: 100, esteem: 100 };

describe('personalWorkProb — 욕구 평균 비례', () => {
  it('전부 0 → 기본 확률, 만점 → base + scale', () => {
    expect(personalWorkProb(stateWith({}).stats.needs)).toBeCloseTo(
      BALANCE.PERSONAL_WORK_BASE,
    );
    expect(personalWorkProb(stateWith(ALL).stats.needs)).toBeCloseTo(
      BALANCE.PERSONAL_WORK_BASE + BALANCE.PERSONAL_WORK_SCALE,
    );
  });
});

describe('selfCareProb — B4/B4-1 자가 충족 확률', () => {
  const N = (o: Partial<Record<NeedId, number>>) => ({
    physiological: 0, safety: 0, belonging: 0, esteem: 0, ...o,
  });

  it('최우선 욕구(생리)가 절반 미만이면 무조건 1.0', () => {
    expect(selfCareProb(N({ physiological: 49 }), 'physiological')).toBe(1);
    expect(selfCareProb(N({ physiological: 0 }), 'physiological')).toBe(1);
  });

  it('생리가 절반 이상이면 바닥 확률 (전단계 없음)', () => {
    expect(selfCareProb(N({ physiological: 50 }), 'physiological')).toBe(
      BALANCE.FREE_SELF_CARE_PROB,
    );
  });

  it('상위 욕구: 전단계 평균에 비례, 바닥값 아래로 안 내려감', () => {
    // 안전 대상, 전단계=[생리]=100 → 1.0
    expect(selfCareProb(N({ physiological: 100 }), 'safety')).toBe(1);
    // 소속 대상, 전단계=[생리100, 안전40] 평균 70 → 0.7
    expect(
      selfCareProb(N({ physiological: 100, safety: 40 }), 'belonging'),
    ).toBeCloseTo(0.7);
    // 전단계 평균 20 → 바닥 0.5
    expect(
      selfCareProb(N({ physiological: 20, safety: 20 }), 'belonging'),
    ).toBe(BALANCE.FREE_SELF_CARE_PROB);
  });
});

describe('pickFreeAction — 순차 자가 충족(80게이트 정합)과 심심풀이(idle)', () => {
  const G = BALANCE.NEED_RISE_GATE;

  it('아래에서부터 첫 80 미만 욕구만 스스로 채운다 (개정 v4-5 게이트 정합)', () => {
    const r = pickFreeAction(stateWith({}), DEFS, seq([0.0, 0.0]));
    expect(r).toMatchObject({ type: 'selfCare', need: 'physiological', textId: 'sc.phys' });

    // 충족(60) 이상이어도 게이트(80) 미만이면 여전히 생리가 돌봄 대상
    const rMid = pickFreeAction(stateWith({ physiological: F }), DEFS, seq([0.0, 0.0]));
    expect(rMid).toMatchObject({ type: 'selfCare', need: 'physiological' });

    const r2 = pickFreeAction(
      stateWith({ physiological: G }),
      DEFS,
      seq([0.0, 0.0]),
    );
    expect(r2).toMatchObject({ type: 'selfCare', need: 'safety', textId: 'sc.safety' });
  });

  it('해금 게이팅: 그 욕구를 채우는 해금 행동이 없으면 selfCare 없음 → 반추 폴백', () => {
    // 생리 80 → 타깃=안전. 안전을 채우는 해금 행동이 없다(빈 doers) → 반추
    const r = pickFreeAction(
      stateWith({ physiological: G }),
      DEFS,
      seq([0.0, 0.0]),
      () => [],
    );
    expect(r.type).toBe('reflection');
  });

  it('해금 게이팅: 해금 행동이 있으면 그 행동 기색(via)으로 자가 충족', () => {
    const defs = [
      ...DEFS,
      { token: 'selfCareVia-walk', variants: [{ textId: 'via.walk' }] },
    ];
    const r = pickFreeAction(
      stateWith({ physiological: G }),
      defs,
      seq([0.0, 0.0]),
      () => ['walk'],
    );
    expect(r).toMatchObject({
      type: 'selfCare',
      need: 'safety',
      via: 'walk',
      textId: 'via.walk',
    });
  });

  it('자가 충족 판정 실패 → 기억 반추', () => {
    // 생리 60(절반 이상) → 확률 바닥값 0.5. rng 0.61 ≥ 0.5 → 실패 → 반추 폴백.
    const r = pickFreeAction(
      stateWith({ physiological: F }),
      DEFS,
      seq([0.61, 0.0]),
    );
    expect(r.type).toBe('reflection');
    expect(r).toMatchObject({ textId: 'read.base' });
  });

  it('전부 80 이상이면 해금 행동 중 하나를 제 마음대로 한다 (idle — 서술·기억만)', () => {
    const defs = [
      ...DEFS,
      { token: 'selfCareVia-walk', variants: [{ textId: 'via.walk' }] },
    ];
    const r = pickFreeAction(
      stateWith(ALL),
      defs,
      seq([0.0, 0.0]),
      () => [],
      () => ['walk'],
    );
    expect(r).toMatchObject({ type: 'idle', via: 'walk', textId: 'via.walk' });
  });

  it('idle 후보가 없으면 반추로 폴백 — 개인작업 판정은 여기 없다 (END_FOCUS 소관)', () => {
    const r = pickFreeAction(stateWith(ALL), DEFS, seq([0.0, 0.0]));
    expect(r.type).toBe('reflection');
  });

  it('기억이 비어 있으면 기본값 (누워 있기)', () => {
    const r = pickFreeAction(stateWith(ALL, false), DEFS, seq([0.9]));
    expect(r).toMatchObject({ type: 'default', textId: 'def' });
  });
});

describe('자유행동 위임 — 돌에게 맡기기 (피드백2)', () => {
  const base = (): GameState => ({
    ...createInitialState(T0, 'free'),
    phase: 'actionSelect',
    selectedAction: 'free',
  });
  /** 모든 욕구를 게이트 위로 올린다 (결핍 없음 = 개인작업) */
  const filled = (s: GameState): GameState => ({
    ...s,
    stats: {
      ...s.stats,
      needs: { physiological: 90, safety: 90, belonging: 90, esteem: 90 },
    },
  });

  it('결핍이 있으면 그 욕구를 채우는 행동을 돌이 고른다', () => {
    // 초기 상태: 생리가 가장 먼저 비어 있다 → 눕기/요리 중 하나
    const s = run(base(), [{ type: 'FREE_DELEGATE' }], seq([0.0]));
    expect(s.delegate?.kind).toBe('action');
    const d = s.delegate;
    const chosen = d?.kind === 'action' ? d.action : null;
    const fills = gameData.actions
      .filter((a) => a.outcome?.needs?.physiological !== undefined)
      .map((a) => a.id);
    expect(fills).toContain(chosen);
  });

  it('미해금 행동뿐이면 구매 힌트만 — 세션이 시작되지 않는다', () => {
    // 생리만 채우고 안전을 비워 두면 후보는 볕(방석)·산책(신발)·집안일(빗자루) — 전부 잠김
    let s: GameState = {
      ...base(),
      stats: {
        ...base().stats,
        needs: { physiological: 90, safety: 10, belonging: 10, esteem: 10 },
      },
    };
    s = run(s, [{ type: 'FREE_DELEGATE' }], seq([0.0]));
    expect(s.delegate?.kind).toBe('locked');
    // locked 상태에서 시작하면 아무 일도 없다
    expect(run(s, [{ type: 'START_FOCUS', nowMs: T0 }])).toBe(s);
    // 확인을 누르면 위임만 해제
    expect(run(s, [{ type: 'DELEGATE_CANCEL' }]).delegate).toBeNull();
  });

  it('결핍이 없으면 개인작업을 원한다', () => {
    const s = run(filled(base()), [{ type: 'FREE_DELEGATE' }], seq([0.0]));
    expect(s.delegate?.kind).toBe('personal');
  });

  it('위임된 행동으로 실제 세션이 열린다 — 자유행동이 아니라 그 행동', () => {
    let s = run(base(), [{ type: 'FREE_DELEGATE' }], seq([0.0]));
    const d = s.delegate;
    const chosen = d?.kind === 'action' ? d.action : null;
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.9]));
    expect(s.phase).toBe('focus');
    expect(s.selectedAction).toBe(chosen);
    expect(s.delegate).toBeNull();
  });

  // 개인작업도 제 행동으로 열린다 — 예전엔 치환할 행동이 없어 'free' 로 남았고,
  // 그래서 작업 중인 돌에게 자유행동 문구("돌은 누워 있다")가 붙었다
  it('개인작업 위임은 작업행동 세션으로 시작한다', () => {
    let s = run(filled(base()), [{ type: 'FREE_DELEGATE' }], seq([0.0]));
    expect(s.delegate).toEqual({ kind: 'personal' });
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.9]));
    expect(s.phase).toBe('focus');
    expect(s.selectedAction).toBe('personalWork');
  });

  it('작업행동은 화자가 고를 수 없다 — 돌이 골라야 열린다', () => {
    const s = run(base(), [
      { type: 'SELECT_ACTION', actionId: 'personalWork' },
    ]);
    expect(s.selectedAction).not.toBe('personalWork');
  });

  it('다른 행동을 고르면 위임이 해제된다', () => {
    let s = run(base(), [{ type: 'FREE_DELEGATE' }], seq([0.0]));
    s = run(s, [{ type: 'SELECT_ACTION', actionId: 'lie' }]);
    expect(s.delegate).toBeNull();
  });
});
