import { describe, expect, it } from 'vitest';
import { stepKey } from '../CanvasScene';

// 계단 애니가 칸을 옮기는 순간에만 키가 바뀌어야 한다 — 바뀌면 간격과 무관하게 그린다.
describe('stepKey', () => {
  it('눈 두 층은 3800ms 동안 30번(127ms) + 21번(180ms) 칸을 옮긴다', () => {
    const st = { weather: 'snow' };
    let changes = 0;
    for (let t = 1; t <= 3800; t++)
      if (stepKey(st, false, t) !== stepKey(st, false, t - 1)) changes++;
    expect(changes).toBeGreaterThanOrEqual(49);
    expect(changes).toBeLessThanOrEqual(52);
  });
  it('맑은 날, 불 꺼짐, 찻잔 비면 시간이 흘러도 키가 그대로다', () => {
    const st = { weather: 'clear', cup: 'empty' };
    expect(stepKey(st, false, 0)).toBe(stepKey(st, false, 5000));
  });
  it('불꽃 프레임(165ms)은 불이 켜졌을 때만 센다', () => {
    const st = { weather: 'clear' };
    expect(stepKey(st, true, 0)).not.toBe(stepKey(st, true, 170));
    expect(stepKey(st, false, 0)).toBe(stepKey(st, false, 170));
  });
});
