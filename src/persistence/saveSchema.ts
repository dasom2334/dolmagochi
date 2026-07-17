import type { GameState, NotifySettings } from '../game/types';
import { SCHEMA_VERSION } from '../game/stateMachine';
import { normalizeFlowtime } from '../game/timer';
import { BALANCE } from '../game/balance';
import { derivedSecurity } from '../game/security';
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
  let state = raw.state;
  if (state.schemaVersion !== SCHEMA_VERSION) {
    const migrated = migrateState(state);
    if (!migrated) return { ok: false, reason: 'version' };
    state = migrated;
  }
  // Flowtime 배정표는 로드/임포트 경로에서도 반드시 정규화 — 깨진 표(NaN 휴식)로
  // restMinutesFor가 undefined를 내 휴식이 안 끝나는 것을 막는다.
  return { ok: true, state: normalizeState(state) };
}

/**
 * 로드/임포트 후 안전 정규화 — 깨진 세이브가 런타임에서 크래시하지 않도록.
 * flowtime은 배정표 정합화, notify는 유효한 NotifySettings로 보정(focusMarks는 경계 개수만큼).
 */
/** 유한 숫자면 그대로, 아니면 기본값 */
function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isRecordSafe(v: unknown): v is Record<string, { at: number }> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeState(state: GameState): GameState {
  const flowtime = normalizeFlowtime(state.settings.flowtime);
  // 애착 2축 방어 — 누락/NaN이면 기본값으로, 안정감은 재계산(NaN 전파 차단)
  const abandonment = finiteOr(state.stats?.abandonment, BALANCE.ABANDONMENT_START);
  const intimacyThreat = finiteOr(
    state.stats?.intimacyThreat,
    BALANCE.INTIMACY_THREAT_START,
  );
  return {
    ...state,
    stats: {
      ...state.stats,
      abandonment,
      intimacyThreat,
      security: derivedSecurity(abandonment, intimacyThreat),
    },
    // 자유행동 정산 필드 방어 — 구 세이브(집중 중 저장)엔 없을 수 있다
    session: {
      ...state.session,
      freeCare: state.session?.freeCare ?? null,
      freeCareVia: state.session?.freeCareVia ?? null,
      freeWorked: state.session?.freeWorked === true,
      restMult: finiteOr(state.session?.restMult, 1),
    },
    // 2차 독립기 필드 방어 (M14)
    sproutGrowth: finiteOr(state.sproutGrowth, 0),
    witherLevel: finiteOr(state.witherLevel, 0),
    letGoCount: finiteOr(state.letGoCount, 0),
    bloomSeen: state.bloomSeen === true,
    balancedSeen: state.balancedSeen === true,
    planted: state.planted === true,
    plantedAt: typeof state.plantedAt === 'number' ? state.plantedAt : null,
    highThreatStreak: finiteOr(state.highThreatStreak, 0),
    apart: { ...state.apart, held: state.apart?.held === true },
    // 날씨 필드 방어 (M12)
    weather: (['clear', 'rain', 'downpour', 'snow'] as const).includes(state.weather)
      ? state.weather
      : 'clear',
    lastWeatherDate: state.lastWeatherDate ?? null,
    pendingUmbrella: state.pendingUmbrella === true,
    // 도감 필드 방어 (M11a)
    badges: isRecordSafe(state.badges) ? state.badges : {},
    quadrantsSeen: Array.isArray(state.quadrantsSeen) ? state.quadrantsSeen : [],
    // 개정 v4 필드 방어 — 구 세이브 백필
    relationTier: finiteOr(state.relationTier, 1),
    lastTierUpDate: state.lastTierUpDate ?? null,
    lastEndingTalkDate: state.lastEndingTalkDate ?? null,
    pendingCrisis: state.pendingCrisis ?? null,
    crisisArcsFired: Array.isArray(state.crisisArcsFired)
      ? state.crisisArcsFired
      : [],
    // 소모품 진열/종류 필드 방어 — 구 v10 세이브 백필
    rest: { ...state.rest, offers: state.rest?.offers ?? {} },
    supplyVariants: state.supplyVariants ?? {},
    // 병간호 필드 방어 — 구 v9 세이브엔 없을 수 있어 기본값을 채운다(크래시 방지)
    presence: {
      ...state.presence,
      sick: typeof state.presence?.sick === 'boolean' ? state.presence.sick : false,
    },
    settings: {
      ...state.settings,
      flowtime,
      notify: normalizeNotify(state.settings.notify, flowtime.bounds.length),
      // 소리풍경 음소거 목록 방어 (M9) — 손상 세이브가 배열이 아니면 초기화
      noiseMuted: Array.isArray(state.settings.noiseMuted)
        ? state.settings.noiseMuted.filter((l): l is string => typeof l === 'string')
        : [],
      // 테마 방어 (M10) — 알 수 없는 값은 자동으로
      theme: (['auto', 'light', 'dark'] as const).includes(state.settings.theme)
        ? state.settings.theme
        : 'auto',
    },
  };
}

function normalizeNotify(input: unknown, boundCount: number): NotifySettings {
  const o = input as Partial<NotifySettings> | null | undefined;
  const src = Array.isArray(o?.focusMarks) ? o.focusMarks : [];
  return {
    enabled: typeof o?.enabled === 'boolean' ? o.enabled : true,
    restEnd: typeof o?.restEnd === 'boolean' ? o.restEnd : true,
    focusMarks: Array.from({ length: boundCount }, (_, i) => Boolean(src[i])),
  };
}
