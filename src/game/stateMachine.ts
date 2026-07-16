import { BALANCE } from './balance';
import type {
  ActionId,
  ChoiceOptionData,
  GameEvent,
  GameState,
  JournalEntry,
  NeedId,
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
import { personalWorkProb, pickFreeAction } from './freeAction';
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
  convergeStep,
  derivedSecurity,
  intimacyOutcome,
  isBalanced,
} from './security';
import { presentState, startAbsence } from './absence';
import {
  applyOutcome,
  checkCondition,
  pickChoiceOutcome,
  recordRemembrance,
} from './outcomes';
import { randInt } from './rng';
import { fillPages, pickText, textVariantAt, SYS } from './text';

export interface TransitionCtx {
  rng: Rng;
  data: GameData;
}

export const SCHEMA_VERSION = 12;

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
    },
    memory: {},
    remembrances: [],
    remembrancesRecalled: [],
    dialogue: { usedByPool: {} },
    pendingEvent: null,
    foreUsed: [],
    endingTalksSeen: 0,
    lastEndingTalkDate: null,
    relationTier: 1,
    lastTierUpDate: null,
    pendingCrisis: null,
    crisisArcsFired: [],
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
    timeMarksFired: [],
    supply: null,
    freeCare: null,
    freeCareVia: null,
    freeWorked: false,
    restMult: 1,
  };
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

export function isActionAvailable(action: ActionData, state: GameState): boolean {
  // 병간호 상태: '병간호하기'만 가능 (돌이 아파 다른 행동을 받지 못한다)
  if (state.presence.sick) return action.id === 'nurse';
  if (action.id === 'nurse') return false; // 병간호는 평소엔 숨김
  return isActionUnlocked(action, state);
}

export function isItemAvailable(item: ShopItemData, state: GameState): boolean {
  return (
    state.unlockedItems.includes(item.id) || checkCondition(item.unlock, state)
  );
}

/** 돌이 지금 곁에 있는가 (잠수·apart 통합 판정) */
export function isRockPresent(state: GameState): boolean {
  if (state.era === 'apart') return state.apart.visiting;
  return state.presence.state === 'present';
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

function applyIntimacy(state: GameState, intimacy: number, rng: Rng): GameState {
  if (state.era !== 'raising' || state.presence.state === 'absent') return state;
  const { abandonment, intimacyThreat } = state.stats;
  const oc = intimacyOutcome(abandonment, intimacyThreat, intimacy, rng);
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
    next = { ...next, presence: startAbsence(rng) };
  }
  return next;
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
  next = recordRemembrance(next, picked.remembrance, nowMs);
  const text = joinPages(pickText(data.text, picked.resultId, rng));
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
  return {
    pages: [
      ...pickText(data.text, picked.summaryId, rng),
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
 * 전부 분기 내 상시 획득 가능한 것만 — 퇴화 플레이 차단용, 페이싱 영향 0.
 */
export function hasEndingTokens(
  memory: GameState['memory'],
  data: GameData,
): boolean {
  return (
    data.actions.every((a) => a.id === 'nurse' || a.id in memory) &&
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
      apart: { ...state.apart, visiting: false, leavePending: false },
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
      },
    },
  };
}

export function transition(
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
      return {
        ...state,
        stats: settled.stats,
        lastDecayDate: settled.lastDecayDate,
      };
    }

    case 'SELECT_ACTION': {
      if (state.phase !== 'actionSelect' && state.phase !== 'rest') return state;
      const action = actionOf(data, event.actionId);
      if (!action || !isActionAvailable(action, state)) return state;
      return { ...state, selectedAction: event.actionId };
    }

    case 'START_FOCUS': {
      if (state.phase !== 'actionSelect' && state.phase !== 'rest') return state;
      const action = actionOf(data, state.selectedAction);
      if (!action) return state;
      // 선택된 행동이 지금 가용한지 검증 — 회복 후 남은 'nurse'나
      // 마이그레이션으로 잠긴 행동으로 세션이 시작되는 것을 막는다.
      if (!isActionAvailable(action, state)) return state;

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
        arcState.pendingCrisis === 'retreat' &&
        arcState.presence.state === 'present' &&
        !arcState.presence.sick
      ) {
        arcState = {
          ...arcState,
          presence: startAbsence(rng),
          pendingCrisis: null,
          crisisArcsFired: [...arcState.crisisArcsFired, 'retreat'],
        };
        crisisLine = joinPages(pickText(data.text, SYS.journal.crisisRetreat, rng));
      }

      let next = applyIntimacy(arcState, action.intimacy, rng);
      let visitJournal: string | null = null;

      // apart: 돌이 놀러올 확률 — 오면 며칠(1~N세션) 머문다
      if (next.era === 'apart' && !next.apart.visiting) {
        if (rng() < BALANCE.VISIT_PROB) {
          next = {
            ...next,
            apart: {
              ...next.apart,
              visiting: true,
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
        }
      }

      const present = isRockPresent(next);

      // 소모품 소모: 이 행동(자유행동이면 개인작업)을 강화하는 소모품 재고가 있으면
      // 세션 시작 시 1개 소모하고 종류는 구매 시(진열) 고정분을 쓴다.
      // 돌이 곁에 있을 때만 — 부재 세션에서 재고가 증발하거나
      // 돌 반응 대사(사용 서술)가 새는 것을 막는다.
      const boostTarget = action.id === 'free' ? 'personalWork' : action.id;
      const consumableItem = present
        ? data.shop.find(
            (i) =>
              i.consumable &&
              i.boosts === boostTarget &&
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
      const startLine = present
        ? joinPages(pickText(data.text, action.startLineId, rng))
        : joinPages(pickText(data.text, SYS.journal.sessionStartAbsent, rng));
      let journal: JournalEntry[] = [];
      // '돌이 떠났다' 기록은 새 세션 일지 맨 앞에 보존한다
      if (exited.visitEndLine) journal = addJournal(journal, 0, exited.visitEndLine);
      if (crisisLine) journal = addJournal(journal, 0, crisisLine);
      journal = addJournal(journal, 0, startLine);
      if (visitJournal) journal = addJournal(journal, 0, visitJournal);
      const absentAmb = data.text[SYS.absentAmbient]?.[0];
      return {
        ...next,
        phase: 'focus',
        session: {
          ...emptySession(),
          supply,
          narratorLine: crisisLine
            ? crisisLine
            : present
              ? startLine
              : joinPages(absentAmb ?? [startLine]),
          journal,
          // 직전 휴식 준수 배율 — 이번 세션의 게이지 정산에 곱한다 (개정 v4-4)
          restMult: restComplianceMult(state, event.nowMs),
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
      let next: GameState = { ...state, session: { ...s, elapsedSec: el } };

      // 1) 화자 관찰 로테이션 — 카탈로그 변형을 순서대로 순환
      // 선택지가 떠 있어도 서술은 계속 흐른다(선택지는 아래 별도 박스로 남는다)
      const ambientVariants =
        data.text[present ? action.ambientId : SYS.absentAmbient] ?? [];
      if (ambientVariants.length > 0) {
        const wantIdx =
          Math.floor(el / BALANCE.AMBIENT_ROTATE_SEC) % ambientVariants.length;
        if (wantIdx !== next.session.ambIdx) {
          next = {
            ...next,
            session: {
              ...next.session,
              ambIdx: wantIdx,
              narratorLine: joinPages(ambientVariants[wantIdx]),
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

        if (next.era === 'apart' && !next.apart.visiting) {
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
          const availableIds = (filter: (a: (typeof data.actions)[number]) => boolean) =>
            data.actions
              .filter(
                (a) =>
                  a.id !== 'free' &&
                  a.id !== 'nurse' &&
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
        const showAsNarrator = action.id === 'free' && present && !timeMarkFiring;
        next = {
          ...next,
          memory,
          stats,
          remembrancesRecalled: recalled,
          session: {
            ...next.session,
            lastReflectAtSec: el,
            freeCare: next.session.freeCare ?? careNowNeed,
            freeCareVia: next.session.freeCareVia ?? careNowVia,
            journal:
              line && !timeMarkFiring
                ? addJournal(next.session.journal, el, line)
                : next.session.journal,
            narratorLine:
              showAsNarrator && line ? line : next.session.narratorLine,
          },
        };
      }

      // 5) 시간 문턱 발화 — 집중이 길어질수록 문턱별 1회 (기획서 요청)
      // 분 표기는 문구에 박지 않고 문턱값({mins})을 채운다 — 데이터 수정에도 어긋나지 않게
      data.timeMarks.focus.forEach((mark, i) => {
        if (el >= mark.minSec && !next.session.timeMarksFired.includes(i)) {
          const markLine = joinPages(
            fillPages(pickText(data.text, mark.textId, rng), {
              mins: Math.round(mark.minSec / 60),
            }),
          );
          next = {
            ...next,
            session: {
              ...next.session,
              timeMarksFired: [...next.session.timeMarksFired, i],
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
      // 개인작업 판정은 여기서 세션당 1회 — 확률·획득 모두 시간 비례 (개정 v4-3):
      //   p = (기본 + 욕구평균 비례 + 아이템 가산) × min(집중분,90)/90
      // 짧은 세션은 기대값이 그만큼 작아 스팸이 무의미하고, 책상 체인 확률 노브가 살아난다.
      let freeWorked = false;
      if (action.id === 'free') {
        const freeCareNeed = state.session.freeCare;
        if (freeCareNeed)
          addBonus({ [freeCareNeed]: BALANCE.FREE_SELF_CARE_GAIN * gainUnits });
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
      if (supplyUse) {
        const it = data.shop.find((i) => i.id === supplyUse.itemId);
        if (it?.boosts === 'personalWork' && !freeWorked) {
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
      let pendingCrisis = next.pendingCrisis;
      let crisisArcsFired = next.crisisArcsFired;
      if (
        next.era === 'raising' &&
        affectionTier(stats.affection) > relationTier &&
        lastTierUpDate !== today
      ) {
        relationTier += 1;
        lastTierUpDate = today;
        // 보장 위기 아크 예약 (개정 v4-8): 3티어 = 잠수, 5티어 = 병간호(성장통)
        if (relationTier === 3 && !crisisArcsFired.includes('retreat'))
          pendingCrisis = 'retreat';
        if (relationTier === 5 && !crisisArcsFired.includes('sick'))
          pendingCrisis = 'sick';
      }

      // 약한 애착 표류 (개정 v4-8): 깊어진 관계 + 휴식 스킵이 유기불안을 서서히 쌓는다.
      // 접근의 진정(−3)이 상쇄하므로 성실 플레이어는 체감 0 — 무심·스킵만 위기로 간다.
      if (
        next.era === 'raising' &&
        next.presence.state === 'present' &&
        !next.presence.sick
      ) {
        const drift =
          BALANCE.ATTACH_DRIFT_PER_TIER * relationTier +
          (restMult < 1 ? BALANCE.ATTACH_DRIFT_ON_SKIP : 0);
        const ab = clampStat(stats.abandonment + drift);
        stats = {
          ...stats,
          abandonment: ab,
          security: derivedSecurity(ab, stats.intimacyThreat),
        };
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
        next.era === 'raising' &&
        presence.state === 'present' &&
        !presence.sick &&
        (stats.abandonment > BALANCE.ABANDONMENT_SICK_CEILING ||
          pendingCrisis === 'sick')
      ) {
        presence = { ...presence, sick: true };
        if (pendingCrisis === 'sick') {
          pendingCrisis = null;
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

      let memory = remember(
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

      // 휴식 길이 문턱 발화 — 배정된 휴식이 길수록 (긴 집중의 결과) 진입 시 1회.
      // 분 표기({mins})는 실제 배정된 휴식 길이 — 유저가 설정에서 바꾼 값이 그대로 들어간다
      const restSec = restMin * 60;
      const restMark = [...data.timeMarks.rest]
        .filter((m) => restSec >= m.minSec)
        .pop();
      if (restMark) {
        const markLine = joinPages(
          fillPages(pickText(data.text, restMark.textId, rng), { mins: restMin }),
        );
        if (markLine) journal = addJournal(journal, state.session.elapsedSec, markLine);
      }

      const displayMins = Math.max(1, Math.round(mins));
      return {
        ...next,
        phase: 'rest',
        restStep: 'journal',
        // 병간호 중이면 '병간호하기'로 강제, 회복하면 유효한 기본 행동으로 리셋
        selectedAction: presence.sick
          ? 'nurse'
          : state.presence.sick
            ? 'lie'
            : next.selectedAction,
        care,
        stats,
        presence,
        apart,
        memory,
        relationTier,
        lastTierUpDate,
        pendingCrisis,
        crisisArcsFired,
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
          journal,
          narratorLine: joinPages(
            fillPages(
              pickText(
                data.text,
                sessionHadRock ? SYS.focusEnd : SYS.focusEndAbsent,
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
      // 돌이 없으면(잠수/빈자리) 부재 전용 문구 — 돌 언급 누출 방지
      const linesId = isRockPresent(state) ? act.linesId : act.absentLinesId;
      const line = joinPages(pickText(data.text, linesId, rng));
      return {
        ...state,
        rest: { ...state.rest, actUsed: true },
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

    case 'VISIT_HOLD': {
      // apart: 떠나려는 돌을 붙잡거나 보내준다 (기획서 v3-14)
      if (
        state.phase !== 'rest' ||
        state.era !== 'apart' ||
        !state.apart.leavePending
      )
        return state;
      if (event.hold) {
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
          },
          stats: {
            ...state.stats,
            mood: clampStat(state.stats.mood - BALANCE.HOLD_GUILT_MOOD),
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
      // 보내주기: 자유롭게 떠난다
      const line = joinPages(
        pickText(data.text, data.dialogues.visitLeave.letGoResultId, rng),
      );
      return {
        ...state,
        apart: { ...state.apart, visiting: false, leavePending: false },
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

      // 3) apart: 방문 중이면 방문 대화, 아니면 추억 회상
      if (state.era === 'apart') {
        if (state.apart.visiting)
          return serveTalkPool(
            state,
            data,
            rng,
            'apartVisit',
            data.dialogues.apartVisit,
          );
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
        if (used.length >= data.events.foreshadow.length) used = [];
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
      // preferRelation은 세션 패리티로 결정(관계/상태 대사 번갈아, rng 순서 비교란)
      const pool = selectDialoguePool(data.dialogues, {
        era: state.era,
        needsLevel: needsLevelOf(state.stats.needs),
        dependence: state.stats.dependence,
        tier: state.relationTier,
        abandonment: state.stats.abandonment,
        intimacyThreat: state.stats.intimacyThreat,
        preferRelation: state.totals.sessions % 2 === 0,
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
      return {
        ...state,
        rest: {
          ...state.rest,
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
      // 소모품: 재고 0/1 — 소모 후 재구매 가능. 배치도 가능(재고가 방에 보인다):
      // 첫 구매만 배치를 묻고, 재구매는 기억된 배치 자리를 그대로 따른다.
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
            ? { ...bought.items, [item.id]: { placed: false } }
            : bought.items,
          pendingPlacement: firstBuy ? item.id : bought.pendingPlacement,
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

    case 'SET_NOISE_LAYER': {
      // 소리풍경 레이어 음소거 토글 (M9) — 중복 없이 목록 유지
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

    case 'REST_END': {
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
        },
        presence: presentState(),
      };
    }
  }
}
