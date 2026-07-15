import type { GameState } from './types';
import type { DialoguesData } from '../data/schema';
import { cohabitStageIndex } from './dialogue';

/**
 * 엔딩 분기 이후 돌에 돋는 나무 새싹의 상태.
 * - 'thriving': 빈자리(apart) — 자유롭게 떠난 돌의 새싹은 무성하다.
 * - number: 동거(cohabit)의 시듦 단계(0-base). 의존도 단계가 오를수록 커지고, 클수록 더 시든다.
 * - null: 육성 중(raising) — 아직 새싹이 없다.
 */
export type SproutStage = 'thriving' | number;

export function sproutStageOf(
  state: GameState,
  dialogues: DialoguesData,
): SproutStage | null {
  if (state.era === 'apart') return 'thriving';
  if (state.era === 'cohabit')
    return cohabitStageIndex(dialogues.cohabitStages, state.stats.dependence);
  return null;
}
