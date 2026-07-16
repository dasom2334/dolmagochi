import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { personalWorkProb, pickFreeAction, selfCareProb } from '../freeAction';
import { remember } from '../memory';
import { createInitialState } from '../stateMachine';
import type { Rng } from '../rng';
import type { GameState, NeedId } from '../types';
import type { ReflectionDef } from '../../data/schema';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

/** 정해진 값 순서대로 돌려주는 스텁 RNG (소진 후 마지막 값 반복) */
function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
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

describe('pickFreeAction — 순차 자가 충족과 개인작업 게이트', () => {
  it('미충족이 있으면 개인작업은 절대 나오지 않는다', () => {
    const r = pickFreeAction(stateWith({}), DEFS, seq([0.0, 0.0]));
    expect(r.type).not.toBe('personalWork');
  });

  it('아래에서부터 첫 미충족 욕구만 스스로 채운다', () => {
    const r = pickFreeAction(stateWith({}), DEFS, seq([0.0, 0.0]));
    expect(r).toMatchObject({ type: 'selfCare', need: 'physiological', textId: 'sc.phys' });

    const r2 = pickFreeAction(
      stateWith({ physiological: F }),
      DEFS,
      seq([0.0, 0.0]),
    );
    expect(r2).toMatchObject({ type: 'selfCare', need: 'safety', textId: 'sc.safety' });
  });

  it('자가 충족 판정 실패 → 기억 반추', () => {
    // 생리 충족 → 첫 미충족=안전, 전단계 평균=60 → selfCare 확률 0.6.
    // rng 0.61 ≥ 0.6 이면 자가 충족 실패 → 기억 반추로 폴백.
    const r = pickFreeAction(
      stateWith({ physiological: F }),
      DEFS,
      seq([0.61, 0.0]),
    );
    expect(r.type).toBe('reflection');
    expect(r).toMatchObject({ textId: 'read.base' });
  });

  it('욕구 4종 전부 충족 시에만 개인작업', () => {
    const r = pickFreeAction(stateWith(ALL), DEFS, seq([0.0, 0.0]));
    expect(r).toMatchObject({ type: 'personalWork', textId: 'pw' });
  });

  it('개인작업 확률 가산(상점 부스트)이 반영된다', () => {
    const base = personalWorkProb(stateWith(ALL).stats.needs); // 0.05 + 0.25
    // 가산 없으면 실패할 롤(base+0.05)이 +0.1 부스트로 성공한다
    const hit = pickFreeAction(stateWith(ALL), DEFS, seq([base + 0.05]), true, 0.1);
    expect(hit.type).toBe('personalWork');
    const miss = pickFreeAction(stateWith(ALL), DEFS, seq([base + 0.05]), true, 0);
    expect(miss.type).not.toBe('personalWork');
  });

  it('동거 게이트: allowPersonalWork=false면 전부 충족이어도 개인작업 없음', () => {
    const r = pickFreeAction(stateWith(ALL), DEFS, seq([0.0, 0.0]), false);
    expect(r.type).toBe('reflection');
  });

  it('기억이 비어 있으면 기본값 (누워 있기)', () => {
    const r = pickFreeAction(stateWith(ALL, false), DEFS, seq([0.9]), false);
    expect(r).toMatchObject({ type: 'default', textId: 'def' });
  });
});
