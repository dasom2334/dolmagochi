import type { GameState } from '../game/types';
import { SCHEMA_VERSION } from '../game/stateMachine';

/**
 * 상태 스키마 버전 마이그레이션 체인.
 * 현재 지원 버전(SCHEMA_VERSION)과 다르면 단계별로 올린다.
 * 처리할 수 없는 버전이면 null (호출부가 에러로 처리).
 *
 * 아직 이전 버전이 없으므로 현재 버전만 통과시킨다.
 * 스키마가 바뀌면 여기 case를 추가한다: v3 → v4 변환 등.
 */
export function migrateState(state: GameState): GameState | null {
  let s = state;
  // 예시 골격 (버전 오를 때 채운다):
  // if (s.schemaVersion === 3) { s = { ...s, schemaVersion: 4, /* 새 필드 기본값 */ }; }
  if (s.schemaVersion !== SCHEMA_VERSION) return null;
  return s;
}
