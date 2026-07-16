import type { GameState } from '../game/types';
import { DEFAULT_NOTIFY_SETTINGS, SCHEMA_VERSION } from '../game/stateMachine';
import { cloneFlowtime } from '../game/timer';
import { BALANCE } from '../game/balance';
import { derivedSecurity } from '../game/security';
import { needsLevelOf } from '../game/stats';

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
  // v6 → v7: settings.soundOn(UI 효과음) 추가. 기본값 켜짐.
  if (s.schemaVersion === 6) {
    s = {
      ...s,
      schemaVersion: 7,
      settings: {
        ...s.settings,
        soundOn: s.settings.soundOn ?? true,
      },
    };
  }
  // v7 → v8: 집중 알림을 개별 키(focus25/50/90)에서 Flowtime 경계 대응 배열(focusMarks)로.
  if (s.schemaVersion === 7) {
    const old = s.settings.notify as unknown as {
      focus25?: boolean;
      focus50?: boolean;
      focus90?: boolean;
      focusMarks?: boolean[];
    };
    const boundCount = s.settings.flowtime?.bounds?.length ?? 3;
    const legacy = [old.focus25, old.focus50, old.focus90];
    const focusMarks =
      old.focusMarks ??
      Array.from({ length: boundCount }, (_, i) => legacy[i] ?? false);
    s = {
      ...s,
      schemaVersion: 8,
      settings: {
        ...s.settings,
        notify: { enabled: s.settings.notify.enabled, restEnd: s.settings.notify.restEnd, focusMarks },
      },
    };
  }
  // v8 → v9: 애착 2축(유기불안·친밀위협) 도입 + 아이템 기반 행동 해금 정합화.
  // - 구 단일 security는 버리고 두 축을 시작값으로 주입(안정감은 파생)
  // - v8에서 가용했던 행동(read/sun/walk 항상, cook/chore는 minLevel 2/3)을
  //   unlockedActions로 보존 — 아니면 아이템 미보유로 전부 잠겨 lie/free만 남는다
  // - presence.sick 기본값을 여기서 채워 마이그레이션을 자기완결적으로
  if (s.schemaVersion === 8) {
    const level = needsLevelOf(s.stats.needs);
    const preserved = ['read', 'sun', 'walk'];
    if (level >= 2) preserved.push('cook');
    if (level >= 3) preserved.push('chore');
    s = {
      ...s,
      schemaVersion: 9,
      unlockedActions: [...new Set([...s.unlockedActions, ...preserved])],
      presence: { ...s.presence, sick: false },
      stats: {
        ...s.stats,
        abandonment: BALANCE.ABANDONMENT_START,
        intimacyThreat: BALANCE.INTIMACY_THREAT_START,
        security: derivedSecurity(
          BALANCE.ABANDONMENT_START,
          BALANCE.INTIMACY_THREAT_START,
        ),
      },
    };
  }
  if (s.schemaVersion !== SCHEMA_VERSION) return null;
  return s;
}
