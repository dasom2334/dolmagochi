import type { GameState } from '../game/types';
import { readSave, wrapSave, type ReadResult } from './saveSchema';

/** 세이브를 사람이 읽기 좋은 JSON 문자열로 내보낸다. */
export function exportSaveJson(state: GameState, savedAt: number): string {
  return JSON.stringify(wrapSave(state, savedAt), null, 2);
}

export type ImportResult = ReadResult | { ok: false; reason: 'parse' };

/** JSON 문자열을 파싱·검증해 상태를 돌려준다. */
export function importSaveJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'parse' };
  }
  return readSave(parsed);
}
