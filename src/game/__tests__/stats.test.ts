import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import {
  applyStatOutcome,
  dateKey,
  daysBetween,
  decayNeeds,
  firstUnfilledNeed,
  initialStats,
  needsLevelOf,
  settleCalendar,
} from '../stats';
import type { NeedId, Stats } from '../types';

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime(); // 로컬 2026-01-10 정오
const F = BALANCE.NEED_FILLED_THRESHOLD;

function withNeeds(partial: Partial<Record<NeedId, number>>): Stats {
  return {
    ...initialStats(),
    needs: {
      physiological: 0,
      safety: 0,
      belonging: 0,
      esteem: 0,
      ...partial,
    },
  };
}

describe('needsLevelOf — 파생 욕구 단계', () => {
  it('아래 욕구부터 문턱 이상 채워진 데까지', () => {
    expect(needsLevelOf(withNeeds({}).needs)).toBe(1);
    expect(needsLevelOf(withNeeds({ physiological: F }).needs)).toBe(2);
    expect(needsLevelOf(withNeeds({ physiological: F, safety: F }).needs)).toBe(3);
    expect(
      needsLevelOf(
        withNeeds({ physiological: F, safety: F, belonging: F, esteem: F })
          .needs,
      ),
    ).toBe(5);
  });

  it('중간이 비어 있으면 위가 채워져도 단계는 오르지 않는다', () => {
    expect(
      needsLevelOf(withNeeds({ physiological: F, belonging: 100 }).needs),
    ).toBe(2);
  });

  it('firstUnfilledNeed — 아래에서부터 첫 미충족', () => {
    expect(firstUnfilledNeed(withNeeds({}).needs)).toBe('physiological');
    expect(firstUnfilledNeed(withNeeds({ physiological: F }).needs)).toBe(
      'safety',
    );
    expect(
      firstUnfilledNeed(
        withNeeds({ physiological: F, safety: F, belonging: F, esteem: F })
          .needs,
      ),
    ).toBeNull();
  });
});

describe('settleCalendar — 달력일 정산', () => {
  it('1일 경과 → 기분 감쇠 1회', () => {
    const r = settleCalendar(initialStats(), dateKey(T0), T0, T0 + DAY);
    expect(r.stats.mood).toBe(BALANCE.MOOD_START - BALANCE.MOOD_DECAY_PER_DAY);
    expect(r.lastDecayDate).toBe(dateKey(T0 + DAY));
  });

  it('다일 경과 → 일수만큼 감쇠, 하한 0', () => {
    const r = settleCalendar(initialStats(), dateKey(T0), T0, T0 + 30 * DAY);
    expect(r.stats.mood).toBe(0);
  });

  it('같은 날 재정산은 아무 것도 하지 않는다 (멱등)', () => {
    const first = settleCalendar(initialStats(), dateKey(T0), T0, T0 + DAY);
    const again = settleCalendar(
      first.stats,
      first.lastDecayDate,
      T0,
      T0 + DAY + 3_600_000,
    );
    expect(again.stats).toEqual(first.stats);
    expect(again.regressed).toBe(false);
  });

  it('방치 3일 → 최상위 충족 욕구 게이지 하락으로 단계 퇴행', () => {
    const stats = withNeeds({ physiological: F, safety: F }); // 3단계
    const r = settleCalendar(stats, dateKey(T0), T0, T0 + 3 * DAY);
    expect(r.stats.needs.safety).toBe(F - BALANCE.NEED_REGRESS_AMOUNT);
    expect(needsLevelOf(r.stats.needs)).toBe(2);
    expect(r.regressed).toBe(true);
  });

  it('나눠서 정산해도 이중 퇴행 없음 (3일차 정산 후 4일차)', () => {
    const stats = withNeeds({ physiological: F, safety: F });
    const day3 = settleCalendar(stats, dateKey(T0), T0, T0 + 3 * DAY);
    expect(needsLevelOf(day3.stats.needs)).toBe(2);
    const day4 = settleCalendar(day3.stats, day3.lastDecayDate, T0, T0 + 4 * DAY);
    expect(day4.stats.needs).toEqual(day3.stats.needs); // 6일차 전 — 추가 퇴행 없음
    const day6 = settleCalendar(day4.stats, day4.lastDecayDate, T0, T0 + 6 * DAY);
    expect(needsLevelOf(day6.stats.needs)).toBe(1);
  });

  it('퇴행 하한은 1단계 — 돌은 죽지 않는다', () => {
    const stats = withNeeds({ physiological: F });
    const r = settleCalendar(stats, dateKey(T0), T0, T0 + 90 * DAY);
    expect(needsLevelOf(r.stats.needs)).toBe(1);
    expect(r.stats.needs.physiological).toBeGreaterThanOrEqual(0);
  });

  it('세션 기록이 없으면 퇴행하지 않는다', () => {
    const stats = withNeeds({ physiological: F, safety: F });
    const r = settleCalendar(stats, dateKey(T0), null, T0 + 30 * DAY);
    expect(needsLevelOf(r.stats.needs)).toBe(3);
  });
});

describe('applyStatOutcome', () => {
  it('기분/호감도/욕구/자아실현 반영과 클램프 (하위 욕구 80 이상이어야 상위가 찬다)', () => {
    // 안정 상태(안정감 100)에서 호감도가 온전히 오르도록.
    // 소속·존중이 오르려면 아래 욕구들이 상승 게이트(80)를 넘어 있어야 한다 (개정 v4-5).
    const base = {
      ...initialStats(),
      abandonment: 40,
      intimacyThreat: 40,
      security: 100,
      needs: {
        physiological: BALANCE.NEED_RISE_GATE,
        safety: BALANCE.NEED_RISE_GATE,
        belonging: 0,
        esteem: 0,
      },
    };
    const r = applyStatOutcome(base, {
      stats: { mood: 100, affection: 2 },
      needs: { belonging: 30, esteem: 500 },
      selfActualization: 15,
    });
    expect(r.mood).toBe(100);
    expect(r.affection).toBe(2); // 안정감 100 → 비례 래칫 온전 상승
    expect(r.needs.belonging).toBe(30);
    // 존중은 소속(30 < 80)이 게이트 미달이라 오르지 않는다
    expect(r.needs.esteem).toBe(0);
    expect(r.needs.physiological).toBe(BALANCE.NEED_RISE_GATE); // 명시된 게이지만 찬다
    expect(r.selfActualization).toBe(15);
  });

  it('욕구 상승 게이트 (개정 v4-5): 같은 Outcome 안에서도 아래부터 캐스케이드된다', () => {
    const base = {
      ...initialStats(),
      needs: { physiological: 78, safety: 50, belonging: 0, esteem: 0 },
    };
    // 생리 +5 → 83(게이트 통과) → 같은 적용에서 안전 +5도 통과
    const r = applyStatOutcome(base, { needs: { physiological: 5, safety: 5 } });
    expect(r.needs.physiological).toBe(83);
    expect(r.needs.safety).toBe(55);
    // gateNeeds=false(위기 면제)면 게이트 무시
    const r2 = applyStatOutcome(base, { needs: { esteem: 5 } }, false);
    expect(r2.needs.esteem).toBe(5);
    // 음수 델타(퇴행)는 게이트와 무관하게 적용
    const r3 = applyStatOutcome(base, { needs: { safety: -10 } });
    expect(r3.needs.safety).toBe(40);
  });

  it('decayNeeds — 욕구별 차등 시간 감소, 0 밑으로 안 내려간다', () => {
    const needs = { physiological: 10, safety: 10, belonging: 0.1, esteem: 10 };
    const r = decayNeeds(needs, 2); // 2시간
    expect(r.physiological).toBeCloseTo(10 - BALANCE.NEED_DECAY_PER_HOUR.physiological * 2);
    expect(r.safety).toBeCloseTo(10 - BALANCE.NEED_DECAY_PER_HOUR.safety * 2);
    expect(r.belonging).toBe(0);
    expect(r.esteem).toBeCloseTo(10 - BALANCE.NEED_DECAY_PER_HOUR.esteem * 2);
  });

  it('B13 호감도 비례 래칫: 안정감이 낮으면 상승분이 준다', () => {
    const r = applyStatOutcome(initialStats(), { stats: { affection: 4 } }); // 안정감 30
    expect(r.affection).toBeCloseTo(4 * 0.3); // 1.2
  });

  it('애착 태그: 친밀위협 상승 → 안정감(파생) 하락', () => {
    const r = applyStatOutcome(initialStats(), { stats: { intimacyThreat: 10 } });
    expect(r.intimacyThreat).toBe(80); // 70 + 10
    expect(r.security).toBe(20); // 100 − |0 − 80|
  });
});

describe('날짜 유틸', () => {
  it('daysBetween', () => {
    expect(daysBetween('2026-01-10', '2026-01-13')).toBe(3);
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
  });
});
