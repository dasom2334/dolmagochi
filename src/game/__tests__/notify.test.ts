import { describe, expect, it } from 'vitest';
import { dueFocusMarks } from '../notify';
import { DEFAULT_NOTIFY_SETTINGS } from '../stateMachine';
import type { NotifySettings } from '../types';

const allOn: NotifySettings = {
  enabled: true,
  restEnd: true,
  focus25: true,
  focus50: true,
  focus90: true,
};

describe('dueFocusMarks — 집중 구간 알림 문턱', () => {
  it('전체 알림이 꺼져 있으면 아무 것도 안 낸다', () => {
    expect(dueFocusMarks(0, 6000, { ...allOn, enabled: false })).toEqual([]);
  });

  it('문턱을 넘는 순간에만 1회 (25분=1500초)', () => {
    expect(dueFocusMarks(1499, 1500, allOn)).toEqual(['focus25']);
    // 이미 넘긴 뒤 같은 문턱은 다시 안 낸다
    expect(dueFocusMarks(1500, 1600, allOn)).toEqual([]);
  });

  it('한 틱에 여러 문턱을 넘으면 모두 낸다', () => {
    expect(dueFocusMarks(0, 5400, allOn)).toEqual([
      'focus25',
      'focus50',
      'focus90',
    ]);
  });

  it('개별 토글이 꺼진 문턱은 건너뛴다', () => {
    const only90: NotifySettings = { ...allOn, focus25: false, focus50: false };
    expect(dueFocusMarks(0, 5400, only90)).toEqual(['focus90']);
  });

  it('기본 설정에서는 집중 구간 알림이 없다(전부 off)', () => {
    expect(dueFocusMarks(0, 9999, DEFAULT_NOTIFY_SETTINGS)).toEqual([]);
  });
});
