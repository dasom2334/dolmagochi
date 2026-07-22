import { useStore } from 'zustand';
import { createGameStore, gameData, type GameStore } from './gameStore';
import type { GameEvent } from '../game/types';
import { playSound, setSoundEnabled, type SoundName } from '../sound';
import { isActionUnlocked } from '../game/stateMachine';
import { nightVariant, SYS } from '../game/text';
import type { TimeOfDay } from '../game/types';
import { pushToast } from '../toast';

/** 앱 전역 스토어 싱글턴 (테스트는 createGameStore를 직접 사용) */
export const appStore = createGameStore();

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(appStore, selector);
}

/**
 * 사용자 조작 이벤트 → 효과음. 여기 없는 이벤트(TICK·SET_PAUSED·SETTLE 등)는 무음.
 * TICK은 스토어 내부 dispatch를 타 이 래퍼를 거치지 않으므로 매 틱 소음이 없다.
 */
function soundForEvent(event: GameEvent): SoundName | null {
  switch (event.type) {
    case 'START_FOCUS':
    case 'BUY':
    case 'CHOOSE_COHABIT':
    case 'CHOOSE_FAREWELL':
    case 'FAREWELL_FROM_COHABIT':
      return 'confirm';
    case 'TALK':
      return 'talk';
    case 'SET_NOISE':
    case 'SET_NOTIFY':
    case 'SET_PAUSE_ON_HIDE':
    case 'SET_FOCUS_NOTIFY':
      return event.on ? 'toggleOn' : 'toggleOff';
    case 'SELECT_ACTION':
    case 'END_FOCUS':
    case 'REST_STEP':
    case 'REST_ACT':
    case 'TALK_CHOICE':
    case 'CHOICE_PICKED':
    case 'SET_PLACEMENT':
    case 'VISIT_HOLD':
    case 'EPILOGUE_DONE':
      return 'click';
    default:
      return null;
  }
}

export function dispatch(event: GameEvent): void {
  // 효과음은 클릭(사용자 제스처)에서 나므로 여기서 AudioContext가 깨어난다.
  if (event.type === 'SET_SOUND') {
    // '켜는' 순간 피드백은 아직 enabled=false일 수 있어 force로 낸다.
    if (event.on) {
      setSoundEnabled(true);
      playSound('toggleOn', true);
    } else {
      playSound('toggleOff');
      setSoundEnabled(false);
    }
  } else {
    const s = soundForEvent(event);
    if (s) playSound(s);
  }
  // 구매로 새 행동이 해금되면 알림 — 이어서 배치 프롬프트가 뜬다.
  // (일시 차단과 무관한 해금 판정 — 병간호 중 구매해도 알림이 유실되지 않는다)
  const beforeUnlocked =
    event.type === 'BUY'
      ? gameData.actions
          .filter((a) => isActionUnlocked(a, appStore.getState().state))
          .map((a) => a.id)
      : null;
  appStore.getState().dispatch(event);
  if (beforeUnlocked) {
    const after = appStore.getState().state;
    for (const a of gameData.actions) {
      if (!beforeUnlocked.includes(a.id) && isActionUnlocked(a, after)) {
        pushToast(tf(SYS.toasts.actionUnlocked, { action: t(a.nameId) }));
      }
    }
  }
}

export function now(): number {
  return appStore.getState().now();
}

/**
 * UI 표시용 텍스트 (첫 변형, 페이지는 \n 결합).
 * 상태에 실리는 서사 텍스트는 transition에서 추첨되어 이미 상태에 있다 —
 * 렌더마다 재추첨하면 깜빡이므로 UI 슬롯은 결정적으로 첫 변형을 쓴다.
 */
export function t(id: string): string {
  return (gameData.text[id]?.[0] ?? [`[MISSING TEXT: ${id}]`]).join('\n');
}

/**
 * 시간대(밤) 반영 UI 텍스트 — 밤이고 `{id}.night`가 있으면 그 문구로.
 * 햇빛쬐기 계열(버튼·캡션·선택지)이 밤에 달빛 화법으로 바뀌는 공통 경로.
 */
export function tNight(id: string, tod: TimeOfDay | undefined): string {
  return t(nightVariant(gameData.text, id, tod));
}

/** {var} 치환 포함 */
export function tf(id: string, vars: Record<string, string | number>): string {
  return t(id).replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}

if (import.meta.env.DEV) {
  // 개발 편의: 콘솔에서 상태 조작 (프로덕션 번들에서는 제거됨)
  (window as unknown as Record<string, unknown>).__game = appStore;
}
