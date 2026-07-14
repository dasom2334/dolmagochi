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
  stats?: { mood?: number; affection?: number; security?: number };
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
  /** 안정감 0–100 (숨은 값) */
  security: number;
  /** 자아실현 게이지 0–100 → 엔딩 트리거 */
  selfActualization: number;
  /** 의존도 0–100 — 동거에서만 상승, 돌의 자립을 갉아먹는다 */
  dependence: number;
}

export interface PresenceState {
  state: Presence;
  /** 잠수 예정 길이 1–3 세션 */
  plannedSessions: number;
  /** 저친밀 행동 세션 복귀 누적 */
  lowIntimacyProgress: number;
  /** 이번 휴식에 복귀 대화를 걸어야 함 */
  returnPending: boolean;
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
  };
  rest: {
    endsAt: number;
    totalSec: number;
    talkPressed: boolean;
    talkState: TalkState | null;
    /** 작은 행동 — 휴식당 1회 */
    actUsed: boolean;
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
  care: { points: number; carryMinutes: number };
  /** 구매 물품 — 배치 여부 분리 */
  items: Record<ItemId, { placed: boolean }>;
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
  settings: { noiseOn: boolean; notifAsked: boolean; locale: string };
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
  | { type: 'REST_END' }
  | { type: 'CHOOSE_FAREWELL' }
  | { type: 'CHOOSE_COHABIT' }
  | { type: 'FAREWELL_FROM_COHABIT' }
  | { type: 'EPILOGUE_DONE' };
