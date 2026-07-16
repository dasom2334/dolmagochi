import { createStore, type StoreApi } from 'zustand/vanilla';
import type { GameEvent, GameState } from '../game/types';
import { defaultRng, type Rng } from '../game/rng';
import {
  createInitialState,
  transition,
  type TransitionCtx,
} from '../game/stateMachine';
import type { GameData } from '../data/schema';
import type { TextCatalog } from '../game/text';

import actions from '../data/actions.json';
import dialogues from '../data/dialogues.json';
import events from '../data/events.json';
import shop from '../data/shop.json';
import reflections from '../data/reflections.json';
import restActs from '../data/restActs.json';
import timeMarks from '../data/timeMarks.json';
import endings from '../data/endings.json';
import ko from '../data/locales/ko.json';

/** 로케일 카탈로그 — 현재 ko만. 언어 추가 = 카탈로그 파일 추가 */
export const catalogs: Record<string, TextCatalog> = {
  ko: ko as TextCatalog,
};

/** 번들된 게임 데이터 (게임 텍스트의 유일한 출처 = 로케일 카탈로그) */
export function buildGameData(locale = 'ko'): GameData {
  return {
    actions,
    dialogues,
    events,
    shop,
    reflections,
    restActs,
    timeMarks,
    endings,
    text: catalogs[locale] ?? catalogs['ko'],
  } as unknown as GameData;
}

export const gameData: GameData = buildGameData('ko');

export interface GameStoreOptions {
  rng?: Rng;
  /** 현재 시각(ms) 공급자 — 테스트에서 주입 */
  now?: () => number;
  data?: GameData;
  initialState?: GameState;
}

export interface GameStore {
  state: GameState;
  dispatch: (event: GameEvent) => void;
  /** 집중 세션 시간 진행 (dt초). 일시정지·비집중 phase에서는 무시됨 */
  tick: (dtSec: number) => void;
  now: () => number;
}

export function createGameStore(
  options: GameStoreOptions = {},
): StoreApi<GameStore> {
  const rng = options.rng ?? defaultRng;
  const now = options.now ?? Date.now;
  const data = options.data ?? gameData;
  const ctx: TransitionCtx = { rng, data };
  // 시작 행동은 starter 플래그로 명시 (배열 순서·무해금 행동 추가에 영향받지 않게)
  const defaultAction =
    data.actions.find((a) => a.starter)?.id ??
    data.actions.find((a) => !a.unlock)?.id ??
    'free';

  return createStore<GameStore>((set, get) => ({
    state: options.initialState ?? createInitialState(now(), defaultAction),
    now,
    dispatch: (event) =>
      set((s) => ({ state: transition(s.state, event, ctx) })),
    tick: (dtSec) => get().dispatch({ type: 'TICK', dtSec }),
  }));
}
