import { describe, expect, it } from 'vitest';
import { dueFocusMarks } from '../notify';
import { DEFAULT_NOTIFY_SETTINGS } from '../stateMachine';
import { DEFAULT_FLOWTIME } from '../timer';
import type { NotifySettings } from '../types';

const allOn: NotifySettings = {
  enabled: true,
  restEnd: true,
  focusMarks: [true, true, true],
};
const FT = DEFAULT_FLOWTIME; // bounds [25,50,90]

describe('dueFocusMarks — 집중 구간 알림(= Flowtime 경계)', () => {
  it('전체 알림이 꺼져 있으면 아무 것도 안 낸다', () => {
    expect(dueFocusMarks(0, 6000, { ...allOn, enabled: false }, FT)).toEqual([]);
  });

  it('경계를 넘는 순간에만 그 "분"을 1회 낸다 (25분=1500초)', () => {
    expect(dueFocusMarks(1499, 1500, allOn, FT)).toEqual([25]);
    expect(dueFocusMarks(1500, 1600, allOn, FT)).toEqual([]);
  });

  it('한 틱에 여러 경계를 넘으면 모두 낸다', () => {
    expect(dueFocusMarks(0, 5400, allOn, FT)).toEqual([25, 50, 90]);
  });

  it('꺼진 경계는 건너뛴다', () => {
    const only90: NotifySettings = { ...allOn, focusMarks: [false, false, true] };
    expect(dueFocusMarks(0, 5400, only90, FT)).toEqual([90]);
  });

  it('경계를 바꾸면 알림 시각도 따라간다 (90→94)', () => {
    const ft = { bounds: [25, 50, 94], rests: [5, 10, 20, 30] };
    // 90분(5400초)에는 이제 안 울리고, 94분(5640초)에 울린다
    expect(dueFocusMarks(5399, 5400, allOn, ft)).toEqual([]);
    expect(dueFocusMarks(5639, 5640, allOn, ft)).toEqual([94]);
  });

  it('기본 설정에서는 집중 구간 알림이 없다(전부 off)', () => {
    expect(dueFocusMarks(0, 9999, DEFAULT_NOTIFY_SETTINGS, FT)).toEqual([]);
  });

  it('기본 focusMarks 길이는 기본 경계 개수와 일치한다 (암묵 커플링 방지)', () => {
    expect(DEFAULT_NOTIFY_SETTINGS.focusMarks).toHaveLength(
      DEFAULT_FLOWTIME.bounds.length,
    );
  });
});
