import { describe, expect, it } from 'vitest';
import { accrueCare, formatElapsed, restMinutesFor } from '../timer';

describe('restMinutesFor — 휴식 길이 경계값', () => {
  it('25분 미만 → 5분', () => {
    expect(restMinutesFor(0)).toBe(5);
    expect(restMinutesFor(24.9)).toBe(5);
  });
  it('25분 → 10분 (경계는 상위 구간)', () => {
    expect(restMinutesFor(25)).toBe(10);
    expect(restMinutesFor(49.9)).toBe(10);
  });
  it('50분 → 20분', () => {
    expect(restMinutesFor(50)).toBe(20);
    expect(restMinutesFor(89.9)).toBe(20);
  });
  it('90분 이상 → 30분', () => {
    expect(restMinutesFor(90)).toBe(30);
    expect(restMinutesFor(240)).toBe(30);
  });
});

describe('accrueCare — 정성 이월 누적', () => {
  it('20분 + 10분 = 1정성 + 5분 이월', () => {
    const after20 = accrueCare({ points: 0, carryMinutes: 0 }, 20);
    expect(after20).toEqual({ points: 0, carryMinutes: 20 });
    const after10 = accrueCare(after20, 10);
    expect(after10).toEqual({ points: 1, carryMinutes: 5 });
  });
  it('25분 미만 세션도 손실 없이 이월된다', () => {
    let care = { points: 0, carryMinutes: 0 };
    for (let i = 0; i < 5; i++) care = accrueCare(care, 10);
    expect(care).toEqual({ points: 2, carryMinutes: 0 });
  });
  it('긴 세션은 여러 포인트로 환산', () => {
    expect(accrueCare({ points: 3, carryMinutes: 10 }, 90)).toEqual({
      points: 7,
      carryMinutes: 0,
    });
  });
});

describe('formatElapsed', () => {
  it('분:초 / 시:분:초', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(3661)).toBe('1:01:01');
  });
});
