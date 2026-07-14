import { useStore } from 'zustand';
import { createGameStore, gameData, type GameStore } from './gameStore';
import type { GameEvent } from '../game/types';

/** 앱 전역 스토어 싱글턴 (테스트는 createGameStore를 직접 사용) */
export const appStore = createGameStore();

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(appStore, selector);
}

export function dispatch(event: GameEvent): void {
  appStore.getState().dispatch(event);
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
