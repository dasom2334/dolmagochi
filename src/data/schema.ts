/**
 * src/data/*.json 구조 파일 + 로케일 카탈로그의 타입 (스키마 v3).
 * 모든 텍스트 본문은 locales/<locale>.json 카탈로그에 있고 (textId → 변형×페이지),
 * 구조 파일은 로직 필드와 textId만 가진다. M4 검증 스크립트가 이 스키마 기준으로 검사한다.
 */
import type {
  ChoiceOptionData,
  Condition,
  ForeshadowEventData,
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
export interface ShopItemData {
  id: string;
  nameId: TextId;
  price: number;
  descId: TextId;
  /** 해금 조건 (없으면 항상). Outcome.unlockItems와 OR */
  unlock?: Condition;
  /** 구매 시 적용 */
  outcome?: Outcome;
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
}

// ── endings.json ──────────────────────────────────────────────
export interface EndingsData {
  /** 자아실현 완성 후, 엔딩 이벤트 전에 휴식 대화 슬롯에서 순차 소진 */
  preEndingTalks: DialogueLine[];
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
  endings: EndingsData;
  /** 현재 로케일로 해석된 텍스트 카탈로그 */
  text: TextCatalog;
}
