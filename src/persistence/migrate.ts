import type { CrisisKind, GameState } from '../game/types';
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
      pendingCrises: [],
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
  // v13 → v14: 도감(M11a) — 뱃지 획득 기록·4분면 목격 추가.
  // 뱃지는 다음 시각 이벤트에서 현 상태 기준으로 자연 정산된다 (백필 불필요).
  if (s.schemaVersion === 13) {
    s = {
      ...s,
      schemaVersion: 14,
      badges: s.badges ?? {},
      quadrantsSeen: s.quadrantsSeen ?? [],
      session: { ...s.session, momentFired: s.session.momentFired ?? false },
    };
  }
  // v14 → v15: 날씨·시간대(M12) — 상태·설정·세션 필드 추가.
  if (s.schemaVersion === 14) {
    s = {
      ...s,
      schemaVersion: 15,
      weather: s.weather ?? 'clear',
      lastWeatherDate: s.lastWeatherDate ?? null,
      pendingUmbrella: false,
      session: {
        ...s.session,
        umbrella: s.session.umbrella ?? false,
        wetness: s.session.wetness ?? null,
      },
      settings: {
        ...s.settings,
        timeOfDay: s.settings.timeOfDay ?? 'auto',
        season: s.settings.season ?? 'auto',
      },
    };
  }
  // v15 → v16: 2차 독립기(M14) — 묘목 성장·붙잡기 스펙트럼 필드.
  // 기존 apart/cohabit 세이브는 성장 0에서 시작 (2차가 이제 막 생긴 것)
  if (s.schemaVersion === 15) {
    s = {
      ...s,
      schemaVersion: 16,
      sproutGrowth: s.sproutGrowth ?? 0,
      witherLevel: s.witherLevel ?? 0,
      letGoCount: s.letGoCount ?? 0,
      bloomSeen: s.bloomSeen ?? false,
      balancedSeen: s.balancedSeen ?? false,
      planted: s.planted ?? false,
      plantedAt: s.plantedAt ?? null,
      highThreatStreak: s.highThreatStreak ?? 0,
      apart: { ...s.apart, held: s.apart.held ?? false },
    };
  }
  // v16 → v17: apart 제2의 이별(M14b) — 방문 차단 시각 추가.
  if (s.schemaVersion === 16) {
    s = {
      ...s,
      schemaVersion: 17,
      visitBlockedUntil: s.visitBlockedUntil ?? null,
    };
  }
  // v17 → v18: 3차 나무(M15) — 발견 기록일 추가.
  if (s.schemaVersion === 17) {
    s = {
      ...s,
      schemaVersion: 18,
      lastTreeFindDate: s.lastTreeFindDate ?? null,
    };
  }
  // v18 → v19: 3차 페이싱 개편(M15b) — 동행일 가산 필드 추가.
  // 기존 심은 세이브는 동행일 0에서 시작 (경과일만큼은 이미 자라 있다)
  if (s.schemaVersion === 18) {
    s = {
      ...s,
      schemaVersion: 19,
      treeBondDays: s.treeBondDays ?? 0,
      lastTreeBondDate: s.lastTreeBondDate ?? null,
    };
  }
  // v19 → v20: 동행 보너스 하루 상한 — 오늘 획득분 추적 필드 추가.
  if (s.schemaVersion === 19) {
    s = {
      ...s,
      schemaVersion: 20,
      treeBondToday: s.treeBondToday ?? 0,
    };
  }
  // v20 → v21: M17 — (1) 기분 삭제(A안): mood는 사실상 변하지 않아 플레이 영향이
  // 없었다. 수치·델타·조건(minMood) 전부 제거. (2) pendingCrisis 단일 슬롯을
  // pendingCrises 큐로 — 기존 예약분은 배열로 승격(미발동 아크 보존).
  if (s.schemaVersion === 20) {
    const { mood: _mood, ...stats } = s.stats as GameState['stats'] & {
      mood?: number;
    };
    const legacy = (s as unknown as { pendingCrisis?: CrisisKind | null })
      .pendingCrisis;
    s = {
      ...s,
      schemaVersion: 21,
      stats,
      pendingCrises: s.pendingCrises ?? (legacy ? [legacy] : []),
    };
  }
  // v21 → v22: 애착 재설계(M18) — 함께 겪은 위기 수. 보장 아크 발동 기록으로 백필.
  if (s.schemaVersion === 21) {
    s = {
      ...s,
      schemaVersion: 22,
      crisesWeathered: s.crisesWeathered ?? s.crisisArcsFired.length,
      pendingApproach: s.pendingApproach ?? null,
    };
  }
  // v22 → v23: 휴식 씬 3방(개정 v5) — 마지막으로 본 방 저장.
  if (s.schemaVersion === 22) {
    s = {
      ...s,
      schemaVersion: 23,
      settings: { ...s.settings, lastRoom: s.settings.lastRoom ?? 'living' },
    };
  }
  // v23 → v24: 각성 강제 이벤트·자유행동 위임(플레이테스트 피드백) —
  // 포섀도 풀 개편(영수증 삭제)으로 저장된 인덱스가 어긋나므로 foreUsed 리셋
  if (s.schemaVersion === 23) {
    s = {
      ...s,
      schemaVersion: 24,
      awakeningPending: s.awakeningPending ?? false,
      delegate: null,
      foreUsed: [],
    };
  }
  if (s.schemaVersion !== SCHEMA_VERSION) return null;
  return s;
}
