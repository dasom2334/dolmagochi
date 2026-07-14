import type { Era } from './types';
import type { DialogueLine, DialoguesData } from '../data/schema';
import type { Rng } from './rng';

export interface DialoguePool {
  poolId: string;
  lines: DialogueLine[];
}

/**
 * 현재 상태의 대화 풀 선택:
 * - 육성: 파생 욕구 단계별 풀
 * - 동거: 의존도 구간별 단계 풀 (화자의 깨달음이 강해진다)
 * - apart: 풀 대신 회상/방문 대화가 별도 처리되므로 null
 */
export function selectDialoguePool(
  dialogues: DialoguesData,
  era: Era,
  needsLevel: number,
  dependence: number,
): DialoguePool | null {
  if (era === 'apart') return null;
  if (era === 'cohabit') {
    let idx = -1;
    for (let i = 0; i < dialogues.cohabitStages.length; i++) {
      if (dependence >= dialogues.cohabitStages[i].minDependence) idx = i;
    }
    if (idx < 0) return { poolId: 'cohabit0', lines: [] };
    return { poolId: `cohabit${idx}`, lines: dialogues.cohabitStages[idx].lines };
  }
  const poolId = `stage${needsLevel}`;
  const pools: Record<string, DialogueLine[]> = {
    stage1: dialogues.stage1,
    stage2: dialogues.stage2,
    stage3: dialogues.stage3,
    stage4: dialogues.stage4,
    stage5: dialogues.stage5,
  };
  return { poolId, lines: pools[poolId] ?? [] };
}

export interface NonReplacingDraw {
  index: number;
  used: number[];
}

/**
 * 비복원 추출: 사용한 인덱스를 피해서 뽑고, 풀이 소진되어 있으면 리셋 후 뽑는다.
 * poolSize 0이면 null.
 */
export function drawNonReplacing(
  poolSize: number,
  used: readonly number[],
  rng: Rng,
): NonReplacingDraw | null {
  if (poolSize <= 0) return null;
  let effective = used;
  if (effective.length >= poolSize) effective = [];
  const avail: number[] = [];
  for (let i = 0; i < poolSize; i++) {
    if (!effective.includes(i)) avail.push(i);
  }
  const index = avail[Math.floor(rng() * avail.length)];
  return { index, used: [...effective, index] };
}
