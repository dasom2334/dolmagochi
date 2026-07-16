import { describe, expect, it } from 'vitest';
import { checkCondition, pickChoiceOutcome, applyOutcome, recordRemembrance } from '../outcomes';
import { createInitialState } from '../stateMachine';
import { BALANCE } from '../balance';
import type { ChoiceOutcomeData, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const fixed = (v: number): Rng => () => v;

function base(): GameState {
  return createInitialState(T0, 'read');
}

describe('checkCondition — 결과 분기·해금 조건', () => {
  it('조건 없음 → 통과', () => {
    expect(checkCondition(undefined, base())).toBe(true);
  });

  it('flags / notFlags', () => {
    const s = { ...base(), flags: ['promised-walk'] };
    expect(checkCondition({ flags: ['promised-walk'] }, s)).toBe(true);
    expect(checkCondition({ flags: ['promised-walk', 'x'] }, s)).toBe(false);
    expect(checkCondition({ notFlags: ['promised-walk'] }, s)).toBe(false);
    expect(checkCondition({ notFlags: ['x'] }, s)).toBe(true);
  });

  it('게이지·파생 단계 문턱', () => {
    const s = base();
    s.stats.needs.physiological = BALANCE.NEED_FILLED_THRESHOLD;
    expect(checkCondition({ minNeeds: { physiological: 50 } }, s)).toBe(true);
    expect(checkCondition({ minNeeds: { safety: 1 } }, s)).toBe(false);
    expect(checkCondition({ minLevel: 2 }, s)).toBe(true);
    expect(checkCondition({ minLevel: 3 }, s)).toBe(false);
    expect(checkCondition({ minSecurity: 30 }, s)).toBe(true); // 시작 안정감 30
    expect(checkCondition({ minSecurity: 31 }, s)).toBe(false);
  });

  it('보유/배치 물품과 누적 시간', () => {
    const s: GameState = {
      ...base(),
      items: { plant: { placed: false }, lamp: { placed: true } },
      totals: { focusSeconds: 10 * 3600, sessions: 20 },
    };
    expect(checkCondition({ ownedItems: ['plant'] }, s)).toBe(true);
    expect(checkCondition({ placedItems: ['plant'] }, s)).toBe(false);
    expect(checkCondition({ placedItems: ['lamp'] }, s)).toBe(true);
    expect(checkCondition({ minTotalHours: 10 }, s)).toBe(true);
    expect(checkCondition({ minTotalHours: 11 }, s)).toBe(false);
  });

  it('시대·재석', () => {
    const s = base();
    expect(checkCondition({ era: 'raising' }, s)).toBe(true);
    expect(checkCondition({ era: 'apart' }, s)).toBe(false);
    expect(checkCondition({ presence: 'present' }, s)).toBe(true);
  });
});

describe('pickChoiceOutcome — 조건 필터 → 가중 추첨', () => {
  const outcomes: ChoiceOutcomeData[] = [
    { when: { flags: ['special'] }, resultId: '조건부', weight: 100 },
    { resultId: '기본A', weight: 3 },
    { resultId: '기본B', weight: 1 },
  ];

  it('조건 불통과 후보는 제외된다', () => {
    const picked = pickChoiceOutcome(outcomes, base(), fixed(0.0));
    expect(picked.resultId).not.toBe('조건부');
  });

  it('플래그 보유 시 조건부 후보가 우세 가중치로 뽑힌다', () => {
    const s = { ...base(), flags: ['special'] };
    const picked = pickChoiceOutcome(outcomes, s, fixed(0.5));
    expect(picked.resultId).toBe('조건부');
  });

  it('가중치 비례 분포 (시드)', () => {
    const rng = mulberry32(9);
    let a = 0;
    for (let i = 0; i < 400; i++) {
      const p = pickChoiceOutcome(outcomes, base(), rng);
      if (p.resultId === '기본A') a++;
    }
    expect(a).toBeGreaterThan(240); // 기대 3:1 = 300
  });

  it('통과 후보가 없으면 전체 폴백', () => {
    const only: ChoiceOutcomeData[] = [
      { when: { flags: ['x'] }, resultId: '유일' },
    ];
    expect(pickChoiceOutcome(only, base(), fixed(0.0)).resultId).toBe('유일');
  });

  it('현재 행동(action) 조건', () => {
    const s = base(); // selectedAction 'read'
    expect(checkCondition({ action: 'read' }, s)).toBe(true);
    expect(checkCondition({ action: 'walk' }, s)).toBe(false);
  });
});

describe('applyOutcome / recordRemembrance', () => {
  it('플래그·잠금해제·기억 항목이 상태에 남는다 (중복 없이)', () => {
    let s = applyOutcome(
      base(),
      {
        flags: ['f1'],
        unlockActions: ['cook'],
        unlockItems: ['lamp'],
        memory: [{ k: 'choice', w: 2 }],
        needs: { esteem: 10 },
      },
      T0,
    );
    s = applyOutcome(s, { flags: ['f1', 'f2'] }, T0);
    expect(s.flags).toEqual(['f1', 'f2']);
    expect(s.unlockedActions).toEqual(['cook']);
    expect(s.unlockedItems).toEqual(['lamp']);
    expect(s.memory['choice']).toMatchObject({ w: 2, count: 1 });
    expect(s.stats.needs.esteem).toBe(10);
  });

  it('추억 기록은 같은 id 1회만', () => {
    const r = { id: 'r1', summaryId: 's', revealId: 'v' };
    let s = recordRemembrance(base(), r, T0);
    s = recordRemembrance(s, r, T0 + 1);
    expect(s.remembrances).toHaveLength(1);
    expect(s.remembrances[0]).toMatchObject({ id: 'r1', at: T0 });
  });
});
