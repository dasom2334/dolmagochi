import type { GameState } from '../game/types';
import { DEFAULT_NOTIFY_SETTINGS, SCHEMA_VERSION } from '../game/stateMachine';
import { cloneFlowtime } from '../game/timer';
import { BALANCE } from '../game/balance';
import { derivedSecurity } from '../game/security';
import { affectionTier } from '../game/dialogue';
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
  // v9 → v10: 상점 2.0 — 소모품 재고(supplies)·세션 소모 기록(session.supply) 추가.
  if (s.schemaVersion === 9) {
    s = {
      ...s,
      schemaVersion: 10,
      supplies: s.supplies ?? {},
      session: { ...s.session, supply: s.session.supply ?? null },
    };
  }
  // v10 → v11: 개정 v4 — 확정 관계 티어(하루 1회 승급)·위기 아크·엔딩 전 대화 일별
  // 게이트·휴식 준수 배율 필드 추가.
  // - relationTier는 현 호감도의 티어로 초기화 (새 임계 기준 — 구 세이브의 진행 존중)
  // - 이미 3/5티어를 지난 세이브는 보장 아크를 '겪은 것'으로 처리 —
  //   마이그레이션 직후 위기가 연속으로 터지는 것을 막는다 (그 시절은 지났다)
  if (s.schemaVersion === 10) {
    const tier = affectionTier(s.stats.affection);
    const fired: string[] = [];
    if (tier >= 3) fired.push('retreat');
    if (tier >= 5) fired.push('sick');
    s = {
      ...s,
      schemaVersion: 11,
      relationTier: tier,
      lastTierUpDate: null,
      lastEndingTalkDate: null,
      pendingCrisis: null,
      crisisArcsFired: fired,
      session: {
        ...s.session,
        freeCareVia: s.session.freeCareVia ?? null,
        restMult: s.session.restMult ?? 1,
      },
    };
  }
  // v11 → v12: 소리풍경(M9) — 레이어별 음소거 목록 추가.
  if (s.schemaVersion === 11) {
    s = {
      ...s,
      schemaVersion: 12,
      settings: { ...s.settings, noiseMuted: s.settings.noiseMuted ?? [] },
    };
  }
  // v12 → v13: 테마(M10) — 라이트/다크/자동. 기본 자동(시스템 따름).
  if (s.schemaVersion === 12) {
    s = {
      ...s,
      schemaVersion: 13,
      settings: { ...s.settings, theme: s.settings.theme ?? 'auto' },
    };
  }
  if (s.schemaVersion !== SCHEMA_VERSION) return null;
  return s;
}
