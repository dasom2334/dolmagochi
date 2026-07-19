/** 도메인 타입 전체 (스키마 v2). 게임 텍스트는 전부 src/data/*.json에서 온다. */

export type ActionId = string;
export type ItemId = string;

export type Phase = 'actionSelect' | 'focus' | 'rest' | 'ending' | 'epilogue';
export type RestStep = 'journal' | 'talk' | 'select' | 'shop';
export type Era = 'raising' | 'cohabit' | 'apart';
/** 보장 위기 아크 종류 (개정 v4-8) — 잠수(3티어)·성장통 병간호(5티어) */
export type CrisisKind = 'retreat' | 'sick';
export type Presence = 'present' | 'absent';
/** 날씨 (M12) — 게이지 무영향(개정 v4-13): 연출·소리·대사 조건만.
 * petals(꽃잎비)=봄, leaves(낙엽비)=가을, snow=겨울 — 계절 의존은 WEATHER_BY_SEASON */
export type WeatherKind = 'clear' | 'rain' | 'downpour' | 'snow' | 'petals' | 'leaves';
/** 계절 (M12) — 기본은 기기 날짜 자동, 설정으로 고정 가능 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** 시간대 (M12) — 씬·소리 축. UI 테마(M10)와 완전 독립 (B23) */
export type TimeOfDay = 'day' | 'twilight' | 'night';

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
  /** 전부 기억(memory)에 있어야 하는 토큰 — 돌이 실제 겪은 일에만 반응하는 줄 */
  hasTokens?: string[];
  minNeeds?: Partial<Record<NeedId, number>>;
  minSecurity?: number;
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
  kind: 'pool' | 'foreshadow' | 'return' | 'milestone' | 'ending' | 'recall' | 'planting' | 'farewell2' | 'rooting';
  pages: string[];
  hasChoice: boolean;
  done: boolean;
  yesId?: TextId;
  noId?: TextId;
  /** 답에 따른 상태 영향 (M19c 위기 대응) — TALK_CHOICE가 적용한다 */
  yesOutcome?: Outcome;
  noOutcome?: Outcome;
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
  /** 선택지 유래 추억: 그때 고른 선택지 라벨 (M11a — 도감·회상에서 재생) */
  pickedLabelId?: TextId;
  /** 선택지 유래 추억: 그때 돌의 반응(결과) 텍스트 */
  resultId?: TextId;
}

/** apart 시대: 돌의 방문 상태 */
export interface ApartState {
  visiting: boolean;
  visitSessionsLeft: number;
  /** 방문 기간이 다해 떠나려는 기색 — 휴식 중 붙잡기/보내주기 선택 대기 */
  leavePending: boolean;
  /** 붙잡은 횟수 — 붙잡을수록 문구가 무거워진다 */
  holdCount: number;
  /** 붙잡기로 연장된 체류인가 (M14) — 임시 동거: 의존도↑·묘목 시듦 */
  held: boolean;
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
    /** 이번 세션에 추억 순간이 이미 발동했는가 (세션당 1회, M11a) */
    momentFired: boolean;
    /** 이번 산책에 우산을 썼는가 (M12) */
    umbrella: boolean;
    /** 야외에서 젖음/눈쌓임 — 다음 세션 시작에 사라진다 (M12, 연출·서술만) */
    wetness: 'wet' | 'snowy' | null;
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
  /** 예약된 보장 위기 아크 큐 (선입선출) — 티어 승급이 잡고, 다음 세션 경계에서
   * 발동 (개정 v4-8). 단일 슬롯이던 것을 큐로 (M17): 3티어 잠수가 발동 전에
   * 5티어 승급을 만나도 덮이지 않고 둘 다 남는다 */
  pendingCrises: CrisisKind[];
  /** 이미 발동한 보장 위기 아크 (retreat/sick — 게임당 1회) */
  crisisArcsFired: string[];
  /** 함께 겪은 위기 총수 (보장+유기, M18) — 많을수록 축 변동이 무뎌진다 */
  crisesWeathered: number;
  /** 목격한 급성 애착 4분면 (도감 재료, M11a) */
  quadrantsSeen: string[];
  /** 도감 뱃지 획득 기록 — 최초 충족 시각 (M11a). 숫자는 UI 비노출 */
  badges: Record<string, { at: number }>;
  // ── 2차 독립기 (M14) — 붙잡기 스펙트럼·묘목 성장. 수치는 전부 비노출 ──
  /** 묘목 성장 0–100 — 돌의 자아실현 재가동의 가시화 (개정 v4 §5) */
  sproutGrowth: number;
  /** 묘목 시듦 0–3 (연속값) — 붙잡을수록 시들고, 놓아주면 회복 */
  witherLevel: number;
  /** 방문 온 돌을 보내준 횟수 — 2차 게이트 재료 */
  letGoCount: number;
  /** 개화(성장 66+) 목격 — 2차 게이트 재료 */
  bloomSeen: boolean;
  /** 동거 균형 애착 달성 목격 — 동거 루트 2차 게이트 재료 */
  balancedSeen: boolean;
  /** 심기 이벤트 완료 — 3차(나무) 시작점 */
  planted: boolean;
  plantedAt: number | null;
  /** 동거: 친밀위협 급성 연속 세션 수 — 임계 도달 시 제2의 이별 */
  highThreatStreak: number;
  /** apart 제2의 이별 후 방문 차단 시각 (ms) — 그때까지 돌이 오지 않는다 */
  visitBlockedUntil: number | null;
  /** 3차: 나무 발견을 기록한 마지막 달력일 — 하루 1개 (M15) */
  lastTreeFindDate: string | null;
  /** 3차: 동행 보너스 누계(나무일 가산분) — 출석 + 세션 시간 비례 (M15b) */
  treeBondDays: number;
  /** 동행 보너스를 센 마지막 달력일 */
  lastTreeBondDate: string | null;
  /** 오늘 얻은 동행 보너스 — 하루 상한(TREE_BOND_DAILY_MAX) 판정용 */
  treeBondToday: number;
  /** 현재 날씨 (M12) — 자연 변화는 달력일당 1회, 정성 지불로 즉시 변경 */
  weather: WeatherKind;
  /** 자연 날씨 추첨을 마친 달력일 */
  lastWeatherDate: string | null;
  /** 우산 선택 대기 (M12) — 비 오는 산책 + 우산 보유 시 START_FOCUS가 세운다 */
  pendingUmbrella: boolean;
  /** 우산 대기로 넘어갈 때 보존하는 세션 포크 선택 (M18) */
  pendingApproach: 'near' | 'apart' | null;
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
    /** UI 테마 (M10) — 도트 씬은 영향받지 않는다(B23). auto = prefers-color-scheme */
    theme: 'auto' | 'light' | 'dark';
    /** 시간대 (M12) — auto = 실시간, 그 외 고정 */
    timeOfDay: 'auto' | TimeOfDay;
    /** 계절 (M12) — auto = 기기 날짜, 그 외 고정. 날씨 가용성이 계절에 의존한다 */
    season: 'auto' | Season;
    /** 마지막으로 본 휴식 방 (개정 v5) — 페이저가 기억한다. 기본 living */
    lastRoom: string;
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
  | {
      type: 'START_FOCUS';
      nowMs: number;
      umbrella?: boolean;
      /** 세션 포크 (M18, 개막 후): 곁에서(near) / 한 발 떨어져(apart) */
      approach?: 'near' | 'apart';
    }
  | { type: 'TICK'; dtSec: number }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'CHOICE_PICKED'; optionIndex: number; nowMs: number }
  | { type: 'END_FOCUS'; nowMs: number }
  | { type: 'REST_STEP'; step: RestStep }
  | { type: 'REST_ACT'; key: string }
  | { type: 'TALK' }
  | { type: 'TALK_CHOICE'; yes: boolean; nowMs?: number }
  | { type: 'BUY'; itemId: ItemId; nowMs: number }
  | { type: 'SET_PLACEMENT'; itemId: ItemId; placed: boolean }
  | { type: 'VISIT_HOLD'; hold: boolean }
  | { type: 'SET_NOISE'; on: boolean }
  | { type: 'SET_NOISE_LAYER'; layer: string; muted: boolean }
  | { type: 'SET_THEME'; theme: 'auto' | 'light' | 'dark' }
  | { type: 'SET_WEATHER'; weather: WeatherKind; nowMs: number }
  | { type: 'SET_TIME_OF_DAY'; mode: 'auto' | TimeOfDay }
  | { type: 'SET_SEASON'; mode: 'auto' | Season; nowMs: number }
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
