import { BALANCE } from './balance';
import type { FocusNotifyKey, NotifySettings } from './types';

/**
 * 직전 집중 경과(prevSec)에서 현재(curSec) 사이에 새로 넘어선 집중 구간 알림 키.
 * - 전체 알림(enabled)이 꺼져 있으면 아무것도 안 낸다.
 * - 각 문턱은 해당 개별 토글이 켜져 있을 때만, 문턱을 "넘는 순간" 1회.
 * 순수 함수 — 실제 토스트/OS 알림 발동은 호출부(React 계층)가 한다.
 */
export function dueFocusMarks(
  prevSec: number,
  curSec: number,
  notify: NotifySettings,
): FocusNotifyKey[] {
  if (!notify.enabled) return [];
  return BALANCE.NOTIFY_FOCUS_MARKS.filter(
    (m) => notify[m.key] && prevSec < m.sec && curSec >= m.sec,
  ).map((m) => m.key);
}
