import { describe, expect, it } from 'vitest';
import {
  accrueCare,
  cloneFlowtime,
  DEFAULT_FLOWTIME,
  formatElapsed,
  restMinutesFor,
} from '../timer';

describe('restMinutesFor — 휴식 길이 경계값 (기본 배정표)', () => {
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
  it('기본 배정표는 기획서 규칙과 일치', () => {
    expect(DEFAULT_FLOWTIME).toEqual({ bounds: [25, 50, 90], rests: [5, 10, 20, 30] });
  });
});

describe('restMinutesFor — 사용자 지정 배정표', () => {
  it('사용자가 수정한 표를 그대로 적용', () => {
    const custom = { bounds: [30, 60], rests: [3, 8, 15] };
    expect(restMinutesFor(29, custom)).toBe(3);
    expect(restMinutesFor(30, custom)).toBe(8);
    expect(restMinutesFor(59, custom)).toBe(8);
    expect(restMinutesFor(60, custom)).toBe(15);
    expect(restMinutesFor(999, custom)).toBe(15);
  });
  it('cloneFlowtime는 기본값의 새 배열 사본을 만든다', () => {
    const c = cloneFlowtime();
    expect(c).toEqual(DEFAULT_FLOWTIME);
    expect(c.bounds).not.toBe(DEFAULT_FLOWTIME.bounds);
    c.bounds[0] = 999;
    expect(DEFAULT_FLOWTIME.bounds[0]).toBe(25); // 원본 불변
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
