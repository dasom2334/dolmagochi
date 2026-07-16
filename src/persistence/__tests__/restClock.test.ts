import { describe, expect, it } from 'vitest';
import { isRestOver, restProgressPct, restRemainingSec } from '../restClock';

const T0 = 1_800_000_000_000;

describe('restClock — endsAt 타임스탬프 기준', () => {
  it('남은 시간: 미래면 초 단위, 지났으면 0', () => {
    expect(restRemainingSec(T0 + 300_000, T0)).toBe(300); // 5분 남음
    expect(restRemainingSec(T0, T0 + 60_000)).toBe(0); // 이미 지남
    expect(restRemainingSec(0, T0)).toBe(0); // endsAt 미설정
  });

  it('만료 판정: endsAt 설정 + 현재 시각이 지남', () => {
    expect(isRestOver(T0 + 1000, T0)).toBe(false);
    expect(isRestOver(T0, T0)).toBe(true);
    expect(isRestOver(T0 - 1, T0)).toBe(true);
    expect(isRestOver(0, T0)).toBe(false); // 미설정은 만료 아님
  });

  it('만료 시각 경과 후 로드해도 잔여는 0 (음수 아님)', () => {
    const endsAt = T0 + 600_000;
    const loadedLate = T0 + 3_600_000; // 1시간 뒤 로드
    expect(restRemainingSec(endsAt, loadedLate)).toBe(0);
    expect(isRestOver(endsAt, loadedLate)).toBe(true);
  });

  it('진행률 %: 잔여/전체', () => {
    expect(restProgressPct(T0 + 300_000, 600, T0)).toBe(50);
    expect(restProgressPct(T0, 600, T0 + 60_000)).toBe(0);
    expect(restProgressPct(T0 + 600_000, 0, T0)).toBe(0); // 전체 0 방어
  });

  it('진행률 %: 100 상한 클램프 (휴식 시작 순간 낡은 nowMs 방어)', () => {
    // nowMs가 아직 갱신 전(과거)이라 잔여가 totalSec를 초과해도 100을 넘지 않는다
    const endsAt = T0 + 600_000; // 10분 뒤 종료(총 600초)
    const staleNow = T0 - 300_000; // 5분 과거 → 잔여 900초 > 600초
    expect(restProgressPct(endsAt, 600, staleNow)).toBe(100);
  });
});
