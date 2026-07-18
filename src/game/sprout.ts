import type { GameState } from './types';
import type { DialoguesData } from '../data/schema';
import { cohabitStageIndex } from './dialogue';
import { BALANCE } from './balance';

/**
 * 돌 위에 돋는 나무 새싹의 상태.
 * - 'budding': 1차 전조 (M19b) — 티어 6부터 정수리에 아주 작은 싹. 엔딩 뒤
 *   갑자기 생기는 게 아니라, 마음이 다 자랄 무렵부터 이미 돋아 있었다.
 * - 'thriving': 빈자리(apart) — 자유롭게 떠난 돌의 새싹은 무성하다.
 * - number: 동거(cohabit)의 시듦 단계(0-base). 의존도가 오를수록 시든다.
 * - 'rooting1'/'rooting2' (M19b, v5 §6): 성장 절반부터 뿌리가 돌을 감싼다 —
 *   불가역. 85부터는 뒤덮여 더는 반응하지 않는다 (죽음의 암시).
 * - null: 새싹 없음.
 */
export type SproutStage =
  | 'budding'
  | 'thriving'
  | 'rooting1'
  | 'rooting2'
  | number;

export function sproutStageOf(
  state: GameState,
  dialogues: DialoguesData,
): SproutStage | null {
  if (state.planted) return null; // 심기 이후 — 묘목은 돌을 떠나 땅에 있다 (M14)
  if (state.era === 'raising')
    return state.relationTier >= BALANCE.SPROUT_HINT_TIER ? 'budding' : null;
  // 뿌리내림기 — 시듦·무성함보다 우선한다 (되돌릴 수 없는 진행)
  if (state.sproutGrowth >= BALANCE.ROOTING_STILL_AT) return 'rooting2';
  if (state.sproutGrowth >= BALANCE.ROOTING_AT) return 'rooting1';
  if (state.era === 'apart') return 'thriving';
  if (state.era === 'cohabit')
    return cohabitStageIndex(dialogues.cohabitStages, state.stats.dependence);
  return null;
}
