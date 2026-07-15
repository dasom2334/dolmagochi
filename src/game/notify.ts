import type { FlowtimeSettings, NotifySettings } from './types';

/**
 * 직전 집중 경과(prevSec)에서 현재(curSec) 사이에 새로 넘어선 집중 구간 알림의 "분" 목록.
 * 알림 문턱 = Flowtime 경계(flowtime.bounds, 분). 각 경계는 notify.focusMarks[i]가 켜졌을 때만,
 * 경계를 "넘는 순간" 1회. 전체 알림(enabled)이 꺼져 있으면 아무것도 안 낸다.
 * 순수 함수 — 실제 토스트/OS 알림 발동은 호출부(React 계층)가 한다.
 */
export function dueFocusMarks(
  prevSec: number,
  curSec: number,
  notify: NotifySettings,
  flowtime: FlowtimeSettings,
): number[] {
  if (!notify.enabled) return [];
  const out: number[] = [];
  flowtime.bounds.forEach((boundMin, i) => {
    const sec = boundMin * 60;
    if (notify.focusMarks[i] && prevSec < sec && curSec >= sec) out.push(boundMin);
  });
  return out;
}
