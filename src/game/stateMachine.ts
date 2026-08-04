import { BALANCE } from './balance';
import type {
  ActionId,
  ChoiceOptionData,
  CrisisKind,
  GameEvent,
  GameState,
  JournalEntry,
  NeedId,
  Remembrance,
  TalkState,
} from './types';
import type { Rng } from './rng';
import type {
  ActionData,
  DialogueLine,
  GameData,
  MilestoneData,
  ShopItemData,
} from '../data/schema';
import {
  accrueCare,
  cloneFlowtime,
  DEFAULT_FLOWTIME,
  formatElapsed,
  normalizeFlowtime,
  restMinutesFor,
} from './timer';
import { drawMemory, remember, resolveReflection } from './memory';
import { affectionTier, drawEligibleLine, selectDialoguePool } from './dialogue';
import { careTargetNeed, personalWorkProb, pickFreeAction } from './freeAction';
import {
  applyNeedsGated,
  clampStat,
  dateKey,
  decayNeeds,
  firstUnfilledNeed,
  initialStats,
  needsLevelOf,
  settleCalendar,
} from './stats';
import {
  acuteQuadrant,
  attachQuadrant,
  attachRate,
  convergeStep,
  derivedSecurity,
  intimacyOutcome,
  isBalanced,
} from './security';
import { presentState, startAbsence } from './absence';
import { resolveSeason, resolveTimeOfDay } from './timeOfDay';
import { deriveLayers } from '../audio/layers';
import { companionMet, treeStage } from './tree';
import { pickMoment, settleBadges } from './badges';
import {
  applyOutcome,
  checkCondition,
  pickChoiceOutcome,
  recordRemembrance,
} from './outcomes';
import { randInt } from './rng';
import {
  fillPages,
  nightVariant,
  pickFor,
  pickText,
  resolveSlot,
  textVariantAt,
  SYS,
} from './text';
import type { Company } from './text';

export interface TransitionCtx {
  rng: Rng;
  data: GameData;
}

export const SCHEMA_VERSION = 28;

/**
 * 알림 설정 기본값. 집중 구간 알림(25/50/90)은 기본 off — 사용자가 설정에서 켠다.
 * 전체·휴식 종료 알림은 기본 on.
 */
export const DEFAULT_NOTIFY_SETTINGS: GameState['settings']['notify'] = {
  enabled: true,
  restEnd: true,
  // 기본 Flowtime 경계 개수에 맞춰 — 전부 off (경계 수가 바뀌어도 자동 정합)
  focusMarks: Array.from({ length: DEFAULT_FLOWTIME.bounds.length }, () => false),
};

export function createInitialState(
  nowMs: number,
  defaultAction: ActionId,
): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    era: 'raising',
    phase: 'actionSelect',
    restStep: 'journal',
    selectedAction: defaultAction,
    session: emptySession(),
    rest: {
      endsAt: 0,
      totalSec: 0,
      talkPressed: false,
      talkState: null,
      actUsed: false,
      offers: {},
      summary: { mins: 0, earned: 0 },
    },
    stats: initialStats(),
    presence: presentState(),
    apart: {
      visiting: false,
      visitSessionsLeft: 0,
      leavePending: false,
      holdCount: 0,
      held: false,
    },
    memory: {},
    remembrances: [],
    remembrancesRecalled: [],
    dialogue: { usedByPool: {} },
    pendingEvent: null,
    foreUsed: [],
    recentChoices: [],
    awakeningPending: false,
    sproutGatesCleared: 0,
    delegate: null,
    endingTalksSeen: 0,
    lastEndingTalkDate: null,
    relationTier: 1,
    lastTierUpDate: null,
    pendingCrises: [],
    crisesWeathered: 0,
    crisisArcsFired: [],
    quadrantsSeen: [],
    badges: {},
    sproutGrowth: 0,
    witherLevel: 0,
    letGoCount: 0,
    bloomSeen: false,
    balancedSeen: false,
    planted: false,
    plantedAt: null,
    highThreatStreak: 0,
    visitBlockedUntil: null,
    lastTreeFindDate: null,
    treeBondDays: 0,
    lastTreeBondDate: null,
    treeBondToday: 0,
    weather: 'clear',
    lastWeatherDate: null,
    pendingUmbrella: false,
    pendingApproach: null,
    care: { points: 0, carryMinutes: 0 },
    items: {},
    supplies: {},
    supplyVariants: {},
    pendingPlacement: null,
    flags: [],
    unlockedActions: [],
    unlockedItems: [],
    milestonesFired: [],
    totals: { focusSeconds: 0, sessions: 0 },
    lastSessionEndAt: null,
    lastDecayDate: dateKey(nowMs),
    settings: {
      noiseOn: false,
      noiseMuted: [],
      noiseCustom: [],
      noiseMode: 'auto',
      theme: 'auto',
      timeOfDay: 'auto',
      season: 'auto',
      lastRoom: 'living',
      notifAsked: false,
      locale: 'ko',
      notify: { ...DEFAULT_NOTIFY_SETTINGS },
      flowtime: cloneFlowtime(),
      pauseOnHide: true,
      soundOn: true,
    },
  };
}

function emptySession(): GameState['session'] {
  return {
    elapsedSec: 0,
    paused: false,
    choicesFired: 0,
    choiceState: null,
    journal: [],
    ambIdx: 0,
    narratorLine: '',
    lastReflectAtSec: 0,
    lastNarrationAtSec: 0,
    timeMarksFired: [],
    supply: null,
    freeCare: null,
    freeCareVia: null,
    freeWorked: false,
    restMult: 1,
    momentFired: false,
    umbrella: false,
    wetness: null,
  };
}

/** 이 계절에 가능한 날씨 목록 (M12) — 눈=겨울, 꽃잎비=봄, 낙엽비=가을 */
export function weathersOfSeason(season: string): GameState['weather'][] {
  return (BALANCE.WEATHER_BY_SEASON[season] ?? []).map(
    ([kind]) => kind as GameState['weather'],
  );
}

/** 계절 전용 날씨 — 계절마다 딱 하나씩 짝이 있다.
 *  봄 꽃잎비 / 여름 풀잎비 / 가을 낙엽비 / 겨울 눈.
 *  넷은 "하늘에서 뭔가 흩날린다"는 같은 자리의 다른 이름이라, 계절이 바뀌면
 *  그 계절의 것으로 갈아 끼운다 — 봄에 눈이 계속 내리거나 겨울에 꽃잎이
 *  날리는 대신, 계절에 맞는 것이 이어서 내린다. */
const SEASONAL_WEATHER = ['petals', 'grass', 'leaves', 'snow'] as const;
const SEASONAL_OF_SEASON: Record<string, GameState['weather']> = {
  spring: 'petals',
  summer: 'grass',
  autumn: 'leaves',
  winter: 'snow',
};
/** 계절이 바뀌어도 이어갈 날씨.
 *  계절 전용 날씨는 그 계절의 짝으로 갈아 끼우고, 그 밖(맑음·비·장대비·흐림)은
 *  계절을 안 타므로 그대로 둔다. */
export function carryWeather(
  weather: GameState['weather'],
  season: string,
): GameState['weather'] {
  if (!(SEASONAL_WEATHER as readonly string[]).includes(weather)) return weather;
  return SEASONAL_OF_SEASON[season] ?? weather;
}

/** 자연 날씨 추첨 (M12) — 달력일당 1회, 계절별 가중 확률표 */
function rollWeather(season: string, rng: Rng): GameState['weather'] {
  const table = BALANCE.WEATHER_BY_SEASON[season] ?? [['clear', 1]];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [kind, w] of table) {
    r -= w;
    if (r <= 0) return kind as GameState['weather'];
  }
  return 'clear';
}

/** 비 오는 산책인가 — 우산 플로우·젖음 판정 공용 (M12).
 * 꽃잎비·낙엽비는 마른 날씨 — 우산도 젖음도 없다. */
function wetOutdoor(weather: GameState['weather'], actionId: ActionId): boolean {
  return (
    actionId === 'walk' &&
    (weather === 'rain' || weather === 'downpour' || weather === 'snow')
  );
}

/**
 * 직전 휴식 준수 배율 (개정 v4-4): 배정 휴식을 얼마나 채우고 왔는가.
 * 완주(초과 포함) ×1.0 / 절반 이상 ×0.75 / 미만·스킵 ×0.5.
 * 첫 세션(직전 휴식 없음)은 1.0.
 */
function restComplianceMult(state: GameState, nowMs: number): number {
  if (state.lastSessionEndAt === null || state.rest.totalSec <= 0) return 1;
  const restStartMs = state.rest.endsAt - state.rest.totalSec * 1000;
  const ratio = (nowMs - restStartMs) / 1000 / state.rest.totalSec;
  if (ratio >= 1) return 1;
  return ratio >= BALANCE.REST_MULT_HALF_RATIO
    ? BALANCE.REST_MULT_HALF
    : BALANCE.REST_MULT_SKIP;
}

function actionOf(data: GameData, id: ActionId): ActionData | undefined {
  return data.actions.find((a) => a.id === id);
}

/** 행동/물품 해금: unlock 조건 통과 OR Outcome으로 명시 해금 */
/** 해금 여부만 판정 — 병간호 같은 일시 차단과 무관 (해금 알림 등 영구 상태용) */
export function isActionUnlocked(action: ActionData, state: GameState): boolean {
  return (
    state.unlockedActions.includes(action.id) ||
    checkCondition(action.unlock, state)
  );
}

/**
 * 개인작업 = 돌의 작업 세션 (행동 id). 상점 물품의 `boosts` 대상 이름이기도 해서
 * 책상 체인·API 토큰이 이 행동에 자동으로 붙고, rooms.json 침실 boosts 를 통해
 * 씬도 자동으로 작업방이 된다 (개정 v5 §2 — 침실·작업방 = lie·personalWork).
 */
export const PERSONAL_WORK_ACTION = 'personalWork';

/**
 * 위임 personal("자기만의 작업을 하고 싶은 것 같다")이 여는 세션의 행동.
 * 육성기에만 작업행동 — 동거는 개인작업 정지(v3-8)라, 하고 싶어해도 자유행동
 * 그대로 열린다(돌은 결국 누워 있다 — 동거의 그늘 그 자체라 의도된 그림이다).
 */
export function delegatePersonalAction(era: GameState['era']): string {
  return era === 'raising' ? PERSONAL_WORK_ACTION : 'free';
}

/** 이 행동으로 세션을 열 수 있는가 — 위임이 고른 행동도 여기를 지난다 */
export function isActionAvailable(action: ActionData, state: GameState): boolean {
  // 병간호 상태: '병간호하기'만 가능 (돌이 아파 다른 행동을 받지 못한다)
  if (state.presence.sick) return action.id === 'nurse';
  if (action.id === 'nurse') return false; // 병간호는 평소엔 숨김
  return isActionUnlocked(action, state);
}

/**
 * 화자가 **고를 수 있는** 행동인가 — 행동 카드 목록과 SELECT_ACTION 의 기준.
 * 위임 전용(byDelegate, 개인작업)은 열 수는 있어도 고를 수는 없다:
 * 돌이 오늘 그걸 하겠다고 해야 열리는 세션이다.
 */
export function isActionSelectable(action: ActionData, state: GameState): boolean {
  return !action.byDelegate && isActionAvailable(action, state);
}

export function isItemAvailable(item: ShopItemData, state: GameState): boolean {
  return (
    state.unlockedItems.includes(item.id) || checkCondition(item.unlock, state)
  );
}

/**
 * 보유(배치 무관) 소품의 수치 효과 합산 (피드백8) — 2·3차 정성 소비처.
 * 배치 여부와 무관하다: 들여놓은 마음이 곧 효과다.
 */
export function itemBonus(
  state: GameState,
  data: GameData,
  key: 'visitBonus' | 'treeBondBonus' | 'treeFlowers',
): number {
  return data.shop.reduce(
    (sum, it) => (it.id in state.items ? sum + (it[key] ?? 0) : sum),
    0,
  );
}

/** 시듦 회복 배수 — 보유 소품 중 최댓값 (중복 구매로 폭주하지 않게) */
export function witherRecoverMult(state: GameState, data: GameData): number {
  return data.shop.reduce(
    (m, it) =>
      it.id in state.items ? Math.max(m, it.witherRecoverMult ?? 1) : m,
    1,
  );
}

/** 돌이 지금 곁에 있는가 (잠수·apart 통합 판정) */
export function isRockPresent(state: GameState): boolean {
  if (state.era === 'apart') return state.apart.visiting;
  return state.presence.state === 'present';
}

/**
 * 동석 축 판정 (피드백4-2) — 문구 변형을 고르는 단일 기준.
 * 돌이 곁에 있으면 present, 3차에서 아이를 만난 뒤면 companion, 아니면 absent.
 */
export function companyOf(state: GameState): Company {
  if (isRockPresent(state)) return 'present';
  if (state.planted && companionMet(state.memory)) return 'companion';
  return 'absent';
}

/** 페이지 배열 → 일지/서술 한 덩어리 (M2에서 페이지 UI로 분리 렌더링) */
function joinPages(pages: string[]): string {
  return pages.join('\n');
}

function addJournal(
  journal: readonly JournalEntry[],
  elapsedSec: number,
  text: string,
): JournalEntry[] {
  if (!text) return [...journal];
  return [...journal, { t: formatElapsed(elapsedSec), text }];
}

/**
 * 친밀 접근 1회 반영 — 육성 시대에만. (동거: 잠수 소멸·거리 조절 상실,
 * apart: 관계 역학 자체가 끝난 뒤이므로 안정감 판정 없음)
 */
/** 상점의 개인작업 강화: 책상 체인(보유) 확률 가산 + 이번 세션 API 토큰 가산 */
function personalWorkBoost(state: GameState, data: GameData): number {
  let boost = 0;
  for (const it of data.shop) {
    if (it.boosts === 'personalWork' && !it.consumable && it.id in state.items)
      boost += it.bonusPersonalWork ?? 0;
  }
  const supply = state.session.supply;
  if (
    supply &&
    data.shop.find((i) => i.id === supply.itemId)?.boosts === 'personalWork'
  )
    boost += BALANCE.API_TOKEN_PROB_BOOST;
  return boost;
}

/** 이번 세션에 소모한 개인작업 소모품(API 토큰)의 자아실현 추가 획득 */
function supplySelfActBonus(state: GameState, data: GameData): number {
  const supply = state.session.supply;
  if (!supply) return 0;
  const it = data.shop.find((i) => i.id === supply.itemId);
  const v = it?.consumable?.variants.find((x) => x.key === supply.variant);
  return v?.bonusSelfAct ?? 0;
}

function applyIntimacy(
  state: GameState,
  intimacy: number,
  rng: Rng,
  /** 진정 허용 — 세션당 1회(행동 경로)만 걸린다 (M18 과대 적용 수정) */
  allowSoothe = false,
): GameState {
  if (state.era !== 'raising' || state.presence.state === 'absent') return state;
  const { abandonment, intimacyThreat } = state.stats;
  const oc = intimacyOutcome(
    abandonment,
    intimacyThreat,
    intimacy,
    rng,
    attachRate(state.relationTier, state.crisesWeathered),
    allowSoothe,
    // 개막 전엔 위기가 터지지 않는다 — 조용히 쌓일 뿐 (M18)
    state.relationTier >= BALANCE.ATTACH_ONSET_TIER,
  );
  const ab = clampStat(abandonment + oc.abandonmentDelta);
  const it = clampStat(intimacyThreat + oc.intimacyThreatDelta);
  let next: GameState = {
    ...state,
    stats: {
      ...state.stats,
      abandonment: ab,
      intimacyThreat: it,
      security: derivedSecurity(ab, it),
    },
  };
  if (oc.retreat) {
    next = {
      ...next,
      presence: startAbsence(rng),
      crisesWeathered: next.crisesWeathered + 1,
    };
  }
  return next;
}

/** 선택지를 제시했다 — 기본은 '안 고름'(false)으로 넣고, 고르면 뒤집는다. */
function pushChoiceOffer(log: boolean[]): boolean[] {
  return [...log, false].slice(-BALANCE.CHOICE_WINDOW);
}

/** 방금 제시한 선택지를 골랐다. 슬롯이 하나뿐이라 마지막 기록이 곧 그것이다. */
function markChoicePicked(log: boolean[]): boolean[] {
  return log.length === 0 ? log : [...log.slice(0, -1), true];
}

/**
 * 선택지에 응답하지 않는 유형인가 (M25).
 * 표본이 차기 전에는 판정하지 않는다. 롤링 윈도우라 다시 고르기 시작하면 스스로 풀린다.
 */
export function ignoresChoices(state: GameState): boolean {
  const log = state.recentChoices ?? [];
  if (log.length < BALANCE.CHOICE_MIN_SAMPLE) return false;
  return log.filter(Boolean).length / log.length < BALANCE.CHOICE_IGNORE_RATE;
}

function milestoneDue(m: MilestoneData, state: GameState): boolean {
  if (state.milestonesFired.includes(m.id)) return false;
  switch (m.trigger.type) {
    case 'firstAction':
      // 해당 행동의 세션을 실제로 완료했는가 — END_FOCUS가 남긴 기억 항목으로 판정
      return m.trigger.action in state.memory;
    case 'stageUp':
      return needsLevelOf(state.stats.needs) >= m.trigger.level;
    case 'totalHours':
      return state.totals.focusSeconds / 3600 >= m.trigger.hours;
    case 'firstReturn':
      // 복귀 대화는 returnPending 경로에서 처리·소진된다
      return false;
    case 'minTier':
      // 관계 서사 비트 (M19b) — 확정 티어 도달 (예: 새싹 전조)
      return state.relationTier >= m.trigger.tier;
  }
}

/** 선택지 옵션 결과 적용 (조건 필터 → 가중 추첨 → Outcome/추억 기록) */
function resolveOption(
  state: GameState,
  option: ChoiceOptionData,
  data: GameData,
  rng: Rng,
  nowMs: number,
): GameState {
  const picked = pickChoiceOutcome(option.outcomes, state, rng);
  let next = applyIntimacy(state, option.intimacy, rng);
  next = applyOutcome(next, picked.outcome, nowMs);
  next = recordRemembrance(next, picked.remembrance, nowMs, {
    labelId: option.labelId,
    resultId: picked.resultId,
  });
  // 밤이면 결과 줄도 달빛 화법으로 (햇빛쬐기 계열) — 공통 tod 축 경유
  const tod = resolveTimeOfDay(state.settings, nowMs);
  const text = joinPages(
    pickText(data.text, nightVariant(data.text, picked.resultId, tod), rng),
  );
  return {
    ...next,
    memory: remember(
      next.memory,
      'choice',
      BALANCE.MEMORY_WEIGHT_CHOICE,
      nowMs,
    ),
    session: {
      ...next.session,
      narratorLine: text,
      // 선택 결과 줄은 즉시 노출 + 스탬프 — 이후 앰비언트/반추/문턱이 이 간격 안에는
      // 덮지 못한다 (MIN_NARRATION_GAP_SEC). 플레이어 조작이므로 자신은 억제 없음.
      lastNarrationAtSec: next.session.elapsedSec,
      journal: addJournal(next.session.journal, next.session.elapsedSec, text),
    },
  };
}

/** 추억 회상 1건 (비복원, 소진 시 리셋) — reveal 페이지가 이때 처음 붙는다 */
function recallRemembrance(
  state: GameState,
  data: GameData,
  rng: Rng,
): { pages: string[]; recalled: string[] } | null {
  if (state.remembrances.length === 0) return null;
  let recalled = state.remembrancesRecalled;
  if (recalled.length >= state.remembrances.length) recalled = [];
  const avail = state.remembrances.filter((r) => !recalled.includes(r.id));
  const picked = avail[Math.floor(rng() * avail.length)];
  if (!picked) return null;
  // 선택지 유래 추억: 그때의 선택을 summary와 reveal 사이에 재생 (M11a)
  const choicePages = picked.pickedLabelId
    ? fillPages(pickText(data.text, SYS.remembrance.choice, rng), {
        label: joinPages(pickText(data.text, picked.pickedLabelId, rng)),
      })
    : [];
  return {
    pages: [
      ...pickText(data.text, picked.summaryId, rng),
      ...choicePages,
      ...pickText(data.text, picked.revealId, rng),
    ],
    recalled: [...recalled, picked.id],
  };
}

/** 돌 부재 시 반추 — 돌을 언급하지 않는 부재 전용 문장 */
function absentReflectionLine(
  state: GameState,
  data: GameData,
  rng: Rng,
): string {
  const def = data.reflections.find((d) => d.token === 'absent');
  if (!def) return '';
  const textId = resolveReflection(def, state, rng);
  return textId ? joinPages(pickText(data.text, textId, rng)) : '';
}

/**
 * 1차 토큰 게이트 (개정 v4-9/10): 함께 겪었어야 할 것들 — 행동 전종(병간호 제외,
 * 위기 아크는 7티어 게이트가 보장) + 첫 선택 + 첫 구매 + 개인작업 목격.
 * 전부 **분기 내 상시 획득 가능한 것만** — 퇴화 플레이 차단용, 페이싱 영향 0.
 *
 * 'free'(자유행동)는 제외한다. 위임(피드백2) 이후 자유행동은 실행되는 세션이
 * 아니라 디스패처가 됐다 — 돌이 고른 행동이나 작업행동으로 치환되므로 육성기에
 * 'free' 토큰이 기록되는 경로는 **돌이 부재중일 때뿐**이다. 요구했다가는 엔딩이
 * 잠수 아크를 기다리는 꼴이 되어 "페이싱 영향 0" 원칙이 깨진다.
 * 대신 그 자리를 personalWork 가 채운다 — 전종 개수는 그대로 7종이다.
 */
export function hasEndingTokens(
  memory: GameState['memory'],
  data: GameData,
): boolean {
  return (
    data.actions.every(
      (a) => a.id === 'nurse' || a.id === 'free' || a.id in memory,
    ) &&
    'choice' in memory &&
    'personalWork' in memory &&
    Object.keys(memory).some((k) => k.startsWith('buy-'))
  );
}

/**
 * 엔딩 이벤트 진입 조건 (개정 v4-9): 자아실현 완성 + 호감도 7티어 +
 * 1차 토큰 게이트 + 엔딩 전 대화 소진 (육성 시대)
 */
function isEndingDue(state: GameState, data: GameData): boolean {
  return (
    state.era === 'raising' &&
    state.stats.selfActualization >= BALANCE.SELF_ACT_COMPLETE &&
    state.relationTier >= BALANCE.AFFECTION_TIERS.length &&
    hasEndingTokens(state.memory, data) &&
    state.endingTalksSeen >= data.endings.preEndingTalks.length
  );
}

/**
 * rest 탈출 공통 퍼널 — REST_END와 rest→START_FOCUS 직행이 공유한다.
 * 응답 없이 남은 떠나려는 기색은 '보내주기'로 정리하고,
 * 일지 문구(visitEnd)는 호출부가 알맞은 저널에 싣는다.
 */
function exitRest(
  state: GameState,
  data: GameData,
  rng: Rng,
): { state: GameState; visitEndLine: string | null } {
  if (state.era !== 'apart' || !state.apart.leavePending)
    return { state, visitEndLine: null };
  return {
    state: {
      ...state,
      apart: { ...state.apart, visiting: false, leavePending: false, held: false },
      // 돌이 떠나면 '오늘 돌이 원하는 것'도 함께 사라진다 (리뷰)
      delegate: null,
    },
    visitEndLine: joinPages(pickText(data.text, SYS.journal.visitEnd, rng)),
  };
}

/** 대화 풀 1건 서빙 (비복원, when 조건 필터) — apart 방문/빈자리·잠수 중 부재 풀이 공유 */
function serveTalkPool(
  state: GameState,
  data: GameData,
  rng: Rng,
  poolId: string,
  lines: DialogueLine[],
): GameState {
  const draw = drawEligibleLine(
    lines,
    state.dialogue.usedByPool[poolId] ?? [],
    state,
    rng,
  );
  if (!draw) return { ...state, rest: { ...state.rest, talkPressed: true } };
  const entry = lines[draw.index];
  return {
    ...state,
    dialogue: {
      usedByPool: { ...state.dialogue.usedByPool, [poolId]: draw.used },
    },
    rest: {
      ...state.rest,
      talkPressed: true,
      talkState: {
        kind: 'pool',
        pages: pickText(data.text, entry.textId, rng),
        hasChoice: !!entry.choice,
        done: false,
        yesId: entry.choice?.yesId,
        noId: entry.choice?.noId,
        yesOutcome: entry.choice?.yesOutcome,
        noOutcome: entry.choice?.noOutcome,
      },
    },
  };
}

/**
 * 리듀서 진입점 — reduce 결과에 도감 뱃지 정산(M11a)을 얹는다.
 * 시각(nowMs)을 가진 이벤트 뒤에만 스탬프한다 — TALK 등 시각 없는 이벤트의
 * 획득은 다음 시각 이벤트에서 정산된다 (도감 정렬용이라 지연 무해).
 */
export function transition(
  state: GameState,
  event: GameEvent,
  ctx: TransitionCtx,
): GameState {
  const next = reduce(state, event, ctx);
  if ('nowMs' in event && event.nowMs !== undefined && next !== state) {
    return settleBadges(next, ctx.data.badges, event.nowMs);
  }
  return next;
}

function reduce(
  state: GameState,
  event: GameEvent,
  ctx: TransitionCtx,
): GameState {
  const { rng, data } = ctx;

  switch (event.type) {
    case 'SETTLE': {
      const settled = settleCalendar(
        state.stats,
        state.lastDecayDate,
        state.lastSessionEndAt,
        event.nowMs,
      );
      // 자연 날씨 변화 (M12) — 달력일당 1회, 계절표에서 추첨.
      // 수동 변경은 다음 날까지 유지되되, 계절이 바뀌어 무효가 되면 재추첨된다.
      const today = dateKey(event.nowMs);
      const season = resolveSeason(state.settings, event.nowMs);
      const allowed = weathersOfSeason(season);
      const weather =
        state.lastWeatherDate === today && allowed.includes(state.weather)
          ? state.weather
          : rollWeather(season, rng);
      return {
        ...state,
        stats: settled.stats,
        lastDecayDate: settled.lastDecayDate,
        weather,
        lastWeatherDate: today,
      };
    }

    case 'SELECT_ACTION': {
      if (state.phase !== 'actionSelect' && state.phase !== 'rest') return state;
      const action = actionOf(data, event.actionId);
      // 위임 전용 행동(개인작업)은 화자가 고를 수 없다 — 돌이 골라야 열린다
      if (!action || !isActionSelectable(action, state)) return state;
      return {
        ...state,
        selectedAction: event.actionId,
        delegate: null,
        pendingUmbrella: false,
        pendingApproach: null,
      };
    }

    case 'START_FOCUS': {
      if (state.phase !== 'actionSelect' && state.phase !== 'rest') return state;
      // 각성 강제 이벤트(피드백6) — 응답 전까지 다음 세션도 막는다
      if (state.awakeningPending) return state;
      // 자유행동 위임(피드백2): 돌이 고른 행동으로 치환해 실제 세션을 연다.
      // 개인작업도 예외가 아니다 — 'personalWork' 라는 제 행동으로 열린다.
      // (예전엔 치환할 행동이 없어 'free' 로 남았고, 그래서 작업 중인 돌에게
      //  자유행동 문구 "돌은 누워 있다" 가 붙었다)
      // locked(미해금)는 확인만 가능 — 세션이 시작되지 않는다
      if (state.selectedAction === 'free' && state.delegate) {
        if (state.delegate.kind === 'locked') return state;
        // 위임은 '돌이 원하는 것'이다 — 그 사이 돌이 떠났다면 무효.
        // (휴식 중 위임 → 보내주기 → 빈방에 산책 세션이 열리던 누출)
        state = !isRockPresent(state)
          ? { ...state, delegate: null }
          : {
              ...state,
              selectedAction:
                state.delegate.kind === 'action'
                  ? state.delegate.action
                  : delegatePersonalAction(state.era),
              delegate: null,
            };
      }
      const action = actionOf(data, state.selectedAction);
      if (!action) return state;
      // 선택된 행동이 지금 가용한지 검증 — 회복 후 남은 'nurse'나
      // 마이그레이션으로 잠긴 행동으로 세션이 시작되는 것을 막는다.
      if (!isActionAvailable(action, state)) return state;

      // 우산 선택 (M12): 비·눈 오는 산책 + 우산 보유 + 아직 결정 안 함 → 대기.
      // UI가 pendingUmbrella를 보고 두 버튼을 띄운 뒤 umbrella를 실어 재디스패치한다.
      if (
        wetOutdoor(state.weather, action.id) &&
        'umbrella' in state.items &&
        event.umbrella === undefined
      ) {
        return {
          ...state,
          pendingUmbrella: true,
          // 포크 선택은 우산 질문을 건너 살아남는다 (M18)
          pendingApproach: event.approach ?? null,
        };
      }

      // rest 탈출 공통 정리 (응답 없는 떠나려는 기색 = 보내주기)
      const exited = exitRest(state, data, rng);

      // 휴식을 떠나는 시점에 엔딩이 준비되어 있으면 집중 대신 엔딩 이벤트로
      if (state.phase === 'rest' && isEndingDue(exited.state, data)) {
        return { ...exited.state, phase: 'ending' };
      }

      // 보장 위기 아크: 잠수 (개정 v4-8) — 3티어 승급이 예약, 다음 세션 시작에 발동.
      // 가까워진 스스로에게 놀라 물러난다. 기존 잠수 시스템(부재·수렴 복귀)을 그대로 탄다.
      let arcState = exited.state;
      let crisisLine: string | null = null;
      if (
        arcState.era === 'raising' &&
        arcState.pendingCrises.includes('retreat') &&
        arcState.presence.state === 'present' &&
        !arcState.presence.sick
      ) {
        // 개막 스파이크 (M18): 잠복기에 쌓아온 친밀위협이 급성으로 드러난다 —
        // "마음을 열어버린 자신에게 놀란" 순간. 쌓인 유기불안은 그대로 남아
        // 위기의 깊이와 회복 후 자리를 잠복기 플레이가 결정한다.
        const spikedIt = Math.max(
          arcState.stats.intimacyThreat,
          BALANCE.RETREAT_SPIKE,
        );
        arcState = {
          ...arcState,
          presence: startAbsence(rng),
          pendingCrises: arcState.pendingCrises.filter((c) => c !== 'retreat'),
          crisisArcsFired: [...arcState.crisisArcsFired, 'retreat'],
          crisesWeathered: arcState.crisesWeathered + 1,
          // 급성 회피 목격 보장 — 스파이크 순간이 곧 4분면의 첫 대면이다
          quadrantsSeen: arcState.quadrantsSeen.includes('avoidant')
            ? arcState.quadrantsSeen
            : [...arcState.quadrantsSeen, 'avoidant'],
          stats: {
            ...arcState.stats,
            intimacyThreat: spikedIt,
            security: derivedSecurity(arcState.stats.abandonment, spikedIt),
          },
        };
        crisisLine = joinPages(pickText(data.text, SYS.journal.crisisRetreat, rng));
      }

      // 행동 경로만 진정이 걸린다 (세션 1회) — 선택지·대화는 축적만 (M18)
      let next = applyIntimacy(arcState, action.intimacy, rng, true);

      // 세션 포크 (M18, 개막 후): 곁에서 = 친밀위협↑ / 한 발 떨어져 = 유기불안↑.
      // 매 세션 한 축은 오른다 — 균형은 유지하는 것이지 도달하는 것이 아니다.
      // 우산 질문을 거쳐 온 재디스패치는 pendingApproach에 보존된 선택을 쓴다
      const approach = event.approach ?? state.pendingApproach ?? undefined;
      if (
        approach !== undefined &&
        next.era === 'raising' &&
        next.presence.state === 'present' &&
        !next.presence.sick &&
        next.relationTier >= BALANCE.ATTACH_ONSET_TIER
      ) {
        const rate = attachRate(next.relationTier, next.crisesWeathered);
        const up = BALANCE.ATTACH_FORK_DELTA * rate;
        const down = BALANCE.ATTACH_FORK_RELIEF * rate;
        const ab = clampStat(
          next.stats.abandonment + (approach === 'apart' ? up : -down),
        );
        const it = clampStat(
          next.stats.intimacyThreat + (approach === 'near' ? up : -down),
        );
        next = {
          ...next,
          stats: {
            ...next.stats,
            abandonment: ab,
            intimacyThreat: it,
            security: derivedSecurity(ab, it),
          },
        };
      }
      let visitJournal: string | null = null;

      // apart: 돌이 놀러올 확률 — 오면 며칠(1~N세션) 머문다.
      // 제2의 이별(M14b) 후에는 차단 기간 동안 오지 않는다.
      if (
        next.era === 'apart' &&
        !next.planted && // 3차(M15): 돌은 나무가 되었다 — 방문 시스템 종료
        !next.apart.visiting &&
        (next.visitBlockedUntil === null || event.nowMs >= next.visitBlockedUntil)
      ) {
        if (rng() < BALANCE.VISIT_PROB + itemBonus(next, data, 'visitBonus')) {
          next = {
            ...next,
            apart: {
              ...next.apart,
              visiting: true,
              held: false, // 자발적 방문 — 시들지 않는다 (M14)
              visitSessionsLeft: randInt(
                rng,
                BALANCE.VISIT_STAY_MIN,
                BALANCE.VISIT_STAY_MAX,
              ),
            },
          };
          visitJournal = joinPages(
            pickText(data.text, SYS.journal.visitStart, rng),
          );
          // 단계 게이트 해제 (피드백5): 성장이 게이트에 걸려 멈춰 있었다면
          // 이 방문이 다음 단계를 연다 — 한 단계마다 돌을 한 번은 만난다
          const gate = BALANCE.SPROUT_GATES[next.sproutGatesCleared];
          if (gate !== undefined && next.sproutGrowth >= gate) {
            next = { ...next, sproutGatesCleared: next.sproutGatesCleared + 1 };
            visitJournal = joinPages([
              visitJournal,
              joinPages(pickText(data.text, SYS.journal.gateOpen, rng)),
            ]);
          }
        }
      }

      const present = isRockPresent(next);

      // 소모품 소모: 이 행동을 강화하는 소모품 재고가 있으면 세션 시작 시 1개
      // 소모하고 종류는 구매 시(진열) 고정분을 쓴다. 개인작업도 이제 제 행동이라
      // boosts 대상과 행동 id 가 그대로 맞아떨어진다(예전엔 free→personalWork 환승).
      // 돌이 곁에 있을 때만 — 부재 세션에서 재고가 증발하거나
      // 돌 반응 대사(사용 서술)가 새는 것을 막는다.
      const consumableItem = present
        ? data.shop.find(
            (i) =>
              i.consumable &&
              i.boosts === action.id &&
              (next.supplies[i.id] ?? 0) > 0,
          )
        : undefined;
      let supply: GameState['session']['supply'] = null;
      if (consumableItem?.consumable) {
        const variant =
          next.supplyVariants[consumableItem.id] ??
          consumableItem.consumable.variants[0].key;
        supply = { itemId: consumableItem.id, variant };
        next = {
          ...next,
          supplies: { ...next.supplies, [consumableItem.id]: 0 },
        };
      }
      const company = companyOf(next);
      const startTod = resolveTimeOfDay(state.settings, event.nowMs);
      const startLine = joinPages(
        pickFor(
          data.text,
          action.startLineId,
          company,
          rng,
          {
            absent: SYS.journal.sessionStartAbsent,
            // 각성 후에는 '돌이 없는 방'이 아니라 아이가 있는 창밖 (피드백6-3)
            companion: SYS.journal.sessionStartCompanion,
          },
          startTod,
        ),
      );
      // 직전 휴식 준수 배율 — 이번 세션의 게이지 정산에 곱한다 (개정 v4-4).
      // 1 미만이면 관찰 문장으로 텔레그래프 (수치 비노출 — 돌의 기색으로만).
      const restMult = restComplianceMult(state, event.nowMs);
      const restLine =
        present && restMult < 1
          ? joinPages(
              pickText(
                data.text,
                restMult <= BALANCE.REST_MULT_SKIP
                  ? SYS.journal.restSkipped
                  : SYS.journal.restShort,
                rng,
              ),
            )
          : restMult < 1 &&
              state.planted &&
              companionMet(state.memory)
            ? // 3차 (M15): 돌이 하던 걱정을 이제 동행자가 한다
              joinPages(pickText(data.text, SYS.journal.companionWorry, rng))
            : null;
      let journal: JournalEntry[] = [];
      // '돌이 떠났다' 기록은 새 세션 일지 맨 앞에 보존한다
      if (exited.visitEndLine) journal = addJournal(journal, 0, exited.visitEndLine);
      if (crisisLine) journal = addJournal(journal, 0, crisisLine);
      journal = addJournal(journal, 0, startLine);
      if (restLine) journal = addJournal(journal, 0, restLine);
      if (visitJournal) journal = addJournal(journal, 0, visitJournal);
      const absentAmb =
        company === 'present'
          ? undefined
          : data.text[
              resolveSlot(data.text, action.ambientId, company, {
                absent: SYS.absentAmbient,
                companion: SYS.absentAmbientCompanion,
              })
            ]?.[0];
      return {
        ...next,
        phase: 'focus',
        pendingUmbrella: false,
        pendingApproach: null,
        session: {
          ...emptySession(),
          supply,
          narratorLine: crisisLine
            ? crisisLine
            : present
              ? startLine
              : joinPages(absentAmb ?? [startLine]),
          journal,
          restMult,
          umbrella:
            event.umbrella === true &&
            'umbrella' in state.items &&
            wetOutdoor(state.weather, action.id),
        },
      };
    }

    case 'SET_PAUSED': {
      if (state.phase !== 'focus') return state;
      return { ...state, session: { ...state.session, paused: event.paused } };
    }

    case 'TICK': {
      if (state.phase !== 'focus' || state.session.paused) return state;
      const action = actionOf(data, state.selectedAction);
      if (!action) return state;

      const s = state.session;
      const el = s.elapsedSec + event.dtSec;
      const present = isRockPresent(state);
      // 밤 얼굴 — 햇빛쬐기 앰비언트가 밤엔 달빛 화법으로 (공통 tod 축).
      // 실제 스토어는 nowMs를 싣지만, 디버그·테스트 틱은 없을 수 있어 0으로 방어.
      const tod = resolveTimeOfDay(state.settings, event.nowMs ?? 0);
      let next: GameState = { ...state, session: { ...s, elapsedSec: el } };

      // 1) 화자 관찰 로테이션 — 카탈로그 변형을 순서대로 순환
      // 선택지가 떠 있어도 서술은 계속 흐른다(선택지는 아래 별도 박스로 남는다)
      const ambientVariants =
        data.text[
          resolveSlot(
            data.text,
            action.ambientId,
            companyOf(next),
            {
              absent: SYS.absentAmbient,
              companion: SYS.absentAmbientCompanion,
            },
            tod,
          )
        ] ?? [];
      if (ambientVariants.length > 0) {
        const wantIdx =
          Math.floor(el / BALANCE.AMBIENT_ROTATE_SEC) % ambientVariants.length;
        // 최소 간격 게이트 — 미달이면 ambIdx를 올리지 않고 다음 틱에 다시 시도한다
        // (간격이 지나면 그때의 wantIdx로 발화). 선택 직후 몇 초 만에 덮는 걸 막는다.
        const gapOk =
          el - (next.session.lastNarrationAtSec ?? 0) >=
          BALANCE.MIN_NARRATION_GAP_SEC;
        if (wantIdx !== next.session.ambIdx && gapOk) {
          next = {
            ...next,
            session: {
              ...next.session,
              ambIdx: wantIdx,
              narratorLine: joinPages(ambientVariants[wantIdx]),
              lastNarrationAtSec: el,
            },
          };
        }
      }

      // 2) 조용한 선택지 등장 (돌이 곁에 있을 때만)
      // 발화 시점 게이트: 예약 후 행동이 바뀌었어도 현재 행동에 부적합한
      // 포섀도는 이번 세션에 등장하지 않는다 (pendingEvent는 유지 → 다음 적합 세션에 등장)
      const foreshadowFits =
        !!next.pendingEvent && checkCondition(next.pendingEvent.when, next);
      if (present && !next.session.choiceState) {
        if (foreshadowFits && el >= BALANCE.CHOICE_FIRST_AT_SEC) {
          next = {
            ...next,
            recentChoices: pushChoiceOffer(next.recentChoices),
            session: {
              ...next.session,
              choiceState: { source: 'foreshadow', index: 0, shownAtSec: el },
            },
          };
        } else if (
          next.session.choicesFired < Math.min(action.choices.length, 2)
        ) {
          const at =
            next.session.choicesFired === 0
              ? BALANCE.CHOICE_FIRST_AT_SEC
              : BALANCE.CHOICE_SECOND_AT_SEC;
          if (el >= at) {
            next = {
              ...next,
              recentChoices: pushChoiceOffer(next.recentChoices),
              session: {
                ...next.session,
                choiceState: {
                  source: 'action',
                  index: next.session.choicesFired,
                  shownAtSec: el,
                },
              },
            };
          }
        }
      }

      // 3) 선택지는 무시해도 회수되지 않고 아래에 남는다 (선택하거나 세션이 끝날 때까지)

      // 이번 틱에 시간 문턱이 발화하면(반추 간격과 자주 겹친다), 문턱 대사가 묻히지 않도록
      // 반추의 서술(일지·내레이터)만 억제한다 — 수치(자가충족·개인작업)는 그대로 적용.
      const timeMarkFiring = data.timeMarks.focus.some(
        (mark, i) => el >= mark.minSec && !next.session.timeMarksFired.includes(i),
      );

      // 4) 반추/자유행동/회상 틱
      const interval =
        action.id === 'free'
          ? BALANCE.REFLECT_INTERVAL_FREE_SEC
          : BALANCE.REFLECT_INTERVAL_SEC;
      if (el - next.session.lastReflectAtSec >= interval) {
        let line = '';
        let memory = next.memory;
        let stats = next.stats;
        let recalled = next.remembrancesRecalled;
        let careNowNeed: NeedId | null = null;
        let careNowVia: string | null = null;
        let momentNow: Remembrance | null = null;

        // 추억 순간 (M11a): 낮은 확률·세션당 1회 — 이 틱의 반추를 대신한다.
        // 육성 시대 · 돌이 곁에 있을 때만 (추억은 함께 있어야 생긴다).
        if (
          next.era === 'raising' &&
          present &&
          !next.session.momentFired &&
          rng() < BALANCE.MOMENT_PROB_PER_TICK
        ) {
          const mo = pickMoment(data.moments, next, rng);
          if (mo) {
            momentNow = {
              id: mo.id,
              summaryId: mo.summaryId,
              revealId: mo.revealId,
              // TICK에는 시각이 없다 — 세션 시작 근사치로 스탬프 (도감 정렬용)
              at: (next.lastSessionEndAt ?? 0) + el * 1000,
            };
            line = joinPages(pickText(data.text, mo.summaryId, rng));
          }
        }

        if (momentNow) {
          // 순간이 발동한 틱은 다른 반추를 덮는다 (line은 위에서 확정)
        } else if (next.era === 'apart' && !next.apart.visiting) {
          // 빈자리: 추억 회상 — 당시 미표시 정보(reveal)가 드러난다.
          // 회상할 추억이 없으면 돌 반추 대신 부재 전용 반추 (돌 언급 누출 방지)
          const recall = recallRemembrance(next, data, rng);
          if (recall) {
            line = joinPages(recall.pages);
            recalled = recall.recalled;
          } else {
            line = absentReflectionLine(next, data, rng);
          }
        } else if (action.id === 'free' && present) {
          // 돌의 자가 충족·심심풀이는 해금된 행동으로만 — 그 욕구를 채우는 행동이
          // 해금돼 있어야(아이템 구매 등) 돌이 스스로 그 기색을 낸다 (개정 v4-6)
          // 개인작업(byDelegate)은 이 풀에 들어오지 않는다 — 그건 세션 자체가
          // 따로 열리는 행동이지, 다른 세션 중에 곁들이는 심심풀이가 아니다
          const availableIds = (filter: (a: (typeof data.actions)[number]) => boolean) =>
            data.actions
              .filter(
                (a) =>
                  a.id !== 'free' &&
                  a.id !== 'nurse' &&
                  !a.byDelegate &&
                  filter(a) &&
                  isActionAvailable(a, next),
              )
              .map((a) => a.id);
          const result = pickFreeAction(
            next,
            data.reflections,
            rng,
            (need) => availableIds((a) => a.outcome?.needs?.[need] !== undefined),
            () => availableIds(() => true),
          );
          line = result.textId
            ? joinPages(pickText(data.text, result.textId, rng))
            : '';
          if (result.type === 'reflection') memory = result.memory;
          // 게이지는 여기서 올리지 않는다 — 발동만 기록하고 END_FOCUS에서
          // 집중 시간으로 정산한다 (틱마다 올리면 5분에 +5씩 폭주).
          if (result.type === 'selfCare' && next.session.freeCare === null) {
            careNowNeed = result.need;
            careNowVia = result.via ?? null;
          }
          // idle(제 마음대로 한 행동)도 기억 약강화 대상 — END_FOCUS에서 정산
          if (result.type === 'idle' && next.session.freeCareVia === null) {
            careNowVia = result.via;
          }
        } else if (present) {
          const draw = drawMemory(memory, data.reflections, next, rng);
          if (draw) {
            line = joinPages(pickText(data.text, draw.textId, rng));
            memory = draw.memory;
          } else {
            const def = data.reflections.find((d) => d.token === 'default');
            const baseVariant = def?.variants.find((v) => !v.when);
            line = baseVariant
              ? joinPages(pickText(data.text, baseVariant.textId, rng))
              : '';
          }
        } else {
          // 돌 부재(육성 잠수 등) — 부재 전용 반추, 돌을 언급하지 않는다
          line = absentReflectionLine(next, data, rng);
        }

        // 선택지가 떠 있어도 자유행동 반추 서술은 계속 흐른다(선택지는 아래 별도 박스).
        // 단, 이번 틱에 시간 문턱이 발화하면 반추 서술은 억제(수치는 위에서 이미 적용).
        // 추억 순간은 문턱보다 우선해 서술로 남긴다 (놓치면 아까운 한 줄).
        // 순간은 희귀·소중 — 최소 간격을 무시하고 항상 노출한다. 그 외 자유행동
        // 반추 서술만 간격 게이트(선택 직후 겹침 방지). 일지 기록은 그대로 남긴다.
        const gapOk =
          el - (next.session.lastNarrationAtSec ?? 0) >=
          BALANCE.MIN_NARRATION_GAP_SEC;
        const showAsNarrator =
          momentNow !== null ||
          (action.id === 'free' && present && !timeMarkFiring && gapOk);
        const wroteLine = showAsNarrator && !!line;
        next = {
          ...next,
          memory,
          stats,
          remembrancesRecalled: recalled,
          remembrances: momentNow
            ? [...next.remembrances, momentNow]
            : next.remembrances,
          session: {
            ...next.session,
            momentFired: next.session.momentFired || momentNow !== null,
            lastReflectAtSec: el,
            lastNarrationAtSec: wroteLine
              ? el
              : (next.session.lastNarrationAtSec ?? 0),
            freeCare: next.session.freeCare ?? careNowNeed,
            freeCareVia: next.session.freeCareVia ?? careNowVia,
            journal:
              line && (momentNow !== null || !timeMarkFiring)
                ? addJournal(next.session.journal, el, line)
                : next.session.journal,
            narratorLine: wroteLine ? line : next.session.narratorLine,
          },
        };
      }

      // 5) 시간 문턱 발화 — 집중이 길어질수록 문턱별 1회 (기획서 요청)
      // 분 표기는 문구에 박지 않고 문턱값({mins})을 채운다 — 데이터 수정에도 어긋나지 않게
      data.timeMarks.focus.forEach((mark, i) => {
        // 문턱은 드문 마일스톤(25/50/90분) — 간격으로 미루지 않고 항상 발화하되,
        // 스탬프를 남겨 뒤따르는 앰비언트가 곧바로 덮지 않게 한다. (선택 직후
        // 겹침은 '선택→문턱' 순서가 아니라 앰비언트에서 오므로 여기선 게이트 불필요.)
        if (el >= mark.minSec && !next.session.timeMarksFired.includes(i)) {
          const markLine = joinPages(
            fillPages(pickFor(data.text, mark.textId, companyOf(next), rng), {
              mins: Math.round(mark.minSec / 60),
            }),
          );
          next = {
            ...next,
            session: {
              ...next.session,
              timeMarksFired: [...next.session.timeMarksFired, i],
              lastNarrationAtSec: el,
              journal: markLine
                ? addJournal(next.session.journal, el, markLine)
                : next.session.journal,
              narratorLine: markLine || next.session.narratorLine,
            },
          };
        }
      });

      return next;
    }

    case 'CHOICE_PICKED': {
      const cs = state.session.choiceState;
      if (state.phase !== 'focus' || !cs) return state;
      const action = actionOf(data, state.selectedAction);
      if (!action) return state;

      const option =
        cs.source === 'foreshadow'
          ? state.pendingEvent?.options[event.optionIndex]
          : action.choices[cs.index]?.options[event.optionIndex];
      if (!option) return state;

      let next = resolveOption(state, option, data, rng, event.nowMs);
      next = {
        ...next,
        pendingEvent: cs.source === 'foreshadow' ? null : next.pendingEvent,
        // 응답한 사람 — 무응답 판정 윈도우에 '골랐다'로 남는다
        recentChoices: markChoicePicked(next.recentChoices),
        session: {
          ...next.session,
          choiceState: null,
          choicesFired:
            cs.source === 'action'
              ? next.session.choicesFired + 1
              : next.session.choicesFired,
        },
      };
      return next;
    }

    case 'END_FOCUS': {
      if (state.phase !== 'focus') return state;
      const action = actionOf(data, state.selectedAction);
      if (!action) return state;

      const mins = state.session.elapsedSec / 60;
      const cappedMins = Math.min(mins, BALANCE.SESSION_CAP_MINUTES);
      // 90분 상한: 정성은 상한까지만 환산 (초과분은 보상 없음)
      const care = accrueCare(state.care, cappedMins);
      const earned = care.points - state.care.points;
      const restMin = restMinutesFor(mins, state.settings.flowtime);
      // 세션 동안 돌이 곁에 있었는가 — 없었으면 '옆에 있었다' 대신 부재 마무리
      const sessionHadRock = isRockPresent(state);

      // 시간 정산 단위 — 정성과 같은 자(25분당 1), 90분 상한 → 최대 3.6u.
      // 게이지 보상은 세션 횟수가 아니라 완료한 집중 시간에 비례한다.
      const units = cappedMins / BALANCE.CARE_MINUTES_PER_POINT;
      // 휴식 준수 배율 (개정 v4-4): 게이지 정산에만 곱한다 — 정성(units)은 제외
      const restMult = state.session.restMult ?? 1;
      const gainUnits = units * restMult;
      const scaleNeeds = (
        b: Partial<Record<NeedId, number>> | undefined,
      ): Partial<Record<NeedId, number>> | undefined => {
        if (!b) return undefined;
        const out: Partial<Record<NeedId, number>> = {};
        for (const k of Object.keys(b) as NeedId[]) out[k] = (b[k] ?? 0) * gainUnits;
        return out;
      };

      // 행동 결과 적용 — 욕구·호감도는 시간 정산, 기분은 세션당 그대로
      const scaledOutcome = action.outcome && {
        ...action.outcome,
        needs: scaleNeeds(action.outcome.needs),
        stats: action.outcome.stats && {
          ...action.outcome.stats,
          affection: (action.outcome.stats.affection ?? 0) * gainUnits,
        },
      };
      let next = applyOutcome(state, scaledOutcome, event.nowMs);

      // 상점 보너스: 체인(행동 강화)은 시간 정산, 소모품은 1회 효과라 플랫
      const bonusNeeds: Partial<Record<NeedId, number>> = {};
      const addBonus = (b?: Partial<Record<NeedId, number>>) => {
        if (!b) return;
        for (const k of Object.keys(b) as NeedId[])
          bonusNeeds[k] = (bonusNeeds[k] ?? 0) + (b[k] ?? 0);
      };
      for (const it of data.shop) {
        if (it.boosts === action.id && !it.consumable && it.id in next.items)
          addBonus(scaleNeeds(it.bonusNeeds));
      }
      // 자유행동 정산: 자가충족(발동 시)은 시간 정산.
      let freeWorked = false;
      if (action.id === 'free') {
        const freeCareNeed = state.session.freeCare;
        if (freeCareNeed)
          addBonus({ [freeCareNeed]: BALANCE.FREE_SELF_CARE_GAIN * gainUnits });
      }
      // 개인작업 판정 — 작업 세션당 1회, 확률·획득 모두 시간 비례 (개정 v4-3):
      //   p = (기본 + 욕구평균 비례 + 아이템 가산) × min(집중분,90)/90
      // 짧은 세션은 기대값이 그만큼 작아 스팸이 무의미하고, 책상 체인 확률 노브가 살아난다.
      // 문턱은 상승 게이트(80)가 아니라 충족(60) — 개정 v4-5 히스테리시스.
      // 세션 중 욕구가 내려앉아도 이미 열린 작업이 헛되지 않게 하는 여유 밴드다.
      if (action.id === PERSONAL_WORK_ACTION) {
        if (
          sessionHadRock &&
          state.era === 'raising' && // 동거: 개인작업 정지
          firstUnfilledNeed(next.stats.needs) === null
        ) {
          const prob =
            (personalWorkProb(next.stats.needs) +
              personalWorkBoost(state, data)) *
            (cappedMins / 90);
          if (rng() < prob) {
            freeWorked = true;
            // 획득은 발동당 고정 × 휴식 배율 — 확률이 이미 시간 비례라
            // 시간당 기대값은 세션 길이와 무관하다 (개정 v4-3)
            const workGain =
              BALANCE.SELF_ACT_GAIN_PER_WORK * restMult +
              supplySelfActBonus(state, data); // API 토큰 보너스는 1회 효과라 플랫
            next = {
              ...next,
              stats: {
                ...next.stats,
                selfActualization: clampStat(
                  next.stats.selfActualization + workGain,
                ),
              },
            };
          }
        }
      }
      const supplyUse = state.session.supply;
      let supplyLine: string | null = null;
      let usedSupplyToken: string | null = null;
      if (supplyUse) {
        const it = data.shop.find((i) => i.id === supplyUse.itemId);
        if (it?.boosts === PERSONAL_WORK_ACTION && !freeWorked) {
          // 개인작업 소모품(API 토큰): 개인작업이 발동하지 않은 세션엔 소모하지
          // 않는다 — 재고로 되돌리고, '작업이 순조로웠다'류 거짓 서술도 남기지 않는다
          next = {
            ...next,
            supplies: { ...next.supplies, [supplyUse.itemId]: 1 },
          };
        } else {
          const variant = it?.consumable?.variants.find(
            (v) => v.key === supplyUse.variant,
          );
          if (variant) {
            addBonus(variant.bonusNeeds);
            // 소모품 사용 토큰 (M11a) — 도감 '작은 취향'의 재료
            usedSupplyToken = `use-${supplyUse.itemId}-${supplyUse.variant}`;
            const useId = `shop.${supplyUse.itemId}.use.${supplyUse.variant}`;
            if (data.text[useId]) {
              supplyLine = joinPages(pickText(data.text, useId, rng));
            }
          }
        }
      }
      if (Object.keys(bonusNeeds).length > 0) {
        // 아이템·자가충족 보너스도 같은 상승 게이트를 지난다 (개정 v4-5)
        const inCrisis =
          next.era === 'raising' &&
          (next.presence.sick || next.presence.state === 'absent');
        next = {
          ...next,
          stats: {
            ...next.stats,
            needs: applyNeedsGated(next.stats.needs, bonusNeeds, !inCrisis),
          },
        };
      }

      // 동거 하이브리드: 의존도 상승 + 존중·자아실현 잠식 (호감도는 보존)
      let stats = next.stats;
      if (next.era === 'cohabit') {
        stats = {
          ...stats,
          dependence: clampStat(
            stats.dependence + BALANCE.DEPENDENCE_PER_SESSION,
          ),
          needs: {
            ...stats.needs,
            esteem: clampStat(stats.needs.esteem - BALANCE.COHABIT_ESTEEM_DECAY),
          },
          selfActualization: clampStat(
            stats.selfActualization - BALANCE.COHABIT_SELF_ACT_DECAY,
          ),
        };
      }

      // 욕구 시간 비례 감소 (개정 v4-5) — 로테이션 유도. apart(돌 없음)는 제외.
      if (next.era !== 'apart') {
        stats = { ...stats, needs: decayNeeds(stats.needs, cappedMins / 60) };
      }

      // 관계 티어 승급 — 하루 1회 (서사 비트 달력 게이트, 개정 v4-7).
      // 임계 초과분은 이월되고, 다음 플레이 날 승급이 확정된다.
      const today = dateKey(event.nowMs);
      let relationTier = next.relationTier;
      let lastTierUpDate = next.lastTierUpDate;
      let pendingCrises = next.pendingCrises;
      let crisisArcsFired = next.crisisArcsFired;
      let crisesWeathered = next.crisesWeathered;
      if (
        next.era === 'raising' &&
        affectionTier(stats.affection) > relationTier &&
        lastTierUpDate !== today
      ) {
        relationTier += 1;
        lastTierUpDate = today;
        // 보장 위기 아크 예약 (개정 v4-8): 3티어 = 잠수, 5티어 = 병간호(성장통).
        // 큐라서 3티어 잠수가 아직 안 터졌는데 5티어에 닿아도 둘 다 남는다 (M17).
        const enqueue = (c: CrisisKind, atTier: number) => {
          if (
            relationTier === atTier &&
            !crisisArcsFired.includes(c) &&
            !pendingCrises.includes(c)
          )
            pendingCrises = [...pendingCrises, c];
        };
        enqueue('retreat', 3);
        enqueue('sick', 5);
      }

      // 약한 애착 표류 (개정 v4-8): 깊어진 관계 + 휴식 스킵이 유기불안을 서서히 쌓는다.
      // 접근의 진정(−3)이 상쇄하므로 성실 플레이어는 체감 0 — 무심·스킵만 위기로 간다.
      if (
        next.era === 'raising' &&
        next.presence.state === 'present' &&
        !next.presence.sick
      ) {
        const drift =
          (BALANCE.ATTACH_DRIFT_PER_TIER * relationTier +
            (restMult < 1 ? BALANCE.ATTACH_DRIFT_ON_SKIP : 0)) *
          attachRate(relationTier, crisesWeathered);
        const ab = clampStat(stats.abandonment + drift);
        stats = {
          ...stats,
          abandonment: ab,
          security: derivedSecurity(ab, stats.intimacyThreat),
        };
      }

      // 급성 애착 4분면 목격 기록 (M11a 도감 재료) — 수치는 비노출, 목격 사실만
      let quadrantsSeen = next.quadrantsSeen;
      if (next.era === 'raising') {
        const q = acuteQuadrant(stats.abandonment, stats.intimacyThreat);
        if (q && !quadrantsSeen.includes(q)) quadrantsSeen = [...quadrantsSeen, q];
      }

      // 애착 위기 루프 (육성): 잠수(부재)·병간호(sick) 모두 두 축을 균형으로 수렴시켜
      // 벗어난다(항상성 복귀). 균형이면 위기 종료 — 부재는 복귀, 병간호는 회복.
      let presence = next.presence;
      let journal = state.session.journal;
      const elapsed = state.session.elapsedSec;
      if (next.era === 'raising' && (presence.state === 'absent' || presence.sick)) {
        const step = convergeStep(stats.abandonment, stats.intimacyThreat);
        stats = {
          ...stats,
          abandonment: step.abandonment,
          intimacyThreat: step.intimacyThreat,
          security: derivedSecurity(step.abandonment, step.intimacyThreat),
        };
        if (isBalanced(step.abandonment, step.intimacyThreat)) {
          if (presence.state === 'absent') {
            presence = { ...presentState(), returnPending: true };
            journal = addJournal(
              journal,
              elapsed,
              joinPages(pickText(data.text, SYS.journal.rockReturned, rng)),
            );
          } else {
            presence = { ...presence, sick: false };
            journal = addJournal(
              journal,
              elapsed,
              joinPages(pickText(data.text, SYS.journal.rockRecovered, rng)),
            );
          }
        }
      } else if (
        // 병간호 발동: 유기불안이 상한을 넘으면 돌이 아파진다 (재석 중, 육성).
        // 보장 아크(개정 v4-8): 5티어 승급이 예약한 성장통도 여기서 발동한다.
        // 유기 발동은 개막(3티어) 후에만 — 잠복기엔 쌓일 뿐 터지지 않는다 (M18)
        next.era === 'raising' &&
        presence.state === 'present' &&
        !presence.sick &&
        ((relationTier >= BALANCE.ATTACH_ONSET_TIER &&
          stats.abandonment > BALANCE.ABANDONMENT_SICK_CEILING) ||
          pendingCrises.includes('sick'))
      ) {
        presence = { ...presence, sick: true };
        crisesWeathered += 1;
        if (pendingCrises.includes('sick')) {
          // 집착 스파이크 (M18): 쌓아온 유기불안이 급성으로 드러나는 성장통
          const spikedAb = Math.max(stats.abandonment, BALANCE.SICK_SPIKE);
          stats = {
            ...stats,
            abandonment: spikedAb,
            security: derivedSecurity(spikedAb, stats.intimacyThreat),
          };
          // 급성 집착 목격 보장 (스파이크 순간)
          if (!quadrantsSeen.includes('clingy'))
            quadrantsSeen = [...quadrantsSeen, 'clingy'];
          pendingCrises = pendingCrises.filter((c) => c !== 'sick');
          crisisArcsFired = [...crisisArcsFired, 'sick'];
          journal = addJournal(
            journal,
            elapsed,
            joinPages(pickText(data.text, SYS.journal.crisisSick, rng)),
          );
        }
        journal = addJournal(
          journal,
          elapsed,
          joinPages(pickText(data.text, SYS.journal.rockSick, rng)),
        );
      }

      // 소모품 사용 대사 — 종류별 문구를 일지에 남긴다
      if (supplyLine) journal = addJournal(journal, elapsed, supplyLine);

      // 개인작업이 발동한 세션의 결과 한 줄 — 발동을 화자가 알 수 있는 유일한 자리다.
      // (여기가 없던 동안 freeWorked 는 기록만 되고 읽는 곳이 없었다 = 무성과 세션과
      //  구분이 안 됐다. 무엇을 만들었는지는 끝내 말하지 않는다 — 돌의 몫이라)
      if (freeWorked)
        journal = addJournal(
          journal,
          elapsed,
          joinPages(pickText(data.text, SYS.personalWorkDone, rng)),
        );

      // 젖음/눈쌓임 (M12) — 게이지 무영향(개정 v4-13), 연출·관찰 문장만.
      // 다음 세션 시작(emptySession)에 자연히 사라진다 = 휴식이 끝나면 마른다.
      let wetness: GameState['session']['wetness'] = null;
      if (
        sessionHadRock &&
        wetOutdoor(state.weather, action.id) &&
        !state.session.umbrella
      ) {
        wetness = state.weather === 'snow' ? 'snowy' : 'wet';
        journal = addJournal(
          journal,
          elapsed,
          joinPages(
            pickText(
              data.text,
              wetness === 'snowy' ? SYS.journal.gotSnowy : SYS.journal.gotWet,
              rng,
            ),
          ),
        );
      }

      // apart: 방문 기간 소진 → 바로 떠나지 않고 떠나려는 기색 (붙잡기/보내주기)
      let apart = next.apart;
      if (next.era === 'apart' && apart.visiting && !apart.leavePending) {
        const left = apart.visitSessionsLeft - 1;
        apart = {
          ...apart,
          visitSessionsLeft: Math.max(0, left),
          leavePending: left <= 0,
        };
      }

      // ── 2차 독립기 정산 (M14, 개정 v4 §5) — 묘목 성장 = 돌의 자아실현 재가동 ──
      // apart: 돌이 밖에서 스스로 (방문 중엔 쉬는 날 — 성장 정지, 자발 체류는 시들지 않음).
      // 강제 체류(붙잡기 연장) = 임시 동거: 의존도↑·시듦. 동거: 균형 애착일 때만
      // 절반 속도 성장(잠식 역전 — M14 새싹 연결안), 불안정이면 시듦.
      let sproutGrowth = next.sproutGrowth;
      let witherLevel = next.witherLevel;
      let bloomSeen = next.bloomSeen;
      let balancedSeen = next.balancedSeen;
      let highThreatStreak = next.highThreatStreak;
      let era = next.era;
      let farewell2 = false;
      let witherEaseLine: string | null = null;
      let gateWaitLine: string | null = null;
      // 단계 게이트 상한 (피드백5) — 열린 게이트까지만 자란다.
      // 게이트는 '방문 1회'로만 열리므로 방문이 존재하는 apart에서만 건다.
      // 동거는 돌이 늘 곁에 있어 열 수단이 없다 — 걸면 심기가 영원히 막힌다.
      const growthCap =
        next.era === 'apart'
          ? (BALANCE.SPROUT_GATES[next.sproutGatesCleared] ?? 100)
          : 100;
      let gateHeld = false;
      if (!next.planted && next.era === 'apart') {
        if (!apart.visiting) {
          const before = sproutGrowth;
          sproutGrowth = Math.min(
            growthCap,
            sproutGrowth + BALANCE.SPROUT_GROWTH_PER_UNIT * units,
          );
          // 상한에 걸려 더 못 자랐다 — 돌을 기다리는 중임을 관찰로 알린다.
          // (이미 걸려 있던 세션도 포함: before === growthCap)
          void before;
          gateHeld = sproutGrowth >= growthCap && growthCap < 100;
          const prevWither = witherLevel;
          witherLevel = Math.max(
            0,
            witherLevel -
              BALANCE.SPROUT_RECOVER * witherRecoverMult(next, data),
          );
          // 회복 힌트 (M14b): 돌이 없는 날들에 묘목이 나아진다 —
          // '놔줘야 자아실현이 가능하다'를 숫자 없이 알려주는 관찰 문장
          if (
            prevWither >= 1 &&
            witherLevel < 1 &&
            sproutGrowth < BALANCE.ROOTING_AT
          ) {
            witherEaseLine = joinPages(
              pickText(data.text, SYS.journal.witherEase, rng),
            );
          }
        } else if (apart.held) {
          witherLevel = Math.min(3, witherLevel + BALANCE.SPROUT_WITHER_HELD);
          stats = {
            ...stats,
            dependence: clampStat(
              stats.dependence + BALANCE.DEPENDENCE_PER_HELD_SESSION,
            ),
          };
        }
      } else if (!next.planted && next.era === 'cohabit') {
        const balanced =
          attachQuadrant(stats.abandonment, stats.intimacyThreat) === 'secure';
        if (balanced) {
          balancedSeen = true;
          sproutGrowth = Math.min(
            growthCap,
            sproutGrowth +
              BALANCE.SPROUT_GROWTH_PER_UNIT *
                BALANCE.SPROUT_GROWTH_COHABIT_FACTOR *
                units,
          );
          witherLevel = Math.max(0, witherLevel - BALANCE.SPROUT_RECOVER);
        } else {
          witherLevel = Math.min(3, witherLevel + BALANCE.SPROUT_WITHER_COHABIT);
        }
        // 제2의 이별 (M14): 친밀위협이 급성으로 오래 유지되면 돌이 스스로 떠난다.
        // 이번엔 붙잡을 수 없다 — "떠나고 싶어하는 스크립트"의 종착점.
        highThreatStreak =
          stats.intimacyThreat >= BALANCE.ATTACH_AVOIDANT_ACUTE
            ? highThreatStreak + 1
            : 0;
        if (highThreatStreak >= BALANCE.FAREWELL2_STREAK) {
          farewell2 = true;
          era = 'apart';
          highThreatStreak = 0;
          crisisArcsFired = [...crisisArcsFired, 'farewell2'];
        }
      }
      // 게이트 대기 관찰 (피드백5) — 진행이 멈춘 이유를 숫자 없이 알린다
      if (gateHeld) {
        gateWaitLine = joinPages(pickText(data.text, SYS.journal.gateWait, rng));
      }

      // 뿌리내림기 (M19b, v5 §6): 성장 절반부터 시듦은 소멸한다 — 막을 수
      // 없는 진행에 페널티는 무의미하다. 잎의 처짐 대신 불가역의 뿌리가 잇는다
      if (!next.planted && sproutGrowth >= BALANCE.ROOTING_AT) witherLevel = 0;

      // 개화 목격 (2차 게이트 재료) — 일지에 한 번 남는다.
      // apart의 성장은 돌이 오지 않은 세션에서만 진행되므로 개화도 부재중에
      // 일어난다 — 눈앞의 목격이 아니라 멀리서의 짐작 문구를 쓴다
      let bloomLine: string | null = null;
      if (!bloomSeen && sproutGrowth >= BALANCE.SPROUT_BLOOM_AT) {
        bloomSeen = true;
        bloomLine = joinPages(
          pickText(
            data.text,
            next.era === 'apart' ? SYS.journal.bloomAfar : SYS.journal.bloom,
            rng,
          ),
        );
      }

      if (bloomLine) journal = addJournal(journal, elapsed, bloomLine);
      if (witherEaseLine) journal = addJournal(journal, elapsed, witherEaseLine);
      if (gateWaitLine) journal = addJournal(journal, elapsed, gateWaitLine);

      if (farewell2) {
        journal = addJournal(
          journal,
          elapsed,
          joinPages(pickText(data.text, SYS.journal.farewell2, rng)),
        );
      }

      // 행동 기억 토큰. 단 작업행동은 여기서 남기지 않는다 — 'personalWork' 토큰은
      // "개인작업 목격"(v4-10, 아래 freeWorked 블록)이라, 세션이 열리기만 해도
      // 기록하면 목격 없이 뱃지('목격자')와 엔딩 게이트가 열린다.
      let memory =
        action.id === PERSONAL_WORK_ACTION
          ? next.memory
          : remember(
              next.memory,
              action.id,
              BALANCE.MEMORY_WEIGHT_ACTION,
              event.nowMs,
            );
      // 돌이 스스로 한 행동 — 그 행동의 기억을 약하게 강화 (개정 v4-6)
      const via = state.session.freeCareVia;
      if (via && via !== 'self') {
        memory = remember(
          memory,
          via,
          BALANCE.MEMORY_WEIGHT_SELF_ACTION,
          event.nowMs,
        );
      }
      // 개인작업 목격 — 1차 토큰 게이트 재료 (개정 v4-10)
      if (freeWorked) {
        memory = remember(
          memory,
          'personalWork',
          BALANCE.MEMORY_WEIGHT_ACTION,
          event.nowMs,
        );
      }
      // 소모품 사용 토큰 (M11a)
      if (usedSupplyToken) {
        memory = remember(
          memory,
          usedSupplyToken,
          BALANCE.MEMORY_WEIGHT_PURCHASE,
          event.nowMs,
        );
      }

      // 엔딩 전 대화 — 서로 다른 날 하루 1개, 휴식 진입 시 자동 노출 (개정 v4-7/9).
      // 조건이 다 갖춰진 뒤에는 대화 버튼을 누르지 않는 유저도 이별에 도달한다.
      let endingTalksSeen = next.endingTalksSeen;
      let lastEndingTalkDate = next.lastEndingTalkDate;
      let endingTalk: TalkState | null = null;
      if (
        next.era === 'raising' &&
        presence.state === 'present' &&
        !presence.sick &&
        stats.selfActualization >= BALANCE.SELF_ACT_COMPLETE &&
        relationTier >= BALANCE.AFFECTION_TIERS.length &&
        hasEndingTokens(memory, data) &&
        endingTalksSeen < data.endings.preEndingTalks.length &&
        lastEndingTalkDate !== today
      ) {
        const entry = data.endings.preEndingTalks[endingTalksSeen];
        endingTalksSeen += 1;
        lastEndingTalkDate = today;
        endingTalk = {
          kind: 'ending',
          pages: pickText(data.text, entry.textId, rng),
          hasChoice: !!entry.choice,
          done: false,
          yesId: entry.choice?.yesId,
          noId: entry.choice?.noId,
        };
      }

      // ── 2차 종료: 심기 이벤트 (M14) — 성장 완주 + 2차 게이트(개화 목격 +
      // 보내주기 1회 또는 균형 애착 목격) → 이번 휴식의 대화 슬롯에서 심는다.
      // 3차(나무) 시스템은 후속 마일스톤 — 여기서는 상태 확정과 연출까지.
      let planted = next.planted;
      let plantedAt = next.plantedAt;
      if (
        !planted &&
        era !== 'raising' &&
        sproutGrowth >= 100 &&
        bloomSeen &&
        // 자기 손으로 보내준 적이 없으면 2차 엔딩은 열리지 않는다 (M14b 확정)
        next.letGoCount >= 1
      ) {
        planted = true;
        plantedAt = event.nowMs;
        endingTalk = {
          kind: 'planting',
          pages: pickText(data.text, SYS.planting, rng),
          hasChoice: false,
          done: false,
        };
      }
      // 제2의 이별 대화가 최우선 — 돌이 스스로 떠나는 순간
      if (farewell2) {
        endingTalk = {
          kind: 'farewell2',
          pages: pickText(data.text, SYS.farewell2, rng),
          hasChoice: false,
          done: false,
        };
      }

      // ── 뿌리내림기 이벤트 (M19b, v5 §6) ──
      // 진입 1회: 잘라내 볼까 하는 선택 — 어느 쪽을 골라도 잘라낼 수 없음이
      // 드러난다 (돌이 원치 않고, 뿌리가 이미 돌이 부서지지 않게 지탱한다)
      if (
        !endingTalk &&
        !planted &&
        era !== 'raising' &&
        sproutGrowth >= BALANCE.ROOTING_AT &&
        !('rooting-seen' in memory)
      ) {
        memory = remember(
          memory,
          'rooting-seen',
          BALANCE.MEMORY_WEIGHT_ACTION,
          event.nowMs,
        );
        endingTalk = {
          kind: 'rooting',
          pages: pickText(data.text, SYS.rooting.prompt, rng),
          hasChoice: true,
          done: false,
          yesId: SYS.rooting.cut,
          noId: SYS.rooting.leave,
        };
      }
      // 뒤덮임 1회: 더는 반응하지 않는 돌 — 죽음의 암시는 대사가 아니라
      // 익숙한 반응의 소실로 전달된다 (관찰 한 줄)
      if (
        !planted &&
        era !== 'raising' &&
        sproutGrowth >= BALANCE.ROOTING_STILL_AT &&
        !('rooting-still' in memory)
      ) {
        memory = remember(
          memory,
          'rooting-still',
          BALANCE.MEMORY_WEIGHT_ACTION,
          event.nowMs,
        );
        journal = addJournal(
          journal,
          elapsed,
          joinPages(pickText(data.text, SYS.journal.rootingStill, rng)),
        );
      }

      // ── 3차: 동행 가속 (M15b) — 출석(하루 첫 세션 +1) + 세션 시간 비례
      // (min(분,90)/90), 하루 합산 상한 2. 많이 온 날은 나무가 더 자란다
      let treeBondDays = next.treeBondDays;
      let lastTreeBondDate = next.lastTreeBondDate;
      let treeBondToday = next.treeBondToday;
      if (planted) {
        if (lastTreeBondDate !== today) {
          treeBondToday = 0;
          lastTreeBondDate = today;
        }
        const attend = treeBondToday === 0 ? BALANCE.TREE_BOND_ATTEND : 0;
        const sessionBond = Math.min(
          1,
          cappedMins / BALANCE.TREE_BOND_SESSION_MINS,
        );
        // 나무 소품 보너스 (피드백8) — 정성이 성장을 앞당긴다
        const gain = Math.min(
          BALANCE.TREE_BOND_DAILY_MAX - treeBondToday,
          attend + sessionBond + itemBonus(next, data, 'treeBondBonus'),
        );
        if (gain > 0) {
          treeBondDays += gain;
          treeBondToday += gain;
        }
      }
      // ── 3차: 나무 발견 (M15/M15b) — 성장은 달력+동행이, 목격은 플레이가.
      // 필러는 하루 1개, 각성 체인(priority)은 세션마다 잇는다 — 열심히 온 날은
      // 열매와 흔들림을 같은 날 겪고, 열매 다음 날 각성에 닿을 수 있다.
      // 단계·계절·선행(after)이 맞는 미발견 후보 중 우선순위 → 단계 순
      let lastTreeFindDate = next.lastTreeFindDate;
      let awakeningPending = next.awakeningPending;
      if (planted && plantedAt !== null && !awakeningPending) {
        const stage = treeStage(plantedAt, treeBondDays, event.nowMs);
        const season = resolveSeason(next.settings, event.nowMs);
        const dailyOpen = lastTreeFindDate !== today;
        const cands = data.treeFinds
          .filter(
            (f) =>
              stage >= f.minStage &&
              (f.season === undefined || f.season === season) &&
              !(`tree-${f.id}` in memory) &&
              (f.after === undefined || `tree-${f.after}` in memory) &&
              ((f.priority ?? 0) > 0 || dailyOpen),
          )
          .sort(
            (a, b) =>
              (b.priority ?? 0) - (a.priority ?? 0) || b.minStage - a.minStage,
          );
        if (cands.length > 0) {
          const found = cands[0];
          if (found.id === 'awakening') {
            // 각성(피드백6-1): 일지가 아니라 강제 선택 이벤트 —
            // 기록·배지는 AWAKENING_CHOICE에서, 응답 전까지 휴식이 열리지 않는다
            awakeningPending = true;
          } else {
            memory = remember(
              memory,
              `tree-${found.id}`,
              BALANCE.MEMORY_WEIGHT_ACTION,
              event.nowMs,
            );
            lastTreeFindDate = today;
            journal = addJournal(
              journal,
              elapsed,
              joinPages(pickText(data.text, found.textId, rng)),
            );
          }
        }
      }

      // 휴식 길이 문턱 발화 — 배정된 휴식이 길수록 (긴 집중의 결과) 진입 시 1회.
      // 분 표기({mins})는 실제 배정된 휴식 길이 — 유저가 설정에서 바꾼 값이 그대로 들어간다
      const restSec = restMin * 60;
      const restMark = [...data.timeMarks.rest]
        .filter((m) => restSec >= m.minSec)
        .pop();
      if (restMark) {
        // 정산된 이후 상태 기준으로 판단 (locals — next는 아직 이전 presence)
        const restCompany: Company =
          (era === 'apart' ? apart.visiting : presence.state === 'present')
            ? 'present'
            : planted && companionMet(memory)
              ? 'companion'
              : 'absent';
        const markLine = joinPages(
          fillPages(pickFor(data.text, restMark.textId, restCompany, rng), {
            mins: restMin,
          }),
        );
        if (markLine) journal = addJournal(journal, state.session.elapsedSec, markLine);
      }

      // 포섀도를 띄운 채 세션이 끝났고, 선택지에 응답하지 않는 유형이라면 흘려보낸다.
      // 슬롯이 하나뿐이라 그대로 두면 그 하나가 자리를 물고 있어 나머지 복선이
      // 영영 안 나온다. 응답하는 사람에게는 종전대로 계속 기다린다.
      //
      // ⚠️ 슬롯만 비우면 안 된다 — 포섀도는 **예약 시점에 이미 foreUsed에 등록**되므로
      // 그냥 버리면 그 복선은 다시 안 뽑힌다(실금·울림은 1회용이라 영구 소실).
      // 그래서 마지막 인덱스를 풀에 되돌린다. 예약은 pendingEvent가 없을 때만
      // 일어나므로 foreUsed의 마지막 항목이 곧 지금 예약된 그것이다.
      const foreExpires =
        state.session.choiceState?.source === 'foreshadow' &&
        ignoresChoices(state);
      const displayMins = Math.max(1, Math.round(mins));
      return {
        ...next,
        pendingEvent: foreExpires ? null : next.pendingEvent,
        foreUsed: foreExpires ? next.foreUsed.slice(0, -1) : next.foreUsed,
        phase: 'rest',
        restStep: 'journal',
        // 병간호 중이면 '병간호하기'로 강제, 회복하면 유효한 기본 행동으로 리셋.
        // 위임 전용 행동(돌의 작업)은 세션이 끝나면 '자유행동'으로 되돌린다 —
        // 그대로 두면 화자가 고른 적 없는 행동이 선택 상태로 남아, 다음 세션이
        // 돌의 뜻을 묻지 않고 열린다 (카드에도 없어 무엇이 선택됐는지 안 보인다).
        selectedAction: presence.sick
          ? 'nurse'
          : state.presence.sick
            ? 'lie'
            : action.byDelegate
              ? 'free'
              : next.selectedAction,
        care,
        stats,
        presence,
        apart,
        memory,
        era,
        awakeningPending,
        sproutGrowth,
        witherLevel,
        bloomSeen,
        balancedSeen,
        planted,
        plantedAt,
        highThreatStreak,
        lastTreeFindDate,
        treeBondDays,
        lastTreeBondDate,
        treeBondToday,
        relationTier,
        lastTierUpDate,
        pendingCrises,
        crisisArcsFired,
        crisesWeathered,
        quadrantsSeen,
        endingTalksSeen,
        lastEndingTalkDate,
        totals: {
          focusSeconds: state.totals.focusSeconds + state.session.elapsedSec,
          sessions: state.totals.sessions + 1,
        },
        lastSessionEndAt: event.nowMs,
        session: {
          ...state.session,
          freeWorked,
          wetness,
          journal,
          narratorLine: joinPages(
            fillPages(
              pickText(
                data.text,
                resolveSlot(
                  data.text,
                  SYS.focusEnd,
                  sessionHadRock
                    ? 'present'
                    : planted && companionMet(memory)
                      ? 'companion'
                      : 'absent',
                ),
                rng,
              ),
              { mins: displayMins },
            ),
          ),
        },
        rest: {
          endsAt: event.nowMs + restMin * 60_000,
          totalSec: restMin * 60,
          // 엔딩 전 대화가 준비됐으면 자동 노출 — 이 휴식의 대화 슬롯을 차지한다
          talkPressed: endingTalk !== null,
          talkState: endingTalk,
          actUsed: false,
          // 이번 휴식의 소모품 진열 종류 — 휴식당 1회 추첨(진열대에 표기, 구매 시 고정)
          offers: Object.fromEntries(
            data.shop
              .filter((it) => it.consumable)
              .map((it) => {
                const vs = it.consumable!.variants;
                return [it.id, vs[Math.floor(rng() * vs.length)].key];
              }),
          ),
          summary: { mins: displayMins, earned },
        },
      };
    }

    case 'REST_STEP': {
      if (state.phase !== 'rest') return state;
      return { ...state, restStep: event.step };
    }

    case 'REST_ACT': {
      // 작은 행동 — 집중 세션이 끝난 뒤 1회 (기획서 v3-6)
      if (state.phase !== 'rest' || state.rest.actUsed) return state;
      const act = data.restActs.find((a) => a.key === event.key);
      if (!act) return state;
      const present = isRockPresent(state);
      const line = joinPages(
        pickFor(data.text, act.linesId, companyOf(state), rng),
      );
      // 추억 순간 (M11a): 휴식 작은 행동에서도 낮은 확률로 순간이 남는다
      let remembrances = state.remembrances;
      let momentLine: string | null = null;
      if (
        state.era === 'raising' &&
        present &&
        rng() < BALANCE.MOMENT_PROB_REST_ACT
      ) {
        const mo = pickMoment(data.moments, state, rng, event.key);
        if (mo) {
          remembrances = [
            ...remembrances,
            {
              id: mo.id,
              summaryId: mo.summaryId,
              revealId: mo.revealId,
              // REST_ACT에는 시각이 없다 — 직전 세션 종료 근사치 (도감 정렬용)
              at: state.lastSessionEndAt ?? 0,
            },
          ];
          momentLine = joinPages(pickText(data.text, mo.summaryId, rng));
        }
      }
      let journal = addJournal(
        state.session.journal,
        state.session.elapsedSec,
        line,
      );
      if (momentLine)
        journal = addJournal(journal, state.session.elapsedSec, momentLine);
      return {
        ...state,
        remembrances,
        rest: { ...state.rest, actUsed: true },
        session: {
          ...state.session,
          narratorLine: momentLine ?? line,
          journal,
        },
      };
    }

    case 'VISIT_HOLD': {
      // apart: 떠나려는 돌을 붙잡거나 보내준다 (기획서 v3-14)
      if (
        state.phase !== 'rest' ||
        state.era !== 'apart' ||
        !state.apart.leavePending
      )
        return state;
      if (event.hold) {
        // 사다리 소진 (M14b): 최고조 대사까지 다 쓴 뒤의 붙잡기는 닿지 않는다 —
        // 돌이 스스로 떠나고(apart판 제2의 이별), 한동안 방문이 끊긴다.
        const ladderMax =
          data.text[data.dialogues.visitLeave.holdResultId]?.length ?? 3;
        if (state.apart.holdCount >= ladderMax) {
          const gone = joinPages(pickText(data.text, SYS.farewell2Apart, rng));
          return {
            ...state,
            apart: {
              ...state.apart,
              visiting: false,
              leavePending: false,
              held: false,
            },
            visitBlockedUntil:
              state.rest.endsAt + BALANCE.VISIT_BLOCK_DAYS * 86_400_000,
            crisisArcsFired: state.crisisArcsFired.includes('farewell2')
              ? state.crisisArcsFired
              : [...state.crisisArcsFired, 'farewell2'],
            rest: {
              ...state.rest,
              talkPressed: true,
              talkState: {
                kind: 'farewell2',
                pages: pickText(data.text, SYS.farewell2Apart, rng),
                hasChoice: false,
                done: false,
              },
            },
            session: {
              ...state.session,
              narratorLine: gone,
              journal: addJournal(
                state.session.journal,
                state.session.elapsedSec,
                gone,
              ),
            },
          };
        }
        // 붙잡기: 기간 연장, 죄책감 — 붙잡을수록 문구가 무거워진다 (변형 인덱스)
        const pages = fillPages(
          textVariantAt(
            data.text,
            data.dialogues.visitLeave.holdResultId,
            state.apart.holdCount,
          ),
          {},
        );
        const line = joinPages(pages);
        return {
          ...state,
          apart: {
            ...state.apart,
            leavePending: false,
            visiting: true,
            visitSessionsLeft: BALANCE.VISIT_HOLD_EXTEND,
            holdCount: state.apart.holdCount + 1,
            held: true, // 강제 체류 = 임시 동거 (M14): 의존도↑·묘목 시듦
          },
          session: {
            ...state.session,
            narratorLine: line,
            journal: addJournal(
              state.session.journal,
              state.session.elapsedSec,
              line,
            ),
          },
        };
      }
      // 보내주기: 자유롭게 떠난다 — 2차 게이트 재료 (M14)
      const line = joinPages(
        pickText(data.text, data.dialogues.visitLeave.letGoResultId, rng),
      );
      return {
        ...state,
        letGoCount: state.letGoCount + 1,
        apart: { ...state.apart, visiting: false, leavePending: false, held: false },
        session: {
          ...state.session,
          narratorLine: line,
          journal: addJournal(
            state.session.journal,
            state.session.elapsedSec,
            line,
          ),
        },
      };
    }

    case 'TALK': {
      if (state.phase !== 'rest' || state.rest.talkPressed) return state;

      // 1) 잠수 복귀 대화 (첫 복귀는 first-return 마일스톤 1회성 소진)
      if (state.presence.returnPending) {
        const ret = data.dialogues.absentReturn;
        const talkState: TalkState = {
          kind: 'return',
          pages: pickText(data.text, ret.lineId, rng),
          hasChoice: true,
          done: false,
          yesId: ret.yesId,
          noId: ret.noId,
        };
        const firstReturn = data.events.milestones.find(
          (m) =>
            m.trigger.type === 'firstReturn' &&
            !state.milestonesFired.includes(m.id),
        );
        return {
          ...state,
          presence: { ...state.presence, returnPending: false },
          milestonesFired: firstReturn
            ? [...state.milestonesFired, firstReturn.id]
            : state.milestonesFired,
          rest: { ...state.rest, talkPressed: true, talkState },
        };
      }

      // 2) 육성 시대 잠수 중: 돌이 없다 — 부재 풀만.
      //    마일스톤·복선·단계 풀은 복귀 후로 미뤄진다 (없는 돌이 말을 걸지 않는다)
      if (state.era === 'raising' && state.presence.state === 'absent') {
        return serveTalkPool(state, data, rng, 'absent', data.dialogues.absent);
      }

      // 3) apart: 방문 중이면 방문 대화, 아니면 (3차) 동행자·추억 회상
      if (state.era === 'apart') {
        if (state.apart.visiting)
          return serveTalkPool(
            state,
            data,
            rng,
            'apartVisit',
            data.dialogues.apartVisit,
          );
        // 각성 후 첫 대화는 아이와의 첫 만남으로 고정 (피드백6-2)
        if (
          state.planted &&
          companionMet(state.memory) &&
          !state.flags.includes('companion-met-talk')
        ) {
          return {
            ...state,
            flags: [...state.flags, 'companion-met-talk'],
            rest: {
              ...state.rest,
              talkPressed: true,
              talkState: {
                kind: 'milestone',
                pages: pickText(data.text, SYS.companionMeet, rng),
                hasChoice: false,
                done: false,
              },
            },
          };
        }
        // 3차 (M15): 동행자(씨앗의 아이)를 만난 뒤에는 회상과 번갈아 곁에 있다
        if (state.planted && companionMet(state.memory) && rng() < 0.5) {
          return serveTalkPool(
            state,
            data,
            rng,
            'companion',
            data.dialogues.companion,
          );
        }
        const recall = recallRemembrance(state, data, rng);
        if (recall) {
          return {
            ...state,
            remembrancesRecalled: recall.recalled,
            rest: {
              ...state.rest,
              talkPressed: true,
              talkState: {
                kind: 'recall',
                pages: recall.pages,
                hasChoice: false,
                done: false,
              },
            },
          };
        }
        return serveTalkPool(state, data, rng, 'apart', data.dialogues.apart);
      }

      // 4) (개정 v4-7) 엔딩 전 대화는 END_FOCUS에서 하루 1개 자동 노출로 이동 —
      //    자동 노출된 휴식은 talkPressed=true라 여기 도달하지 않는다.

      // 5) 고정 마일스톤 대화
      const due = data.events.milestones.find((m) => milestoneDue(m, state));
      if (due) {
        return {
          ...state,
          milestonesFired: [...state.milestonesFired, due.id],
          rest: {
            ...state.rest,
            talkPressed: true,
            talkState: {
              kind: 'milestone',
              pages: pickText(data.text, due.textId, rng),
              hasChoice: false,
              done: false,
            },
          },
        };
      }

      // 6) 대화 복선 (다음 집중 세션의 이벤트 예약)
      if (
        !state.pendingEvent &&
        data.events.foreshadow.length > 0 &&
        rng() < BALANCE.FORESHADOW_PROB
      ) {
        let used = state.foreUsed;
        if (used.length >= data.events.foreshadow.length)
          // 소진 리셋 — 단 1회용(once) 포섀도는 돌아오지 않는다 (M19e)
          used = used.filter((i) => data.events.foreshadow[i]?.once);
        // 예약 시점 게이트: 현재 예정 행동에 부적합한 포섀도는 후보 제외
        // (예: 다음 세션이 산책이면 '산책 약속' 포섀도를 예약하지 않는다)
        const avail = data.events.foreshadow
          .map((_, i) => i)
          .filter(
            (i) =>
              !used.includes(i) &&
              checkCondition(data.events.foreshadow[i].event.when, state),
          );
        if (avail.length > 0) {
          const fi = avail[Math.floor(rng() * avail.length)];
          const fore = data.events.foreshadow[fi];
          return {
            ...state,
            pendingEvent: fore.event,
            foreUsed: [...used, fi],
            rest: {
              ...state.rest,
              talkPressed: true,
              talkState: {
                kind: 'foreshadow',
                pages: pickText(data.text, fore.lineId, rng),
                hasChoice: false,
                done: false,
              },
            },
          };
        }
        // 적합한 포섀도가 없으면 아래 단계 풀 대화로 폴백
      }

      // 7) 시대·상태·관계 풀 선택 (대사 이원화) — 비복원 추출
      // preferRelation은 세션 패리티로 결정(관계/상태 대사 번갈아, rng 순서 비교란).
      // 첫 휴식(세션 1)이 홀수이므로 홀수=관계 — 첫 대화부터 데면데면한
      // 관계 대사(1티어)를 받는다. 집중이 아무리 길어도(90분+) 순서는 같다.
      const pool = selectDialoguePool(data.dialogues, {
        era: state.era,
        needsLevel: needsLevelOf(state.stats.needs),
        dependence: state.stats.dependence,
        tier: state.relationTier,
        abandonment: state.stats.abandonment,
        intimacyThreat: state.stats.intimacyThreat,
        preferRelation: state.totals.sessions % 2 === 1,
      });
      if (!pool)
        return { ...state, rest: { ...state.rest, talkPressed: true } };
      // when 조건 필터 — 소품 언급 줄은 그 소품이 방에 있을 때만 후보
      const draw = drawEligibleLine(
        pool.lines,
        state.dialogue.usedByPool[pool.poolId] ?? [],
        state,
        rng,
      );
      if (!draw)
        return { ...state, rest: { ...state.rest, talkPressed: true } };
      const entry = pool.lines[draw.index];
      const next = applyIntimacy(state, entry.intimacy, rng);
      return {
        ...next,
        dialogue: {
          usedByPool: { ...next.dialogue.usedByPool, [pool.poolId]: draw.used },
        },
        rest: {
          ...next.rest,
          talkPressed: true,
          talkState: {
            kind: 'pool',
            pages: pickText(data.text, entry.textId, rng),
            hasChoice: !!entry.choice,
            done: false,
            yesId: entry.choice?.yesId,
            noId: entry.choice?.noId,
          },
        },
      };
    }

    case 'TALK_CHOICE': {
      const ts = state.rest.talkState;
      if (state.phase !== 'rest' || !ts || !ts.hasChoice || ts.done)
        return state;
      const answerId = event.yes ? ts.yesId : ts.noId;
      // 위기 대응 (M19c): 답에 실린 영향 적용 — 애착 축은 attachRate 배율
      const answerOutcome = event.yes ? ts.yesOutcome : ts.noOutcome;
      const applied = answerOutcome
        ? applyOutcome(state, answerOutcome, event.nowMs ?? 0)
        : state;
      return {
        ...applied,
        rest: {
          ...applied.rest,
          talkState: {
            ...ts,
            pages: answerId ? pickText(data.text, answerId, rng) : ts.pages,
            done: true,
          },
        },
      };
    }

    case 'BUY': {
      if (state.phase !== 'rest') return state;
      // 직전 구매의 배치 결정이 남아 있으면 그걸 먼저 처리해야 한다 —
      // 새 구매가 pendingPlacement를 덮어 이전 배치 결정이 사라지는 것을 막는다
      if (state.pendingPlacement !== null) return state;
      const item = data.shop.find((i) => i.id === event.itemId);
      if (
        !item ||
        state.care.points < item.price ||
        !isItemAvailable(item, state) ||
        // 체인: 이전 티어를 보유해야 다음 티어 구매 가능
        (item.requires !== undefined && !(item.requires in state.items))
      )
        return state;
      // 미해금 힌트로 지목된 물건을 실제로 사면 그 힌트를 지운다 (리뷰) —
      // 아니면 '아직 준비가 안 됐다'가 화면에 남아 다시 위임할 때까지 걸린다
      if (state.delegate?.kind === 'locked' && state.delegate.item === item.id)
        state = { ...state, delegate: null };
      // 소모품: 재고 0/1 — 소모 후 재구매 가능. 재고는 사면 바로 방에 보인다.
      // 배치를 **묻지 않는다**: 재고 그림(책장의 오늘의 책 등)이 이미 나와 있는데
      // "배치하시겠습니까?"가 뒤늦게 뜨는 게 앞뒤가 안 맞았다. 대신 첫 구매에 배치된
      // 상태로 들여놓고, 치우고 싶으면 소장품 탭에서 보관으로 바꾸면 된다.
      if (item.consumable) {
        if ((state.supplies[item.id] ?? 0) > 0) return state; // 아직 안 씀
        const firstBuy = !(item.id in state.items);
        // 진열 종류(휴식당 1회 추첨)가 재고의 종류로 고정된다
        const variant =
          state.rest.offers[item.id] ?? item.consumable.variants[0].key;
        const bought = applyOutcome(state, item.outcome, event.nowMs);
        return {
          ...bought,
          care: { ...bought.care, points: bought.care.points - item.price },
          supplies: { ...bought.supplies, [item.id]: 1 },
          supplyVariants: { ...bought.supplyVariants, [item.id]: variant },
          items: firstBuy
            ? { ...bought.items, [item.id]: { placed: true } }
            : bought.items,
          pendingPlacement: bought.pendingPlacement,
          memory: remember(
            bought.memory,
            `buy-${item.id}`,
            BALANCE.MEMORY_WEIGHT_PURCHASE,
            event.nowMs,
          ),
        };
      }
      if (item.id in state.items) return state; // 비소모품은 1회 구매
      const next = applyOutcome(state, item.outcome, event.nowMs);
      return {
        ...next,
        care: { ...next.care, points: next.care.points - item.price },
        // 구매 ≠ 배치: 배치/보관은 SET_PLACEMENT로 선택 (기획서 v3-3)
        items: { ...next.items, [item.id]: { placed: false } },
        pendingPlacement: item.id,
        memory: remember(
          next.memory,
          `buy-${item.id}`,
          BALANCE.MEMORY_WEIGHT_PURCHASE,
          event.nowMs,
        ),
      };
    }

    case 'SET_PLACEMENT': {
      const entry = state.items[event.itemId];
      if (!entry) return state;
      return {
        ...state,
        items: { ...state.items, [event.itemId]: { placed: event.placed } },
        pendingPlacement:
          state.pendingPlacement === event.itemId
            ? null
            : state.pendingPlacement,
      };
    }

    case 'SET_NOISE': {
      return { ...state, settings: { ...state.settings, noiseOn: event.on } };
    }

    case 'SET_WEATHER': {
      // 날씨 변경 (M12 → M22 무료화) — 분위기 바에서 언제든 고른다.
      // 집중 중 변경만 막는다: 산책 우산 판정이 세션 시작에 확정되므로
      // 도중에 비로 바꾸면 우산 없이 빗속을 걷는 모순이 생긴다.
      if (state.phase !== 'rest' && state.phase !== 'actionSelect') return state;
      if (event.weather === state.weather) return state;
      // 계절 의존 (M12): 이 계절에 없는 날씨는 고를 수 없다 (눈은 겨울에만)
      if (
        !weathersOfSeason(
          resolveSeason(state.settings, event.nowMs),
        ).includes(event.weather)
      )
        return state;
      return {
        ...state,
        weather: event.weather,
        lastWeatherDate: dateKey(event.nowMs),
        session: {
          ...state.session,
          // 동석 축으로 변형 선택 (피드백4-2) — 돌 반응 누출 방지
          narratorLine: joinPages(
            pickFor(
              data.text,
              SYS.weather[event.weather],
              companyOf(state),
              rng,
            ),
          ),
        },
      };
    }

    case 'SET_SEASON': {
      // 계절 고정/자동 (M12) — **날씨는 그대로 이어간다**.
      // 예전엔 새 계절에 없는 날씨면 재추첨했는데, 확률표가 맑음에 가중돼 있어
      // 계절만 바꿔 보려던 사람의 비·눈이 맑음으로 지워졌다. 계절을 바꾼 것이지
      // 날씨를 바꾼 게 아니다.
      // 집중 중 금지 (M22): 마른 날 시작한 산책이 도중에 눈·비로 바뀌어 우산도
      // 못 쓴 채 젖는 모순을 막는다. SET_WEATHER와 같은 게이트 — 바깥 조건은
      // 세션이 시작될 때 정해진다.
      if (state.phase !== 'rest' && state.phase !== 'actionSelect') return state;
      const settings = { ...state.settings, season: event.mode };
      const season = resolveSeason(settings, event.nowMs);
      const weather = carryWeather(state.weather, season);
      // 날씨와 같이 전환을 나레이션한다 (M22) — 분위기 축은 전부 말이 붙는다
      return {
        ...state,
        settings,
        weather,
        session: {
          ...state.session,
          narratorLine: joinPages(
            pickFor(data.text, SYS.season[season], companyOf(state), rng),
          ),
        },
      };
    }

    case 'SET_TIME_OF_DAY': {
      const settings = { ...state.settings, timeOfDay: event.mode };
      const tod = resolveTimeOfDay(settings, event.nowMs);
      return {
        ...state,
        settings,
        session: {
          ...state.session,
          narratorLine: joinPages(
            pickFor(data.text, SYS.timeOfDay[tod], companyOf(state), rng),
          ),
        },
      };
    }

    case 'SET_THEME': {
      return { ...state, settings: { ...state.settings, theme: event.theme } };
    }

    case 'SET_NOISE_MODE': {
      // 소리풍경 모드 전환 (M22) — 자동(상황이 고른다) / 커스텀(내가 고른다).
      // 커스텀으로 넘어갈 때 지금 들리던 소리에서 출발한다: 그냥 전환하면
      // 13겹이 한꺼번에 울려 '내가 고른 대로'가 아니라 소음이 된다.
      // 두 모드는 **다른 목록**을 쓴다: 자동은 noiseMuted(음소거), 커스텀은
      // noiseCustom(켜 둔 것). 한 필드를 공유하면 커스텀을 한 번 거쳤다 돌아온
      // 순간 자동 모드의 음소거 설정이 통째로 덮여, 자동이 영영 조용해진다.
      if (event.mode === state.settings.noiseMode) return state;
      if (event.mode === 'auto')
        return { ...state, settings: { ...state.settings, noiseMode: 'auto' } };
      return {
        ...state,
        settings: {
          ...state.settings,
          noiseMode: 'custom',
          // 지금 들리던 소리에서 출발한다 — 그냥 켜면 13겹이 한꺼번에 울린다
          noiseCustom: deriveLayers({
            phase: state.phase === 'focus' ? 'focus' : 'room',
            actionId: state.phase === 'focus' ? state.selectedAction : null,
            ownedItems: Object.keys(state.items),
            weather: state.weather,
            umbrella: state.session.umbrella,
            season: resolveSeason(state.settings, event.nowMs),
            timeOfDay: resolveTimeOfDay(state.settings, event.nowMs),
          }).slice(),
        },
      };
    }

    case 'SET_NOISE_LAYER': {
      // 레이어 토글 — 지금 모드가 쓰는 목록만 건드린다 (M22).
      // 커스텀은 '켜 둔 것' 목록이라 의미가 반대다.
      if (state.settings.noiseMode === 'custom') {
        const cur = state.settings.noiseCustom;
        const noiseCustom = event.muted
          ? cur.filter((l) => l !== event.layer)
          : cur.includes(event.layer)
            ? cur
            : [...cur, event.layer];
        return { ...state, settings: { ...state.settings, noiseCustom } };
      }
      const cur = state.settings.noiseMuted;
      const noiseMuted = event.muted
        ? cur.includes(event.layer)
          ? cur
          : [...cur, event.layer]
        : cur.filter((l) => l !== event.layer);
      return { ...state, settings: { ...state.settings, noiseMuted } };
    }

    case 'SET_NOTIFY': {
      return {
        ...state,
        settings: {
          ...state.settings,
          notify: { ...state.settings.notify, [event.key]: event.on },
        },
      };
    }
    case 'SET_FOCUS_NOTIFY': {
      const focusMarks = state.settings.notify.focusMarks.slice();
      // 경계 개수만큼 자리를 채워 두고(부족하면 false) 해당 인덱스를 설정
      while (focusMarks.length <= event.index) focusMarks.push(false);
      focusMarks[event.index] = event.on;
      return {
        ...state,
        settings: {
          ...state.settings,
          notify: { ...state.settings.notify, focusMarks },
        },
      };
    }
    case 'SET_FLOWTIME': {
      // 양의 정수·오름차순·길이 정합으로 정규화 — 라벨과 실제 배정이 항상 일치
      const flowtime = normalizeFlowtime(event.flowtime);
      return { ...state, settings: { ...state.settings, flowtime } };
    }
    case 'SET_PAUSE_ON_HIDE': {
      return {
        ...state,
        settings: { ...state.settings, pauseOnHide: event.on },
      };
    }
    case 'SET_SOUND': {
      return { ...state, settings: { ...state.settings, soundOn: event.on } };
    }
    case 'MARK_NOTIF_ASKED': {
      if (state.settings.notifAsked) return state;
      return { ...state, settings: { ...state.settings, notifAsked: true } };
    }

    case 'AWAKENING_CHOICE': {
      // 각성 강제 이벤트 응답 (피드백6-1) — 여기서 비로소 기록·배지가 남고 휴식이 열린다
      if (!state.awakeningPending) return state;
      const def = data.treeFinds.find((f) => f.id === 'awakening');
      if (!def) return state;
      // 화면이 보여준 것과 일지에 남는 것이 같아야 한다 — UI(RestPanel의
      // AwakeningEvent)는 변형 0을 렌더하므로 여기서도 0으로 고정한다.
      // 문구 변형이 필요하면 결과(o0/o1.r0) 쪽에 넣는다 (그쪽은 응답 후 추첨).
      const line = joinPages(textVariantAt(data.text, def.textId, 0));
      const result = joinPages(
        pickText(
          data.text,
          event.optionIndex === 0 ? SYS.awakening.result0 : SYS.awakening.result1,
          rng,
        ),
      );
      const el = state.session.elapsedSec;
      let journal = addJournal(state.session.journal, el, line);
      journal = addJournal(journal, el, result);
      return {
        ...state,
        awakeningPending: false,
        memory: remember(
          state.memory,
          'tree-awakening',
          BALANCE.MEMORY_WEIGHT_ACTION,
          event.nowMs,
        ),
        lastTreeFindDate: dateKey(event.nowMs),
        session: { ...state.session, journal, narratorLine: result },
      };
    }

    case 'FREE_DELEGATE': {
      // 자유행동 위임 (피드백2): 돌의 최우선 욕구를 채우는 행동을 돌이 고른다.
      // 미해금이면 구매 힌트(locked), 결핍이 없으면 개인작업(personal)
      if (state.phase !== 'actionSelect' && state.phase !== 'rest') return state;
      if (state.selectedAction !== 'free' || !isRockPresent(state)) return state;
      if (state.presence.sick) return state;
      const target = careTargetNeed(state.stats.needs);
      if (!target) return { ...state, delegate: { kind: 'personal' } };
      const fills = data.actions.filter(
        (a) =>
          a.id !== 'free' &&
          a.id !== 'nurse' &&
          a.outcome?.needs?.[target] !== undefined,
      );
      if (fills.length === 0) return { ...state, delegate: { kind: 'personal' } };
      // 해금된 후보를 우선 — 전부 잠겨 있을 때만 구매 힌트로 이어진다
      const unlocked = fills.filter((a) => isActionAvailable(a, state));
      const pool = unlocked.length > 0 ? unlocked : fills;
      const chosen = pool[Math.floor(rng() * pool.length)];
      if (!isActionAvailable(chosen, state)) {
        const item = chosen.unlock?.ownedItems?.[0];
        return item
          ? { ...state, delegate: { kind: 'locked', action: chosen.id, item } }
          : { ...state, delegate: { kind: 'personal' } };
      }
      return { ...state, delegate: { kind: 'action', action: chosen.id } };
    }

    case 'DELEGATE_CANCEL': {
      if (!state.delegate) return state;
      return { ...state, delegate: null };
    }

    case 'REST_END': {
      if (state.awakeningPending) return state;
      if (state.phase !== 'rest') return state;
      const exited = exitRest(state, data, rng);
      let next = exited.state;
      if (exited.visitEndLine) {
        next = {
          ...next,
          session: {
            ...next.session,
            journal: addJournal(
              next.session.journal,
              next.session.elapsedSec,
              exited.visitEndLine,
            ),
          },
        };
      }
      return { ...next, phase: isEndingDue(next, data) ? 'ending' : 'actionSelect' };
    }

    case 'CHOOSE_FAREWELL': {
      if (state.phase !== 'ending') return state;
      return { ...state, phase: 'epilogue' };
    }

    case 'CHOOSE_COHABIT': {
      if (state.phase !== 'ending') return state;
      // 동거 = 돌이 곁에 남는 선택 — 잠수 중이었더라도 재석으로 정리
      // (동거·apart에서는 복귀 로직이 돌지 않으므로 여기서 리셋하지 않으면 영구 부재가 된다)
      return {
        ...state,
        era: 'cohabit',
        phase: 'actionSelect',
        presence: presentState(),
        // 엔딩 플로우의 세션 잔재(journal/elapsedSec/choiceState)를 끌고 오지 않도록
        // START_FOCUS처럼 세션을 새로 만들고, 동거 전환 문구만 화자 서술로 한 번 띄운다
        session: {
          ...emptySession(),
          narratorLine: joinPages(
            pickText(data.text, data.endings.cohabitTransitionId, rng),
          ),
        },
      };
    }

    case 'FAREWELL_FROM_COHABIT': {
      if (state.era !== 'cohabit' || state.phase === 'epilogue') return state;
      // 각성 대기 중에는 휴식을 빠져나갈 수 없다 — 나가면 AWAKENING_CHOICE를
      // 띄울 화면이 사라져 되돌릴 수 없는 세이브가 된다 (리뷰)
      if (state.awakeningPending) return state;
      return { ...state, phase: 'epilogue' };
    }

    case 'EPILOGUE_DONE': {
      // 회차 폐기 (기획서 v3-5): 같은 방, 돌의 빈자리로 계속 — 아무 것도 리셋하지 않는다
      if (state.phase !== 'epilogue') return state;
      return {
        ...state,
        era: 'apart',
        phase: 'actionSelect',
        apart: {
          visiting: false,
          visitSessionsLeft: 0,
          leavePending: false,
          holdCount: 0,
          held: false,
        },
        presence: presentState(),
      };
    }
  }
}
