import type { GameState } from '../game/types';
import { SCHEMA_VERSION } from '../game/stateMachine';
import { migrateState } from './migrate';

/** 세이브 파일 포맷 버전 (봉투). 내부 state.schemaVersion과 별개. */
export const SAVE_FORMAT = 1;

export interface SaveEnvelope {
  format: number;
  savedAt: number;
  state: GameState;
}

export type ReadResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'format' | 'shape' | 'version' };

/** 현재 상태를 세이브 봉투로 감싼다. */
export function wrapSave(state: GameState, savedAt: number): SaveEnvelope {
  return { format: SAVE_FORMAT, savedAt, state };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** GameState 최소 구조 검증 — 손상/이질 데이터를 걸러낸다. */
function looksLikeState(x: unknown): x is GameState {
  if (!isRecord(x)) return false;
  const need = [
    'schemaVersion',
    'era',
    'phase',
    'stats',
    'care',
    'session',
    'rest',
    'presence',
    'items',
    'memory',
    'settings',
  ];
  if (!need.every((k) => k in x)) return false;
  if (typeof x.schemaVersion !== 'number') return false;
  // 존재만이 아니라 실제로 객체인지 — { ...키전부, rest: null } 같은 세이브가
  // 주입 후 state.rest.endsAt / state.settings.notifAsked / action in state.memory
  // 등에서 크래시하지 않도록 여기서 걸러낸다
  const objectKeys = [
    'stats',
    'care',
    'session',
    'rest',
    'presence',
    'items',
    'settings',
    'memory',
  ];
  if (!objectKeys.every((k) => isRecord(x[k]))) return false;
  if (!isRecord((x.stats as Record<string, unknown>).needs)) return false;
  return true;
}

/**
 * 이미 파싱된 세이브 봉투를 검증·마이그레이션해 상태를 돌려준다.
 * - format 불일치 → 'format'
 * - 구조 이상 → 'shape'
 * - schemaVersion 마이그레이션 불가 → 'version'
 */
export function readSave(raw: unknown): ReadResult {
  if (!isRecord(raw) || raw.format !== SAVE_FORMAT) {
    return { ok: false, reason: 'format' };
  }
  if (!looksLikeState(raw.state)) {
    return { ok: false, reason: 'shape' };
  }
  const state = raw.state;
  if (state.schemaVersion !== SCHEMA_VERSION) {
    const migrated = migrateState(state);
    if (!migrated) return { ok: false, reason: 'version' };
    return { ok: true, state: migrated };
  }
  return { ok: true, state };
}
