import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import {
  allowedIntimacy,
  attachQuadrant,
  convergeStep,
  derivedSecurity,
  intimacyOutcome,
  isBalanced,
  volatility,
} from '../security';
import { absenceSessionEnd, startAbsence } from '../absence';
import { mulberry32, type Rng } from '../rng';

const fixed = (v: number): Rng => () => v;

describe('allowedIntimacy — 안정감에 따른 허용 친밀도', () => {
  it('구간 매핑 1~5', () => {
    expect(allowedIntimacy(0)).toBe(1);
    expect(allowedIntimacy(24)).toBe(1);
    expect(allowedIntimacy(25)).toBe(2);
    expect(allowedIntimacy(75)).toBe(4);
    expect(allowedIntimacy(100)).toBe(5);
  });
});

describe('애착 파생값·4분면·수렴', () => {
  it('안정감 = 100 − |유기불안 − 친밀위협|', () => {
    expect(derivedSecurity(0, 75)).toBe(25);
    expect(derivedSecurity(40, 40)).toBe(100);
    expect(derivedSecurity(90, 0)).toBe(10);
  });

  it('변동성 = (유기불안 + 친밀위협) / 2', () => {
    expect(volatility(0, 75)).toBe(37.5);
    expect(volatility(80, 80)).toBe(80);
  });

  it('4분면 분류', () => {
    expect(attachQuadrant(10, 10)).toBe('secure'); // 균형·합 낮음
    expect(attachQuadrant(70, 70)).toBe('chaotic'); // 균형·합 높음(≥120)
    expect(attachQuadrant(80, 10)).toBe('clingy'); // 유기불안 큼
    expect(attachQuadrant(10, 80)).toBe('avoidant'); // 친밀위협 큼
  });

  it('convergeStep: 두 축이 중간으로 수렴, 2~3턴 내 균형 복귀', () => {
    let a = 0;
    let t = 75; // 회피 극단
    let turns = 0;
    while (!isBalanced(a, t) && turns < 5) {
      ({ abandonment: a, intimacyThreat: t } = convergeStep(a, t));
      turns++;
    }
    expect(isBalanced(a, t)).toBe(true);
    expect(turns).toBeLessThanOrEqual(3);
  });
});

// (0, 75): 안정감 25 → 허용 친밀도 2, 변동성 37.5
describe('intimacyOutcome — 친밀 접근 판정 (2축)', () => {
  it('허용치 이내 → 두 축 동시 진정, 잠수 없음', () => {
    const r = intimacyOutcome(0, 75, 2, fixed(0.0)); // 접근 2 = 허용 2
    expect(r.retreat).toBe(false);
    expect(r.abandonmentDelta).toBe(-BALANCE.ATTACH_SOOTHE);
    expect(r.intimacyThreatDelta).toBe(-BALANCE.ATTACH_SOOTHE);
  });

  it('허용치 +1 (가벼운 초과) → 변화 없음, 잠수 없음', () => {
    const r = intimacyOutcome(0, 75, 3, fixed(0.0));
    expect(r.retreat).toBe(false);
    expect(r.abandonmentDelta).toBe(0);
    expect(r.intimacyThreatDelta).toBe(0);
  });

  it('2레벨 이상 초과 → 친밀위협↑ + 확률적 잠수(변동성 반영)', () => {
    const prob =
      BALANCE.RETREAT_PROB * (1 + BALANCE.RETREAT_VOL_SCALE * (37.5 / 100));
    const hit = intimacyOutcome(0, 75, 4, fixed(prob - 0.01));
    expect(hit.retreat).toBe(true);
    expect(hit.intimacyThreatDelta).toBe(BALANCE.ATTACH_THREAT_UP);
    expect(hit.abandonmentDelta).toBe(0);

    const miss = intimacyOutcome(0, 75, 4, fixed(prob + 0.01));
    expect(miss.retreat).toBe(false);
    expect(miss.intimacyThreatDelta).toBe(BALANCE.ATTACH_THREAT_UP);
  });

  it('허용치 이내 접근은 절대 잠수를 부르지 않는다 (시드 스윕)', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(intimacyOutcome(25, 25, 2, rng).retreat).toBe(false); // 안정감 100
    }
  });
});

describe('잠수 수명주기', () => {
  it('부재 길이는 1~3세션', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 100; i++) {
      const p = startAbsence(rng);
      expect(p.state).toBe('absent');
      expect(p.plannedSessions).toBeGreaterThanOrEqual(
        BALANCE.ABSENCE_SESSIONS_MIN,
      );
      expect(p.plannedSessions).toBeLessThanOrEqual(
        BALANCE.ABSENCE_SESSIONS_MAX,
      );
    }
  });

  it('저친밀 행동 세션만 복귀 누적에 카운트', () => {
    const p0 = { ...startAbsence(fixed(0.9)) }; // planned 3
    expect(p0.plannedSessions).toBe(3);
    const high = absenceSessionEnd(p0, BALANCE.RETURN_LOW_INTIMACY_MAX + 1);
    expect(high.lowIntimacyProgress).toBe(0);
    const low = absenceSessionEnd(p0, BALANCE.RETURN_LOW_INTIMACY_MAX);
    expect(low.lowIntimacyProgress).toBe(1);
  });

  it('누적이 예정 길이에 도달하면 복귀 (returnPending)', () => {
    let p = startAbsence(fixed(0.5)); // planned 2
    expect(p.plannedSessions).toBe(2);
    p = absenceSessionEnd(p, 1);
    expect(p.state).toBe('absent');
    p = absenceSessionEnd(p, 1);
    expect(p.state).toBe('present');
    expect(p.returnPending).toBe(true);
  });

  it('재석 중에는 아무 것도 하지 않는다', () => {
    const present = {
      state: 'present' as const,
      plannedSessions: 0,
      lowIntimacyProgress: 0,
      returnPending: false,
    };
    expect(absenceSessionEnd(present, 1)).toBe(present);
  });
});
