import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { allowedIntimacy, intimacyOutcome } from '../security';
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

describe('intimacyOutcome — 친밀 접근 판정', () => {
  it('허용치 이내 → 안정감 상승, 잠수 없음', () => {
    const r = intimacyOutcome(25, 2, fixed(0.0)); // 허용 2, 접근 2
    expect(r.retreat).toBe(false);
    expect(r.securityDelta).toBe(BALANCE.SECURITY_GAIN_MATCHED);
  });

  it('허용치 +1 (가벼운 초과) → 변화 없음, 잠수 없음', () => {
    const r = intimacyOutcome(25, 3, fixed(0.0));
    expect(r.retreat).toBe(false);
    expect(r.securityDelta).toBe(0);
  });

  it('2레벨 이상 초과 → 안정감 하락 + 확률적 잠수', () => {
    const hit = intimacyOutcome(25, 4, fixed(BALANCE.RETREAT_PROB - 0.01));
    expect(hit.retreat).toBe(true);
    expect(hit.securityDelta).toBe(-BALANCE.SECURITY_LOSS_BREACH);

    const miss = intimacyOutcome(25, 4, fixed(BALANCE.RETREAT_PROB + 0.01));
    expect(miss.retreat).toBe(false);
    expect(miss.securityDelta).toBe(-BALANCE.SECURITY_LOSS_BREACH);
  });

  it('허용치 이내 접근은 절대 잠수를 부르지 않는다 (시드 스윕)', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(intimacyOutcome(50, 2, rng).retreat).toBe(false);
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
