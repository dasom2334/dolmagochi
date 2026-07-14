import { BALANCE } from './balance';
import type { GameState, MemoryEntry, TextId } from './types';
import type { ReflectionDef } from '../data/schema';
import { checkCondition } from './conditions';
import { pick, type Rng } from './rng';

/**
 * 기억 강화: 같은 종류의 경험이 반복되면 항목이 강해진다 (상한 있음).
 * 항목은 절대 삭제되지 않는다.
 */
export function remember(
  memory: Readonly<Record<string, MemoryEntry>>,
  k: string,
  w: number,
  at: number,
): Record<string, MemoryEntry> {
  const prev = memory[k];
  return {
    ...memory,
    [k]: {
      w: Math.min(BALANCE.MEMORY_WEIGHT_MAX, (prev?.w ?? 0) + w),
      count: (prev?.count ?? 0) + 1,
      lastAt: at,
    },
  };
}

/**
 * 문맥 변형 선택: when이 현재 상태와 맞는 변형이 있으면 그중 추첨(문맥 우선),
 * 없으면 기본(when 없는) 변형에서 추첨.
 */
export function resolveReflection(
  def: ReflectionDef,
  state: GameState,
  rng: Rng,
): TextId | null {
  const contextual = def.variants.filter(
    (v) => v.when !== undefined && checkCondition(v.when, state),
  );
  const pool =
    contextual.length > 0
      ? contextual
      : def.variants.filter((v) => v.when === undefined);
  return pick(rng, pool)?.textId ?? null;
}

export interface MemoryDraw {
  tokenKind: string;
  textId: TextId;
  /** 추출된 항목이 감쇠된 새 풀 — 바닥값 밑으로 내려가지 않는다 */
  memory: Record<string, MemoryEntry>;
}

/**
 * 가중치 비례 추출. 반추 정의가 있는 종류만 후보.
 * 추출된 항목은 감쇠(같은 기억의 연속 반추 억제)하되 절대 소멸하지 않는다.
 */
export function drawMemory(
  memory: Readonly<Record<string, MemoryEntry>>,
  defs: ReflectionDef[],
  state: GameState,
  rng: Rng,
): MemoryDraw | null {
  const candidates = Object.entries(memory).filter(([k]) =>
    defs.some((d) => d.token === k && d.variants.length > 0),
  );
  if (candidates.length === 0) return null;

  const total = candidates.reduce((a, [, e]) => a + e.w, 0);
  let r = rng() * total;
  let picked = candidates[0];
  for (const c of candidates) {
    r -= c[1].w;
    if (r <= 0) {
      picked = c;
      break;
    }
  }
  const [kind, entry] = picked;
  const def = defs.find((d) => d.token === kind)!;
  const textId = resolveReflection(def, state, rng);
  if (textId === null) return null;

  return {
    tokenKind: kind,
    textId,
    memory: {
      ...memory,
      [kind]: {
        ...entry,
        w: Math.max(BALANCE.MEMORY_WEIGHT_FLOOR, entry.w * BALANCE.DRAW_DECAY),
      },
    },
  };
}
