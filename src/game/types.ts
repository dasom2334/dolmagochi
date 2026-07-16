/** 도메인 타입 전체 (스키마 v2). 게임 텍스트는 전부 src/data/*.json에서 온다. */

export type ActionId = string;
export type ItemId = string;

export type Phase = 'actionSelect' | 'focus' | 'rest' | 'ending' | 'epilogue';
export type RestStep = 'journal' | 'talk' | 'select' | 'shop';
export type Era = 'raising' | 'cohabit' | 'apart';
export type Presence = 'present' | 'absent';

/** 명명된 욕구 게이지 (자아실현은 별도 게이지) — 순서가 매슬로 단계 */
export type NeedId = 'physiological' | 'safety' | 'belonging' | 'esteem';
export const NEED_ORDER: readonly NeedId[] = [
  'physiological',
  'safety',
  'belonging',
  'esteem',
];

// ── 조건/결과 공통 타입 (데이터 스키마와 로직이 공유) ──────────

/** 카탈로그 텍스트 참조 id — 본문은 locales/<locale>.json (변형×페이지) */
export type TextId = string;

/** 결과 분기·해금 조건: 명시된 필드를 전부 만족해야 통과 */
export interface Condition {
  /** 전부 보유해야 하는 트리거 플래그 */
  flags?: string[];
  /** 하나도 보유하면 안 되는 플래그 */
  notFlags?: string[];
  /** 현재 세션의 행동 (문맥형 반추 등) */
  action?: ActionId;
  /** 이 행동들에서는 통과하지 않음 (예: 산책 약속 포섀도는 산책 중 부적합) */
  notActions?: ActionId[];
  minNeeds?: Partial<Record<NeedId, number>>;
  minSecurity?: number;
  minMood?: number;
  minAffection?: number;
  /** 파생 욕구 단계 (needsLevelOf) */
  minLevel?: number;
  /** 보유(배치 무관) / 배치된 물품 */
  ownedItems?: ItemId[];
  placedItems?: ItemId[];
  /** 함께 보낸 누적 집중 시간 */
  minTotalHours?: number;
  era?: Era;
  presence?: Presence;
}

/** 상태에 남기는 영향 — 선택지·행동완료·구매가 공유하는 명시적 타입 */
export interface Outcome {
  stats?: {
    mood?: number;
    affection?: number;
    security?: number;
    /** 애착 2축 태그 (대사·선택지가 명시적으로 조절) */
    abandonment?: number;
    intimacyThreat?: number;
  };
  needs?: Partial<Record<NeedId, number>>;
  selfActualization?: number;
  /** 기억 토큰 적립 */
  memory?: { k: string; w: number }[];
  /** 트리거 플래그 설정 */
  flags?: string[];
  unlockActions?: ActionId[];
  unlockItems?: ItemId[];
}

/** 추억 기록 — apart 시대 회상에서 reveal이 처음 드러난다 */
export interface RemembranceData {
  id: string;
  summaryId: TextId;
  revealId: TextId;
}

/** 선택지 옵션의 결과 후보: 조건 필터 → 가중 추첨 */
export interface ChoiceOutcomeData {
  when?: Condition;
  /** 가중치 (기본 1) */
  weight?: number;
  resultId: TextId;
  outcome?: Outcome;
  remembrance?: RemembranceData;
}

export interface ChoiceOptionData {
  labelId: TextId;
  intimacy: number;
  outcomes: ChoiceOutcomeData[];
}

/** 포섀도(대화 복선)로 예약되는 세션 이벤트 */
export interface ForeshadowEventData {
  promptId: TextId;
  /** 이 조건을 만족하는 세션에서만 등장 (없으면 항상). 예약·발화 시점 모두에서 검사 */
  when?: Condition;
  options: ChoiceOptionData[];
}

// ── 런타임 상태 ───────────────────────────────────────────────

export interface JournalEntry {
  /** 세션 경과 표시용 "MM:SS" 또는 "H:MM:SS" */
  t: string;
  text: string;
}

/** 집중 중 화면에 떠 있는 조용한 선택지 */
export interface ChoiceState {
  source: 'action' | 'foreshadow';
  /** source='action'일 때 actions.json choices 인덱스 */
  index: number;
  shownAtSec: number;
}

/** 휴식 대화 카드 상태 — pages: 배열 원소 = 페이지, 페이지 안 \n = 줄바꿈 */
export interface TalkState {
  kind: 'pool' | 'foreshadow' | 'return' | 'milestone' | 'ending' | 'recall';
  pages: string[];
  hasChoice: boolean;
  done: boolean;
  yesId?: TextId;
  noId?: TextId;
}

/**
 * 기억 항목 — 종류별 단일 항목. 반복 경험 = 강화(+w),
 * 추출 시 감쇠하되 바닥값 밑으로 내려가지 않는다. 절대 소멸하지 않는다.
 */
export interface MemoryEntry {
  w: number;
  count: number;
  lastAt: number;
}

export interface Stats {
  /** 0–100 단기값. 달력일 감쇠 */
  mood: number;
  /** 장기 누적값 */
  affection: number;
  /** 명명된 욕구 게이지 0–100 */
  needs: Record<NeedId, number>;
  /** 유기불안 0–100 (숨은 값, 애착 2축) */
  abandonment: number;
  /** 친밀위협 0–100 (숨은 값, 애착 2축) */
  intimacyThreat: number;
  /** 안정감 0–100 — 두 애착 축의 파생 캐시 (= 100 − |유기불안−친밀위협|) */
  security: number;
  /** 자아실현 게이지 0–100 → 엔딩 트리거 */
  selfActualization: number;
  /** 의존도 0–100 — 동거에서만 상승, 돌의 자립을 갉아먹는다 */
  dependence: number;
}

export interface PresenceState {
  state: Presence;
  /** (구) 잠수 예정 길이 — 항상성 복귀 도입 후 미사용, 스키마 호환용 */
  plannedSessions: number;
  /** (구) 저친밀 복귀 누적 — 항상성 복귀 도입 후 미사용, 스키마 호환용 */
  lowIntimacyProgress: number;
  /** 이번 휴식에 복귀 대화를 걸어야 함 */
  returnPending: boolean;
  /** 병간호 상태 — 재석하되 유기불안 과다로 아파, '병간호하기'만 가능 */
  sick: boolean;
}

/** 발생한 추억 기록 (영구) */
export interface Remembrance extends RemembranceData {
  at: number;
}

/** apart 시대: 돌의 방문 상태 */
export interface ApartState {
  visiting: boolean;
  visitSessionsLeft: number;
  /** 방문 기간이 다해 떠나려는 기색 — 휴식 중 붙잡기/보내주기 선택 대기 */
  leavePending: boolean;
  /** 붙잡은 횟수 — 붙잡을수록 문구가 무거워진다 */
  holdCount: number;
}

export interface GameState {
  schemaVersion: number;
  era: Era;
  phase: Phase;
  restStep: RestStep;
  selectedAction: ActionId;
  session: {
    elapsedSec: number;
    paused: boolean;
    choicesFired: number;
    choiceState: ChoiceState | null;
    journal: JournalEntry[];
    ambIdx: number;
    /** 화자 서술 현재 줄 (UI 노출용, 텍스트는 데이터 경유) */
    narratorLine: string;
    /** 마지막 반추 추출 시점(초) */
    lastReflectAtSec: number;
    /** 이번 집중에서 발화된 시간 문턱 인덱스 (timeMarks.focus) */
    timeMarksFired: number[];
    /** 이번 세션에 소모된 소모품과 뽑힌 랜덤 종류 (씬·대사·보너스용) */
    supply: { itemId: ItemId; variant: string } | null;
    /** 자유행동 자가충족이 발동한 욕구 — END_FOCUS에서 시간 정산 (서술은 계속 흐른다) */
    freeCare: NeedId | null;
    /** 자가충족을 수행한 행동 id — END_FOCUS에서 기억 약강화 (개정 v4-6) */
    freeCareVia: string | null;
    /** 자유행동 개인작업 발동 여부 — 개정 v4-3부터 END_FOCUS 판정 결과 기록 */
    freeWorked: boolean;
    /** 직전 휴식 준수 배율 (개정 v4-4) — 이번 세션 게이지 정산에 곱한다. 정성 제외 */
    restMult: number;
  };
  rest: {
    endsAt: number;
    totalSec: number;
    talkPressed: boolean;
    talkState: TalkState | null;
    /** 작은 행동 — 휴식당 1회 */
    actUsed: boolean;
    /** 이번 휴식의 소모품 진열 종류 — 휴식 진입 시 1회 추첨, 구매 시 이 종류로 고정 */
    offers: Record<ItemId, string>;
    /** 휴식 일지 요약용 */
    summary: { mins: number; earned: number };
  };
  stats: Stats;
  presence: PresenceState;
  /** apart 시대: 돌의 방문 (며칠 머물다 감) */
  apart: ApartState;
  /** 종류별 기억 항목 — 소멸하지 않는다 */
  memory: Record<string, MemoryEntry>;
  remembrances: Remembrance[];
  /** 회상에서 이미 드러낸 추억 id (비복원, 소진 시 리셋) */
  remembrancesRecalled: string[];
  dialogue: { usedByPool: Record<string, number[]> };
  pendingEvent: ForeshadowEventData | null;
  foreUsed: number[];
  /** 엔딩 전 대화 소진 수 */
  endingTalksSeen: number;
  /** 엔딩 전 대화를 소진한 마지막 달력일 — 하루 1개 게이트 (개정 v4-7) */
  lastEndingTalkDate: string | null;
  /** 확정 관계 티어 (1~7) — 승급은 하루 1회, 임계 초과분은 이월 (개정 v4-7) */
  relationTier: number;
  /** 티어 승급이 일어난 마지막 달력일 */
  lastTierUpDate: string | null;
  /** 예약된 위기 아크 — 티어 승급이 잡고, 다음 세션 경계에서 발동 (개정 v4-8) */
  pendingCrisis: 'retreat' | 'sick' | null;
  /** 이미 발동한 보장 위기 아크 (retreat/sick — 게임당 1회) */
  crisisArcsFired: string[];
  care: { points: number; carryMinutes: number };
  /** 구매 물품 — 배치 여부 분리 */
  items: Record<ItemId, { placed: boolean }>;
  /** 소모품 재고 (0/1) — 세션 1회 소모, 다음 휴식 때 재구매 */
  supplies: Record<ItemId, number>;
  /** 재고의 확정 종류 — 구매 시 진열 종류가 고정된다 (소모 시 이 종류 사용) */
  supplyVariants: Record<ItemId, string>;
  /** 방금 구매해 배치/보관 선택 대기 중인 물품 */
  pendingPlacement: ItemId | null;
  /** 트리거 플래그 */
  flags: string[];
  /** Outcome으로 해금된 행동/물품 (unlock 조건과 OR) */
  unlockedActions: ActionId[];
  unlockedItems: ItemId[];
  milestonesFired: string[];
  totals: { focusSeconds: number; sessions: number };
  lastSessionEndAt: number | null;
  /** 마지막 정산 달력일 "YYYY-MM-DD" */
  lastDecayDate: string;
  settings: {
    noiseOn: boolean;
    /** 소리풍경 레이어별 음소거 (M9) — LayerId 목록. 마스터는 noiseOn. */
    noiseMuted: string[];
    notifAsked: boolean;
    locale: string;
    /** 알림 설정. enabled=전체 스위치, 나머지는 개별. 포그라운드=토스트 / 백그라운드=OS 알림. */
    notify: NotifySettings;
    /** Flowtime 휴식 배정표 — 사용자가 수정 가능. 기본값은 기획서 규칙(<25→5·25~50→10·50~90→20·90+→30). */
    flowtime: FlowtimeSettings;
    /** 탭 이탈 시 집중 타이머 일시정지(기획서 기본 동작). false면 탭을 옮겨도 집중 시간이 계속 흐른다. */
    pauseOnHide: boolean;
    /** UI 효과음(클릭·토글·집중 시작·휴식 종료 등) on/off. */
    soundOn: boolean;
  };
}

export interface NotifySettings {
  enabled: boolean;
  restEnd: boolean;
  /** 집중 구간 알림 — Flowtime 경계(flowtime.bounds)와 1:1. index i = bounds[i]분에서 알림 여부. */
  focusMarks: boolean[];
}

/**
 * Flowtime 휴식 배정: 집중 분에 따라 휴식 분을 정한다.
 * bounds = 오름차순 구간 경계(분) N개, rests = 구간별 휴식(분) N+1개.
 * focusMin < bounds[i] 인 첫 i의 rests[i], 아니면 마지막 rests.
 */
export interface FlowtimeSettings {
  bounds: number[];
  rests: number[];
}

export type GameEvent =
  | { type: 'SETTLE'; nowMs: number }
  | { type: 'SELECT_ACTION'; actionId: ActionId }
  | { type: 'START_FOCUS'; nowMs: number }
  | { type: 'TICK'; dtSec: number }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'CHOICE_PICKED'; optionIndex: number; nowMs: number }
  | { type: 'END_FOCUS'; nowMs: number }
  | { type: 'REST_STEP'; step: RestStep }
  | { type: 'REST_ACT'; key: string }
  | { type: 'TALK' }
  | { type: 'TALK_CHOICE'; yes: boolean }
  | { type: 'BUY'; itemId: ItemId; nowMs: number }
  | { type: 'SET_PLACEMENT'; itemId: ItemId; placed: boolean }
  | { type: 'VISIT_HOLD'; hold: boolean }
  | { type: 'SET_NOISE'; on: boolean }
  | { type: 'SET_NOISE_LAYER'; layer: string; muted: boolean }
  | { type: 'SET_NOTIFY'; key: 'enabled' | 'restEnd'; on: boolean }
  | { type: 'SET_FOCUS_NOTIFY'; index: number; on: boolean }
  | { type: 'SET_FLOWTIME'; flowtime: FlowtimeSettings }
  | { type: 'SET_PAUSE_ON_HIDE'; on: boolean }
  | { type: 'SET_SOUND'; on: boolean }
  | { type: 'MARK_NOTIF_ASKED' }
  | { type: 'REST_END' }
  | { type: 'CHOOSE_FAREWELL' }
  | { type: 'CHOOSE_COHABIT' }
  | { type: 'FAREWELL_FROM_COHABIT' }
  | { type: 'EPILOGUE_DONE' };
