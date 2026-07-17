/**
 * src/data/*.json 구조 파일 + 로케일 카탈로그의 타입 (스키마 v3).
 * 모든 텍스트 본문은 locales/<locale>.json 카탈로그에 있고 (textId → 변형×페이지),
 * 구조 파일은 로직 필드와 textId만 가진다. M4 검증 스크립트가 이 스키마 기준으로 검사한다.
 */
import type {
  ChoiceOptionData,
  Condition,
  ForeshadowEventData,
  NeedId,
  Outcome,
  TextId,
} from '../game/types';
import type { TextCatalog } from '../game/text';

// ── actions.json ──────────────────────────────────────────────
export interface ActionChoice {
  promptId: TextId;
  intimacy: number;
  options: ChoiceOptionData[];
}

export interface ActionData {
  id: string;
  nameId: TextId;
  /** 해금 조건 (없으면 항상). Outcome.unlockActions와 OR */
  unlock?: Condition;
  /** 새 게임의 시작 행동 (정확히 하나) — 배열 순서에 의존하지 않도록 명시 */
  starter?: boolean;
  /** 친밀도 태그 1~5 */
  intimacy: number;
  /** M2 씬 컴포넌트 매핑 */
  sceneId: string;
  captionId: TextId;
  startLineId: TextId;
  /** 관찰 로테이션 풀 — 카탈로그 변형 배열을 순서대로 순환 */
  ambientId: TextId;
  /** 세션 종료 시 적용 */
  outcome?: Outcome;
  choices: ActionChoice[];
}

// ── dialogues.json ────────────────────────────────────────────
export interface DialogueLine {
  textId: TextId;
  intimacy: number;
  /** 이 조건을 만족할 때만 후보 (없으면 항상). 예: 특정 소품을 언급하는 줄은 그 소품이 방에 있을 때만 */
  when?: Condition;
  choice?: { yesId: TextId; noId: TextId };
}

export interface CohabitStage {
  /** 이 의존도 이상이면 이 단계 풀 사용 (오름차순) */
  minDependence: number;
  lines: DialogueLine[];
}

export interface DialoguesData {
  stage1: DialogueLine[];
  stage2: DialogueLine[];
  stage3: DialogueLine[];
  stage4: DialogueLine[];
  stage5: DialogueLine[];
  /** 관계 대사 — 호감도 7티어(화자와의 관계 진행). 안정 상태에서만 등장. index 0 = 1티어 */
  relationTiers: DialogueLine[][];
  /** 상태 대사 — 애착 4분면 중 불안정(집착/회피/혼란) 전용 풀 */
  quadrants: {
    clingy: DialogueLine[];
    avoidant: DialogueLine[];
    chaotic: DialogueLine[];
  };
  /** 육성 — 잠수(부재) 중 휴식 대화: 돌 없는 방의 화자. 마일스톤·복선·단계 풀은 복귀 후로 미뤄진다 */
  absent: DialogueLine[];
  /** 동거 — 의존도 구간별 (깨달음 심화) */
  cohabitStages: CohabitStage[];
  /** apart — 돌이 놀러와 머무는 동안의 대화 */
  apartVisit: DialogueLine[];
  /** apart — 돌 없는 방, 회상할 추억도 없을 때의 폴백 */
  apart: DialogueLine[];
  absentReturn: { lineId: TextId; yesId: TextId; noId: TextId };
  /** apart — 방문이 끝나려 할 때: 붙잡기(죄책감)/보내주기.
   * holdResultId의 변형 인덱스 = 붙잡은 횟수 (붙잡을수록 무거워진다) */
  visitLeave: {
    promptId: TextId;
    holdLabelId: TextId;
    letGoLabelId: TextId;
    holdResultId: TextId;
    letGoResultId: TextId;
  };
}

// ── events.json ───────────────────────────────────────────────
export type MilestoneTrigger =
  | { type: 'firstAction'; action: string }
  | { type: 'stageUp'; level: number }
  | { type: 'totalHours'; hours: number }
  | { type: 'firstReturn' };

export interface MilestoneData {
  id: string;
  trigger: MilestoneTrigger;
  textId: TextId;
}

export interface ForeshadowData {
  lineId: TextId;
  event: ForeshadowEventData;
}

export interface EventsData {
  milestones: MilestoneData[];
  foreshadow: ForeshadowData[];
}

// ── shop.json ─────────────────────────────────────────────────
/** 소모품 랜덤 종류 — 세션 시작 시 하나가 뽑혀 대사·씬·보너스를 정한다 */
export interface ConsumableVariant {
  /** 종류 키 — 텍스트 id(shop.{item}.var.{key} / shop.{item}.use.{key})에 쓰임 */
  key: string;
  /** 종류별 게이지 보너스 (유의미~미미) */
  bonusNeeds?: Partial<Record<NeedId, number>>;
  /** 개인작업 소모품: 개인작업 성공 시 자아실현 추가 획득 */
  bonusSelfAct?: number;
}

export interface ShopItemData {
  id: string;
  nameId: TextId;
  price: number;
  descId: TextId;
  /** 해금 조건 (없으면 항상). Outcome.unlockItems와 OR */
  unlock?: Condition;
  /** 구매 시 적용 */
  outcome?: Outcome;
  /** 체인: 구매하려면 먼저 보유해야 하는 이전 티어 아이템 */
  requires?: string;
  /** 이 아이템이 강화하는 대상 — 행동 id 또는 'personalWork'(돌의 개인작업) */
  boosts?: string;
  /** (비소모품) 보유 시 대상 행동 세션마다 누적되는 게이지 보너스 */
  bonusNeeds?: Partial<Record<NeedId, number>>;
  /** (비소모품) 보유 시 개인작업 확률 가산 — boosts='personalWork' 전용 */
  bonusPersonalWork?: number;
  /** 소모품 정의 — 있으면 재고(0/1)로 반복 구매, 세션 1회 소모, 랜덤 종류 */
  consumable?: { variants: ConsumableVariant[] };
}

// ── reflections.json — 문맥형 반추 ────────────────────────────
/**
 * token = 기억 종류(actionId | buy-아이템 | choice)
 *  + 'personalWork' + 'default' + `selfCare-${NeedId}`.
 * 문맥(when: 현재 행동·시대·재석 등) 일치 변형 우선, 없으면 기본(when 없음).
 */
export interface ReflectionVariant {
  when?: Condition;
  textId: TextId;
}

export interface ReflectionDef {
  token: string;
  variants: ReflectionVariant[];
}

export type ReflectionsData = ReflectionDef[];

// ── restActs.json — 집중 세션이 끝난 뒤 휴식에서 1회 ─────────
export interface RestActData {
  key: string;
  labelId: TextId;
  /** 결과 서술 — 카탈로그 변형에서 추첨 */
  linesId: TextId;
  /** 돌이 없을 때(잠수/빈자리)의 부재 전용 결과 서술 */
  absentLinesId: TextId;
}

// ── timeMarks.json — 타이머 길이 문턱 발화 ────────────────────
export interface TimeMark {
  /** 이 경과 초를 넘으면 발화 (오름차순) */
  minSec: number;
  textId: TextId;
}

export interface TimeMarksData {
  /** 집중 경과 시간 문턱 — 세션당 문턱별 1회 */
  focus: TimeMark[];
  /** 휴식 길이 문턱 — 배정된 휴식 길이 기준, 진입 시 1회 */
  rest: TimeMark[];
}

// ── endings.json ──────────────────────────────────────────────
/**
 * 엔딩 전 대화 — 일반 DialogueLine과 달리 intimacy가 없다:
 * 엔딩 시퀀스는 의도적으로 안정감/잠수 판정을 우회한다 (시퀀스 보호).
 */
export interface EndingTalk {
  textId: TextId;
  choice?: { yesId: TextId; noId: TextId };
}

export interface EndingsData {
  /** 자아실현 완성 후, 엔딩 이벤트 전에 휴식 대화 슬롯에서 순차 소진 */
  preEndingTalks: EndingTalk[];
  endingEvent: {
    textId: TextId;
    stayLabelId: TextId;
    farewellLabelId: TextId;
  };
  farewellEpilogueId: TextId;
  cohabitTransitionId: TextId;
  farewellFromCohabitId: TextId; // {hours}
}

// ── 통합 ──────────────────────────────────────────────────────
export interface GameData {
  actions: ActionData[];
  dialogues: DialoguesData;
  events: EventsData;
  shop: ShopItemData[];
  reflections: ReflectionsData;
  restActs: RestActData[];
  timeMarks: TimeMarksData;
  endings: EndingsData;
  /** 현재 로케일로 해석된 텍스트 카탈로그 */
  text: TextCatalog;
}
