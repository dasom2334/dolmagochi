/**
 * 밸런스 시뮬레이션 하네스 — 실제 transition 리듀서 + 실데이터로
 * 개정 v4 패키지(80게이트·감소치·계단 배율·비트 게이트·위기 아크·토큰 게이트·표류)의
 * 플레이 스타일별 타임라인을 측정한다. 수치 재튜닝 시 이 하네스로 재검증한다.
 * (어서션 없이 콘솔 표를 남기는 관측용 테스트 — 상세 근거는 docs/plans/기획서-개정초안.)
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { createInitialState, transition } from '../stateMachine';
import type { ActionId, GameEvent, GameState, NeedId } from '../types';
import { mulberry32, type Rng } from '../rng';
import { careTargetNeed } from '../freeAction';
import { gameData } from '../../store/gameStore';

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 10, 9, 0, 0).getTime();

interface Policy {
  name: string;
  sessionMin: number;
  dailyFocusMin: number;
  answerChoices: boolean; // false여도 토큰용 첫 1회는 응답
  doTalk: boolean;
  skipRest: boolean; // true면 휴식을 전부 스킵 (배율 ×0.5)
  buyOrder: string[];
  rebuyConsumables: string[];
  /** 세션 포크 성향 (M18): alternate=번갈아(균형), near=늘 곁에, apart=늘 거리 */
  approach?: 'alternate' | 'near' | 'apart';
}

const NEED_ACTION: Record<NeedId, ActionId[]> = {
  physiological: ['lie', 'cook'],
  safety: ['sun', 'walk', 'chore'],
  belonging: ['walk', 'cook'],
  esteem: ['read', 'chore'],
};

function available(s: GameState, id: ActionId): boolean {
  const a = gameData.actions.find((x) => x.id === id);
  if (!a) return false;
  if (s.presence.sick) return id === 'nurse';
  if (id === 'nurse') return false;
  return (
    s.unlockedActions.includes(id) ||
    !a.unlock ||
    (a.unlock.ownedItems ?? []).every((i) => i in s.items)
  );
}

/** 돌봄 대상(게이트 기준 첫 80 미만)을 채우는 가용·안전 행동 */
function needFillAction(s: GameState): ActionId | null {
  const target = careTargetNeed(s.stats.needs);
  if (!target) return null;
  const allowed = 1 + Math.floor(s.stats.security / 20);
  const cands = NEED_ACTION[target].filter(
    (id) =>
      available(s, id) &&
      (gameData.actions.find((x) => x.id === id)!.intimacy -
        Math.min(5, Math.max(1, allowed)) <
        BALANCE.RETREAT_GAP),
  );
  return cands[0] ?? null;
}

/** 토큰 게이트용: 아직 한 번도 안 해본 가용 행동 */
function missingTokenAction(s: GameState): ActionId | null {
  for (const a of gameData.actions) {
    if (a.id === 'nurse' || a.id === 'free') continue;
    if (!(a.id in s.memory) && available(s, a.id)) return a.id;
  }
  return null;
}

interface RunResult {
  hTier7: number | null; // relationTier 7 확정 (집중 h)
  dTier7: number | null;
  hSelfAct: number | null;
  hEnding: number | null;
  dEnding: number | null;
  affAtEnding: number | null;
  arcRetreat: number; // 보장 잠수 아크 발동 여부(1)
  arcSick: number;
  organicRetreats: number; // 아크 외 잠수 (표류·초과 접근)
  organicSicks: number;
  endSecurity: number;
  hoursSimmed: number;
  maxAb: number;
  maxIt: number;
  quads: string[];
  /** 1회차에 획득한 추억 수 (M11b 완료 기준: 12~15) */
  remembrances: number;
}

function simulate(policy: Policy, seed: number, maxFocusHours = 160): RunResult {
  const rng: Rng = mulberry32(seed);
  const dispatch = (s: GameState, e: GameEvent) =>
    transition(s, e, { rng, data: gameData });

  let s = createInitialState(T0, 'lie');
  let now = T0;
  let dayFocus = 0;
  let choiceAnswered = false;
  let sessionCount = 0;
  let wasAbsent = false;
  let wasSick = false;
  const res: RunResult = {
    hTier7: null,
    dTier7: null,
    hSelfAct: null,
    hEnding: null,
    dEnding: null,
    affAtEnding: null,
    arcRetreat: 0,
    arcSick: 0,
    organicRetreats: 0,
    organicSicks: 0,
    endSecurity: 0,
    hoursSimmed: 0,
    maxAb: 0,
    maxIt: 0,
    quads: [],
    remembrances: 0,
  };

  const focusH = () => s.totals.focusSeconds / 3600;
  const days = () => Math.round((now - T0) / DAY);
  const topTier = BALANCE.AFFECTION_TIERS.length;

  while (focusH() < maxFocusHours) {
    s = dispatch(s, { type: 'SETTLE', nowMs: now });

    let act: ActionId;
    if (s.presence.sick) act = 'nurse';
    else act = needFillAction(s) ?? missingTokenAction(s) ?? 'free';
    if (!s.presence.sick && !available(s, act)) act = 'lie';
    s = dispatch(s, { type: 'SELECT_ACTION', actionId: act });
    const forkActive =
      s.era === 'raising' &&
      s.presence.state === 'present' &&
      !s.presence.sick &&
      s.relationTier >= BALANCE.ATTACH_ONSET_TIER;
    const mode = policy.approach ?? 'alternate';
    const approach = !forkActive
      ? undefined
      : mode === 'alternate'
        ? sessionCount % 2 === 0
          ? ('near' as const)
          : ('apart' as const)
        : mode;
    sessionCount++;
    s = dispatch(s, { type: 'START_FOCUS', nowMs: now, approach });
    if (s.phase === 'ending') break;

    if (s.presence.state === 'absent' && !wasAbsent) {
      if (s.crisisArcsFired.includes('retreat') && res.arcRetreat === 0)
        res.arcRetreat = 1;
      else res.organicRetreats++;
    }
    wasAbsent = s.presence.state === 'absent';

    const totalSec = policy.sessionMin * 60;
    for (let t = 0; t < totalSec; t += 10) {
      s = dispatch(s, { type: 'TICK', dtSec: 10 });
      const cs = s.session.choiceState;
      if (cs && (policy.answerChoices || !choiceAnswered)) {
        const action = gameData.actions.find((a) => a.id === s.selectedAction)!;
        const opts =
          cs.source === 'foreshadow'
            ? (s.pendingEvent?.options ?? [])
            : (action.choices[cs.index]?.options ?? []);
        if (opts.length > 0) {
          const allowed = Math.min(
            5,
            Math.max(1, 1 + Math.floor(s.stats.security / 20)),
          );
          let best = 0;
          let bestVal = -1;
          opts.forEach((o, i) => {
            const val = o.intimacy <= allowed ? 100 + o.intimacy : -o.intimacy;
            if (val > bestVal) {
              bestVal = val;
              best = i;
            }
          });
          s = dispatch(s, {
            type: 'CHOICE_PICKED',
            optionIndex: best,
            nowMs: now + t * 1000,
          });
          choiceAnswered = true;
        }
      }
    }

    now += totalSec * 1000;
    s = dispatch(s, { type: 'END_FOCUS', nowMs: now });

    if (s.presence.sick && !wasSick) {
      if (s.crisisArcsFired.includes('sick') && res.arcSick === 0) res.arcSick = 1;
      else res.organicSicks++;
    }
    wasSick = s.presence.sick;
    res.maxAb = Math.max(res.maxAb, s.stats.abandonment);
    res.maxIt = Math.max(res.maxIt, s.stats.intimacyThreat);
    for (const q of s.quadrantsSeen) if (!res.quads.includes(q)) res.quads.push(q);

    if (res.hTier7 === null && s.relationTier >= topTier) {
      res.hTier7 = focusH();
      res.dTier7 = days();
    }
    if (res.hSelfAct === null && s.stats.selfActualization >= 100)
      res.hSelfAct = focusH();

    // 휴식 작은 행동 — 실플레이어는 대체로 하나 누른다 (추억 순간의 두 경로 중 하나)
    if (!s.rest.actUsed) {
      const act = gameData.restActs[sessionCount % gameData.restActs.length];
      s = dispatch(s, { type: 'REST_ACT', key: act.key });
    }
    if (policy.doTalk && !s.rest.talkPressed) {
      s = dispatch(s, { type: 'TALK' });
      if (s.rest.talkState?.hasChoice)
        s = dispatch(s, { type: 'TALK_CHOICE', yes: true });
    }

    const tryBuy = (id: string) => {
      s = dispatch(s, { type: 'BUY', itemId: id, nowMs: now });
      if (s.pendingPlacement)
        s = dispatch(s, {
          type: 'SET_PLACEMENT',
          itemId: s.pendingPlacement,
          placed: true,
        });
    };
    for (const id of policy.buyOrder) if (!(id in s.items)) tryBuy(id);
    for (const id of policy.rebuyConsumables)
      if ((s.supplies[id] ?? 0) === 0) tryBuy(id);

    const restSec = s.rest.totalSec;
    s = dispatch(s, { type: 'REST_END' });
    if (s.phase === 'ending') {
      res.hEnding = focusH();
      res.dEnding = days();
      res.affAtEnding = s.stats.affection;
      break;
    }
    if (!policy.skipRest) now += restSec * 1000;

    dayFocus += policy.sessionMin;
    if (dayFocus >= policy.dailyFocusMin) {
      dayFocus = 0;
      const nextDay = new Date(now);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(9, 0, 0, 0);
      now = nextDay.getTime();
    }
  }
  res.endSecurity = s.stats.security;
  res.remembrances = s.remembrances.length;
  res.hoursSimmed = focusH();
  if (res.affAtEnding === null) res.affAtEnding = s.stats.affection;
  return res;
}

const fmt = (v: number | null) => (v === null ? '  --' : v.toFixed(1).padStart(5));

function report(policy: Policy, seeds: number[]) {
  const runs = seeds.map((sd) => simulate(policy, sd));
  const avg = (get: (r: RunResult) => number | null) => {
    const vals = runs.map(get).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const reached = (get: (r: RunResult) => number | null) =>
    runs.filter((r) => get(r) !== null).length;

  console.log(
    `\n=== ${policy.name} (${policy.sessionMin}분, ${policy.dailyFocusMin / 60}h/day${policy.skipRest ? ', 휴식 스킵' : ''}) ===`,
  );
  console.log(
    `7티어 확정: ${fmt(avg((r) => r.hTier7))}h / ${fmt(avg((r) => r.dTier7))}일 (${reached((r) => r.hTier7)}/${runs.length}) | 자아실현 100: ${fmt(avg((r) => r.hSelfAct))}h (${reached((r) => r.hSelfAct)}/${runs.length})`,
  );
  console.log(
    `엔딩: ${fmt(avg((r) => r.hEnding))}h / ${fmt(avg((r) => r.dEnding))}일차 (${reached((r) => r.hEnding)}/${runs.length}) | 엔딩 시 호감도 ${fmt(avg((r) => r.affAtEnding))}`,
  );
  console.log(
    `위기: 보장아크 잠수 ${fmt(avg((r) => r.arcRetreat))} 병간호 ${fmt(avg((r) => r.arcSick))} | 유기적 잠수 ${fmt(avg((r) => r.organicRetreats))} 병간호 ${fmt(avg((r) => r.organicSicks))} | 종료 안정감 ${fmt(avg((r) => r.endSecurity))} | 시뮬 ${fmt(avg((r) => r.hoursSimmed))}h`,
  );
  console.log(
    `애착: 유기불안 max ${fmt(avg((r) => r.maxAb))} | 친밀위협 max ${fmt(avg((r) => r.maxIt))} | 급성 목격 ${runs.map((r) => r.quads.length).join(',')}종 | 추억 ${fmt(avg((r) => r.remembrances))}개`,
  );
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const ALL_ITEMS = ['cushion', 'shoes', 'book', 'pot', 'broom', 'desk', 'pillow', 'stationery', 'laptop'];

describe('밸런스 시뮬레이션 (개정 v4 패키지)', () => {
  it('플레이 스타일별 타임라인', () => {
    report(
      {
        name: 'A. 균형 (성실 응답·휴식 완주)',
        sessionMin: 50,
        dailyFocusMin: 240,
        answerChoices: true,
        doTalk: true,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      SEEDS,
    );
    report(
      {
        name: 'B. 엔딩 러시 (90분, 6h/day)',
        sessionMin: 90,
        dailyFocusMin: 360,
        answerChoices: false,
        doTalk: true,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      SEEDS,
    );
    report(
      {
        name: 'D. 캐주얼 (25분, 2h/day, 선택지 최소)',
        sessionMin: 25,
        dailyFocusMin: 120,
        answerChoices: false,
        doTalk: true,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      SEEDS,
    );
    report(
      {
        name: 'E. 무심 (대화 안 함, 선택지 최소)',
        sessionMin: 50,
        dailyFocusMin: 240,
        answerChoices: false,
        doTalk: false,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      SEEDS,
    );
    report(
      {
        name: 'F. 휴식 스킵 (그 외 균형과 동일)',
        sessionMin: 50,
        dailyFocusMin: 240,
        answerChoices: true,
        doTalk: true,
        skipRest: true,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      SEEDS,
    );
  }, 300_000);

  // 개정 v4-8 불변식 (M17): 어떤 플레이 스타일이든 엔딩 전에 보장 아크
  // 잠수·병간호가 각 1회 이상 발동해야 한다 (3/5티어 예약 → 큐). 큐화 이전엔
  // 3티어 잠수가 5티어 병간호에 덮여 사라질 수 있었다.
  it('보장 아크 불변식: 엔딩 도달 런은 잠수·병간호를 각 1회 이상 겪는다', () => {
    const POLICIES: Policy[] = [
      {
        name: 'A. 균형',
        sessionMin: 50,
        dailyFocusMin: 240,
        answerChoices: true,
        doTalk: true,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      {
        name: 'B. 러시',
        sessionMin: 90,
        dailyFocusMin: 360,
        answerChoices: false,
        doTalk: true,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
      {
        name: 'D. 캐주얼',
        sessionMin: 25,
        dailyFocusMin: 120,
        answerChoices: false,
        doTalk: true,
        skipRest: false,
        buyOrder: ALL_ITEMS,
        rebuyConsumables: ['caffeine'],
      },
    ];
    for (const policy of POLICIES) {
      for (const seed of SEEDS) {
        const r = simulate(policy, seed);
        if (r.hEnding === null) continue; // 엔딩 미도달 런은 대상 아님
        expect(
          r.arcRetreat,
          `${policy.name} seed ${seed}: 잠수 아크 미발동`,
        ).toBe(1);
        expect(
          r.arcSick,
          `${policy.name} seed ${seed}: 병간호 아크 미발동`,
        ).toBe(1);
        // M18: 개막·성장통 스파이크가 급성 4분면 목격을 보장한다
        expect(
          r.quads,
          `${policy.name} seed ${seed}: 회피 급성 미목격`,
        ).toContain('avoidant');
        expect(
          r.quads,
          `${policy.name} seed ${seed}: 집착 급성 미목격`,
        ).toContain('clingy');
      }
    }
  }, 300_000);

  // M20 불변식: 연출과-의도.md §2 페이싱 표 — 균형 플레이 티어7 ~57.6h ·
  // 엔딩 ~64h/15일차, 휴식 스킵 ~1.7× 페널티(정직한 휴식이 곧 돌봄).
  // 수치를 만지면 이 범위 안으로 되돌리거나, 표부터 고치고 여기를 갱신할 것.
  it('1차 페이싱 불변식: 균형 플레이는 페이싱 표 범위에서 엔딩에 닿는다', () => {
    const base: Policy = {
      name: 'A. 균형',
      sessionMin: 50,
      dailyFocusMin: 240,
      answerChoices: true,
      doTalk: true,
      skipRest: false,
      buyOrder: ALL_ITEMS,
      rebuyConsumables: ['caffeine'],
    };
    const avg = (runs: RunResult[], get: (r: RunResult) => number | null) => {
      const vals = runs.map(get).filter((v): v is number => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const balanced = SEEDS.map((sd) => simulate(base, sd));
    expect(balanced.every((r) => r.hEnding !== null), '전 시드 엔딩 도달').toBe(true);
    const tier7 = avg(balanced, (r) => r.hTier7)!;
    const endH = avg(balanced, (r) => r.hEnding)!;
    const endD = avg(balanced, (r) => r.dEnding)!;
    expect(tier7, '티어7 ~57.6h ±7h').toBeGreaterThan(50.6);
    expect(tier7, '티어7 ~57.6h ±7h').toBeLessThan(64.6);
    expect(endH, '엔딩 ~64h ±8h').toBeGreaterThan(56);
    expect(endH, '엔딩 ~64h ±8h').toBeLessThan(72);
    expect(endD, '엔딩 12~19일차').toBeGreaterThanOrEqual(12);
    expect(endD, '엔딩 12~19일차').toBeLessThanOrEqual(19);

    const skip = SEEDS.map((sd) => simulate({ ...base, name: 'F. 휴식 스킵', skipRest: true }, sd));
    const skipH = avg(skip, (r) => r.hEnding);
    if (skipH !== null)
      expect(skipH / endH, '휴식 스킵 페널티 ≥1.4×').toBeGreaterThan(1.4);
  }, 300_000);

  it('튜닝 실험: GAIN·표류', () => {
    const B = BALANCE as unknown as Record<string, number>;
    const saved = {
      gain: BALANCE.SELF_ACT_GAIN_PER_WORK,
      base: BALANCE.PERSONAL_WORK_BASE,
      drift: BALANCE.ATTACH_DRIFT_PER_TIER,
    };
    const POL = (over: Partial<Policy>): Policy => ({
      name: 'A. 균형',
      sessionMin: 50,
      dailyFocusMin: 240,
      answerChoices: true,
      doTalk: true,
      skipRest: false,
      buyOrder: ALL_ITEMS,
      rebuyConsumables: ['caffeine'],
      ...over,
    });
    try {
      for (const [gain, base, drift] of [
        [14, 0.15, 1.0],
        [16, 0.2, 1.0],
      ] as const) {
        B.SELF_ACT_GAIN_PER_WORK = gain;
        B.PERSONAL_WORK_BASE = base;
        B.ATTACH_DRIFT_PER_TIER = drift;
        console.log(`\n##### GAIN=${gain}, BASE=${base}, DRIFT/티어=${drift} #####`);
        report(POL({}), SEEDS);
        report(
          POL({ name: 'B. 러시', sessionMin: 90, dailyFocusMin: 360, answerChoices: false }),
          SEEDS,
        );
        report(
          POL({ name: 'D. 캐주얼', sessionMin: 25, dailyFocusMin: 120, answerChoices: false }),
          SEEDS,
        );
        report(POL({ name: 'E. 무심', answerChoices: false, doTalk: false }), SEEDS);
        report(POL({ name: 'F. 휴식 스킵', skipRest: true }), SEEDS);
      }
    } finally {
      B.SELF_ACT_GAIN_PER_WORK = saved.gain;
      B.PERSONAL_WORK_BASE = saved.base;
      B.ATTACH_DRIFT_PER_TIER = saved.drift;
    }
  }, 300_000);
});

/** ── 2차 독립기 시뮬 (M14) — 심기까지 시간·붙잡기 스펙트럼 검증 ── */
interface Phase2Result {
  hBloom: number | null;
  hRoot1: number | null; // 뿌리내림기 진입 (성장 50, M19b)
  hRoot2: number | null; // 무반응기 (성장 85)
  hPlant: number | null;
  dPlant: number | null;
  letGo: number;
  holds: number;
  visits: number;
  endWither: number;
  endDependence: number;
  hoursSimmed: number;
}

function simulatePhase2(
  policy: { holdAlways: boolean; sessionMin: number; dailyFocusMin: number },
  seed: number,
  maxFocusHours = 80,
): Phase2Result {
  const rng: Rng = mulberry32(seed);
  const dispatch = (s: GameState, e: GameEvent) =>
    transition(s, e, { rng, data: gameData });
  let s: GameState = {
    ...createInitialState(T0, 'lie'),
    era: 'apart',
    phase: 'actionSelect',
  };
  let now = T0;
  let dayFocus = 0;
  const res: Phase2Result = {
    hBloom: null, hRoot1: null, hRoot2: null, hPlant: null, dPlant: null,
    letGo: 0, holds: 0, visits: 0, endWither: 0, endDependence: 0, hoursSimmed: 0,
  };
  const focusH = () => s.totals.focusSeconds / 3600;

  while (focusH() < maxFocusHours && !s.planted) {
    s = dispatch(s, { type: 'SETTLE', nowMs: now });
    const wasVisiting = s.apart.visiting;
    s = dispatch(s, { type: 'SELECT_ACTION', actionId: 'lie' });
    s = dispatch(s, { type: 'START_FOCUS', nowMs: now });
    if (s.apart.visiting && !wasVisiting) res.visits++;
    const totalSec = policy.sessionMin * 60;
    for (let t = 0; t < totalSec; t += 30) s = dispatch(s, { type: 'TICK', dtSec: 30 });
    now += totalSec * 1000;
    s = dispatch(s, { type: 'END_FOCUS', nowMs: now });
    if (res.hBloom === null && s.bloomSeen) res.hBloom = focusH();
    if (res.hRoot1 === null && s.sproutGrowth >= BALANCE.ROOTING_AT)
      res.hRoot1 = focusH();
    if (res.hRoot2 === null && s.sproutGrowth >= BALANCE.ROOTING_STILL_AT)
      res.hRoot2 = focusH();
    if (s.apart.leavePending) {
      s = dispatch(s, { type: 'VISIT_HOLD', hold: policy.holdAlways });
      if (policy.holdAlways) res.holds++;
      else res.letGo++;
    }
    if (s.planted) {
      res.hPlant = focusH();
      res.dPlant = Math.round((now - T0) / DAY);
      break;
    }
    const restSec = s.rest.totalSec;
    s = dispatch(s, { type: 'REST_END' });
    now += restSec * 1000;
    dayFocus += policy.sessionMin;
    if (dayFocus >= policy.dailyFocusMin) {
      dayFocus = 0;
      const nd = new Date(now);
      nd.setDate(nd.getDate() + 1);
      nd.setHours(9, 0, 0, 0);
      now = nd.getTime();
    }
  }
  res.endWither = s.witherLevel;
  res.endDependence = s.stats.dependence;
  res.hoursSimmed = focusH();
  return res;
}

describe('2차 독립기 시뮬 (M14)', () => {
  // M20 불변식: 연출과-의도.md §3 페이싱 표 — 보내주기 ~27.5h/6일,
  // 붙잡기 남용은 심기 불가("시간이 아니라 태도가 벽").
  it('보내주기 플레이 vs 붙잡기 남용', () => {
    for (const [name, holdAlways] of [['보내주기(정상)', false], ['붙잡기 남용', true]] as const) {
      const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) =>
        simulatePhase2({ holdAlways, sessionMin: 50, dailyFocusMin: 240 }, sd),
      );
      const avg = (get: (r: Phase2Result) => number | null) => {
        const vs = runs.map(get).filter((v): v is number => v !== null);
        return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      };
      const reach = runs.filter((r) => r.hPlant !== null).length;
      console.log(
        `\n=== 2차: ${name} (50분·4h/day, 시드 8) ===\n` +
        `개화 ${fmt(avg((r) => r.hBloom))}h | 뿌리내림 ${fmt(avg((r) => r.hRoot1))}h → 무반응 ${fmt(avg((r) => r.hRoot2))}h | 심기 ${fmt(avg((r) => r.hPlant))}h / ${fmt(avg((r) => r.dPlant))}일차 (${reach}/8)\n` +
        `방문 ${fmt(avg((r) => r.visits))} | 보내줌 ${fmt(avg((r) => r.letGo))} | 붙잡음 ${fmt(avg((r) => r.holds))} | 종료 시듦 ${fmt(avg((r) => r.endWither))} | 의존도 ${fmt(avg((r) => r.endDependence))} | 시뮬 ${fmt(avg((r) => r.hoursSimmed))}h`,
      );

      if (!holdAlways) {
        expect(reach, '보내주기: 전 시드 심기 도달').toBe(runs.length);
        const hPlant = avg((r) => r.hPlant)!;
        const dPlant = avg((r) => r.dPlant)!;
        expect(hPlant, '심기 시간 ~27.5h ±3h').toBeGreaterThan(24.5);
        expect(hPlant, '심기 시간 ~27.5h ±3h').toBeLessThan(30.5);
        expect(dPlant, '심기 5~8일차').toBeGreaterThanOrEqual(5);
        expect(dPlant, '심기 5~8일차').toBeLessThanOrEqual(8);
        for (const r of runs) {
          // 뿌리내림기 연출은 심기 전 반드시 통과한다 (진입 → 무반응 → 심기)
          expect(r.hRoot1).not.toBeNull();
          expect(r.hRoot2).not.toBeNull();
          expect(r.hRoot1!).toBeLessThanOrEqual(r.hRoot2!);
          expect(r.hRoot2!).toBeLessThanOrEqual(r.hPlant!);
        }
      } else {
        expect(reach, '붙잡기 남용: 심기 불가').toBe(0);
      }
    }
  }, 300_000);
});
