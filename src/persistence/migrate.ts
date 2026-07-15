import type { GameState } from '../game/types';
import { DEFAULT_NOTIFY_SETTINGS, SCHEMA_VERSION } from '../game/stateMachine';
import { cloneFlowtime } from '../game/timer';

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
  // v3 → v4: settings.notify(알림 설정) 추가. 구 세이브엔 없으므로 기본값을 채운다.
  if (s.schemaVersion === 3) {
    s = {
      ...s,
      schemaVersion: 4,
      settings: {
        ...s.settings,
        notify: s.settings.notify ?? { ...DEFAULT_NOTIFY_SETTINGS },
      },
    };
  }
  // v4 → v5: settings.flowtime(휴식 배정표) 추가. 구 세이브엔 없으므로 기본값을 채운다.
  if (s.schemaVersion === 4) {
    s = {
      ...s,
      schemaVersion: 5,
      settings: {
        ...s.settings,
        flowtime: s.settings.flowtime ?? cloneFlowtime(),
      },
    };
  }
  // v5 → v6: settings.pauseOnHide(탭 이탈 시 일시정지) 추가. 기본값은 기존 동작(true).
  if (s.schemaVersion === 5) {
    s = {
      ...s,
      schemaVersion: 6,
      settings: {
        ...s.settings,
        pauseOnHide: s.settings.pauseOnHide ?? true,
      },
    };
  }
  if (s.schemaVersion !== SCHEMA_VERSION) return null;
  return s;
}
