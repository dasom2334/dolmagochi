/**
 * 게임 데이터 검증기 (순수 함수). 콘텐츠 작업이 코드 수정 없이 돌아가도록,
 * 구조 JSON ↔ 로케일 카탈로그의 참조 무결성·필수 필드·구조 규칙을 검사한다.
 * CLI 러너는 scripts/validate-cli.ts, 유닛 테스트는 src/data/__tests__/validate-data.test.ts.
 */
import type {
  Condition,
  Outcome,
  ChoiceOptionData,
  ForeshadowEventData,
} from '../src/game/types';
import { NEED_ORDER } from '../src/game/types';
import type {
  ActionData,
  DialogueLine,
  GameData,
  ReflectionDef,
} from '../src/data/schema';
import type { TextCatalog } from '../src/game/text';
import { SYS, UI } from '../src/game/text';

export interface Report {
  errors: string[];
  warnings: string[];
  todos: string[];
}

const NEED_KEYS = new Set<string>(NEED_ORDER);
const ERAS = new Set(['raising', 'cohabit', 'apart']);
const PRESENCES = new Set(['present', 'absent']);
const SPECIAL_TOKENS = new Set(['choice', 'default', 'personalWork', 'absent']);

/** 대화 풀 최소 권장 수량 (기획서 v1 컷) */
const DIALOGUE_MIN = 8;
const MILESTONE_MIN = 5;
const SHOP_MIN = 3;

/** SYS/UI 상수의 모든 문자열 값 = 코드가 참조하는 textId (orphan 판정용) */
function collectCodeRefs(): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(SYS);
  walk(UI);
  return out;
}

export function validateGameData(
  data: GameData,
  catalog: TextCatalog,
): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const referenced = new Set<string>();

  const actionIds = new Set(data.actions.map((a) => a.id));
  const itemIds = new Set(data.shop.map((i) => i.id));

  // 텍스트 참조: 존재하는지 확인하고 참조 집합에 기록
  const ref = (id: string | undefined, where: string) => {
    if (id === undefined) return;
    referenced.add(id);
    if (!(id in catalog)) errors.push(`missing textId "${id}" (${where})`);
  };

  const checkIntimacy = (n: unknown, where: string) => {
    if (typeof n !== 'number' || n < 1 || n > 5) {
      errors.push(`intimacy는 1~5 숫자여야 함 (${where}): ${JSON.stringify(n)}`);
    }
  };

  const checkCondition = (c: Condition | undefined, where: string) => {
    if (!c) return;
    for (const a of c.action ? [c.action] : [])
      if (!actionIds.has(a)) errors.push(`알 수 없는 action "${a}" (${where})`);
    for (const a of c.notActions ?? [])
      if (!actionIds.has(a)) errors.push(`알 수 없는 notActions "${a}" (${where})`);
    for (const it of c.ownedItems ?? [])
      if (!itemIds.has(it)) errors.push(`알 수 없는 ownedItems "${it}" (${where})`);
    for (const it of c.placedItems ?? [])
      if (!itemIds.has(it)) errors.push(`알 수 없는 placedItems "${it}" (${where})`);
    for (const k of Object.keys(c.minNeeds ?? {}))
      if (!NEED_KEYS.has(k)) errors.push(`알 수 없는 욕구 "${k}" (${where})`);
    if (c.era && !ERAS.has(c.era)) errors.push(`알 수 없는 era "${c.era}" (${where})`);
    if (c.presence && !PRESENCES.has(c.presence))
      errors.push(`알 수 없는 presence "${c.presence}" (${where})`);
  };

  const checkOutcome = (o: Outcome | undefined, where: string) => {
    if (!o) return;
    for (const a of o.unlockActions ?? [])
      if (!actionIds.has(a)) errors.push(`알 수 없는 unlockActions "${a}" (${where})`);
    for (const it of o.unlockItems ?? [])
      if (!itemIds.has(it)) errors.push(`알 수 없는 unlockItems "${it}" (${where})`);
    for (const k of Object.keys(o.needs ?? {}))
      if (!NEED_KEYS.has(k)) errors.push(`알 수 없는 욕구 "${k}" (${where})`);
    for (const m of o.memory ?? []) {
      if (m.k.startsWith('buy-') && !itemIds.has(m.k.slice(4)))
        warnings.push(`기억 토큰 "${m.k}"의 물품이 상점에 없음 (${where})`);
    }
  };

  const remembranceIds = new Set<string>();
  const checkOption = (opt: ChoiceOptionData, where: string) => {
    ref(opt.labelId, `${where}.label`);
    checkIntimacy(opt.intimacy, `${where}.intimacy`);
    if (!opt.outcomes || opt.outcomes.length === 0) {
      errors.push(`선택지에 outcome이 없음 (${where})`);
      return;
    }
    if (!opt.outcomes.some((o) => o.when === undefined))
      errors.push(`선택지에 무조건(when 없는) outcome이 없음 — 런타임 폴백 불가 (${where})`);
    opt.outcomes.forEach((o, i) => {
      ref(o.resultId, `${where}.outcome[${i}].result`);
      if (o.weight !== undefined && o.weight <= 0)
        errors.push(`weight는 0보다 커야 함 (${where}.outcome[${i}]): ${o.weight}`);
      checkCondition(o.when, `${where}.outcome[${i}].when`);
      checkOutcome(o.outcome, `${where}.outcome[${i}]`);
      if (o.remembrance) {
        const { id, summaryId, revealId } = o.remembrance;
        if (remembranceIds.has(id))
          errors.push(`중복 remembrance.id "${id}" (${where})`);
        remembranceIds.add(id);
        ref(summaryId, `remembrance "${id}".summary`);
        ref(revealId, `remembrance "${id}".reveal`);
      }
    });
  };

  const checkForeshadowEvent = (ev: ForeshadowEventData, where: string) => {
    ref(ev.promptId, `${where}.prompt`);
    checkCondition(ev.when, `${where}.when`);
    ev.options.forEach((o, i) => checkOption(o, `${where}.opt[${i}]`));
  };

  const checkLine = (l: DialogueLine, where: string) => {
    ref(l.textId, where);
    checkIntimacy(l.intimacy, `${where}.intimacy`);
    checkCondition(l.when, `${where}.when`);
    if (l.choice) {
      ref(l.choice.yesId, `${where}.yes`);
      ref(l.choice.noId, `${where}.no`);
    }
  };

  // ── actions ──
  const seenActionIds = new Set<string>();
  data.actions.forEach((a: ActionData) => {
    if (seenActionIds.has(a.id)) errors.push(`중복 action id "${a.id}"`);
    seenActionIds.add(a.id);
    const w = `action "${a.id}"`;
    ref(a.nameId, `${w}.name`);
    ref(a.captionId, `${w}.caption`);
    ref(a.startLineId, `${w}.start`);
    ref(a.ambientId, `${w}.ambient`);
    checkIntimacy(a.intimacy, `${w}.intimacy`);
    checkCondition(a.unlock, `${w}.unlock`);
    checkOutcome(a.outcome, `${w}.outcome`);
    a.choices.forEach((c, ci) => {
      ref(c.promptId, `${w}.choice[${ci}].prompt`);
      checkIntimacy(c.intimacy, `${w}.choice[${ci}].intimacy`);
      c.options.forEach((o, oi) => checkOption(o, `${w}.choice[${ci}].opt[${oi}]`));
    });
  });
  // 시작 행동은 정확히 하나여야 한다(무해금 + starter) — 배열 순서 비의존
  const starters = data.actions.filter((a) => a.starter);
  if (starters.length !== 1)
    errors.push(`시작 행동(starter)은 정확히 하나여야 함 (현재 ${starters.length})`);
  else if (starters[0].unlock)
    errors.push(`시작 행동 "${starters[0].id}"에 해금 조건이 있으면 안 됨`);

  // ── shop ──
  const seenItemIds = new Set<string>();
  data.shop.forEach((it) => {
    if (seenItemIds.has(it.id)) errors.push(`중복 shop id "${it.id}"`);
    seenItemIds.add(it.id);
    const w = `shop "${it.id}"`;
    ref(it.nameId, `${w}.name`);
    ref(it.descId, `${w}.desc`);
    checkCondition(it.unlock, `${w}.unlock`);
    checkOutcome(it.outcome, `${w}.outcome`);
    if (typeof it.price !== 'number' || it.price < 0)
      errors.push(`${w}.price는 0 이상 숫자여야 함`);
    // 체인: requires는 존재하는 상점 아이템, 자기 자신 금지
    if (it.requires !== undefined) {
      if (it.requires === it.id) errors.push(`${w}.requires가 자기 자신`);
      else if (!data.shop.some((o) => o.id === it.requires))
        errors.push(`${w}.requires "${it.requires}" — 없는 아이템`);
    }
    // boosts: 행동 id 또는 'personalWork'
    if (
      it.boosts !== undefined &&
      it.boosts !== 'personalWork' &&
      !actionIds.has(it.boosts)
    )
      errors.push(`${w}.boosts "${it.boosts}" — 없는 행동`);
    // 소모품: 종류 키 중복 금지 + 사용 대사 텍스트 존재
    if (it.consumable) {
      const keys = new Set<string>();
      it.consumable.variants.forEach((v) => {
        if (keys.has(v.key)) errors.push(`${w} 소모품 종류 키 중복 "${v.key}"`);
        keys.add(v.key);
        ref(`shop.${it.id}.use.${v.key}`, `${w}.use.${v.key}`);
        ref(`shop.${it.id}.var.${v.key}`, `${w}.var.${v.key}`);
      });
      if (it.consumable.variants.length === 0)
        errors.push(`${w}.consumable.variants가 비어 있음`);
    }
  });
  if (data.shop.length < SHOP_MIN)
    warnings.push(`상점 물품이 ${data.shop.length}종 (권장 ${SHOP_MIN}+)`);

  // ── dialogues ──
  const d = data.dialogues;
  const stages: [string, DialogueLine[]][] = [
    ['stage1', d.stage1], ['stage2', d.stage2], ['stage3', d.stage3],
    ['stage4', d.stage4], ['stage5', d.stage5],
  ];
  stages.forEach(([name, lines]) => {
    lines.forEach((l, i) => checkLine(l, `dialogues.${name}[${i}]`));
    if (lines.length < DIALOGUE_MIN)
      warnings.push(`${name} 대화 ${lines.length}줄 (권장 ${DIALOGUE_MIN}~10)`);
  });
  d.absent.forEach((l, i) => checkLine(l, `dialogues.absent[${i}]`));
  d.apart.forEach((l, i) => checkLine(l, `dialogues.apart[${i}]`));
  d.apartVisit.forEach((l, i) => checkLine(l, `dialogues.apartVisit[${i}]`));
  // 관계 대사(호감도 7티어) — 파생 로직이 티어 수(7)에 맞물리므로 개수 확인
  if (!Array.isArray(d.relationTiers) || d.relationTiers.length !== 7)
    errors.push(`dialogues.relationTiers는 7티어여야 함 (현재 ${d.relationTiers?.length})`);
  (d.relationTiers ?? []).forEach((lines, t) =>
    lines.forEach((l, i) => checkLine(l, `dialogues.relationTiers[${t}][${i}]`)),
  );
  // 상태 대사(애착 4분면) — 급성 집착/회피/혼란 풀
  (['clingy', 'avoidant', 'chaotic'] as const).forEach((q) => {
    const lines = d.quadrants?.[q];
    if (!Array.isArray(lines)) errors.push(`dialogues.quadrants.${q} 누락`);
    else lines.forEach((l, i) => checkLine(l, `dialogues.quadrants.${q}[${i}]`));
  });
  // selectDialoguePool은 dependence가 임계 미만이면 stage0로 하한 처리하므로,
  // 첫 단계 임계는 0이어야 한다(그래야 동거 시작=stage0가 정확히 맞물린다).
  if (d.cohabitStages.length > 0 && d.cohabitStages[0].minDependence !== 0)
    errors.push('cohabitStages[0].minDependence는 0이어야 함');
  let prevDep = -Infinity;
  d.cohabitStages.forEach((s, i) => {
    if (s.minDependence < prevDep)
      errors.push(`cohabitStages[${i}].minDependence 오름차순 아님`);
    prevDep = s.minDependence;
    s.lines.forEach((l, li) => checkLine(l, `cohabitStages[${i}][${li}]`));
  });
  ref(d.absentReturn.lineId, 'dialogues.absentReturn.line');
  ref(d.absentReturn.yesId, 'dialogues.absentReturn.yes');
  ref(d.absentReturn.noId, 'dialogues.absentReturn.no');
  const vl = d.visitLeave;
  ['promptId', 'holdLabelId', 'letGoLabelId', 'holdResultId', 'letGoResultId'].forEach(
    (k) => ref((vl as unknown as Record<string, string>)[k], `visitLeave.${k}`),
  );

  // ── events ──
  const seenMilestone = new Set<string>();
  data.events.milestones.forEach((m) => {
    if (seenMilestone.has(m.id)) errors.push(`중복 milestone id "${m.id}"`);
    seenMilestone.add(m.id);
    ref(m.textId, `milestone "${m.id}"`);
    if (m.trigger.type === 'firstAction' && !actionIds.has(m.trigger.action))
      errors.push(`milestone "${m.id}" firstAction 알 수 없는 action "${m.trigger.action}"`);
  });
  if (data.events.milestones.length < MILESTONE_MIN)
    warnings.push(`고정 이벤트 ${data.events.milestones.length}개 (권장 ${MILESTONE_MIN})`);
  data.events.foreshadow.forEach((f, i) => {
    ref(f.lineId, `foreshadow[${i}].line`);
    checkForeshadowEvent(f.event, `foreshadow[${i}].event`);
  });

  // ── reflections ──
  data.reflections.forEach((rf: ReflectionDef) => {
    const t = rf.token;
    const validToken =
      actionIds.has(t) ||
      (t.startsWith('buy-') && itemIds.has(t.slice(4))) ||
      (t.startsWith('selfCare-') && NEED_KEYS.has(t.slice(9))) ||
      (t.startsWith('selfCareVia-') && actionIds.has(t.slice(12))) ||
      SPECIAL_TOKENS.has(t);
    if (!validToken) errors.push(`알 수 없는 reflection token "${t}"`);
    if (rf.variants.length === 0)
      errors.push(`reflection "${t}" 변형이 비어 있음`);
    // buy-* 는 소품 배치 조건으로만 등장(의도) — 기본 변형 없어도 됨. 그 외는 경고.
    if (!t.startsWith('buy-') && !rf.variants.some((v) => v.when === undefined))
      warnings.push(`reflection "${t}" 기본(when 없는) 변형이 없음`);
    rf.variants.forEach((v, i) => {
      ref(v.textId, `reflection "${t}"[${i}]`);
      checkCondition(v.when, `reflection "${t}"[${i}].when`);
    });
  });

  // ── restActs ──
  data.restActs.forEach((a) => {
    ref(a.labelId, `restAct "${a.key}".label`);
    ref(a.linesId, `restAct "${a.key}".lines`);
    ref(a.absentLinesId, `restAct "${a.key}".absent`);
  });

  // ── timeMarks ──
  const checkMarks = (marks: { minSec: number; textId: string }[], name: string) => {
    let prev = -Infinity;
    marks.forEach((m, i) => {
      if (m.minSec < prev) errors.push(`timeMarks.${name}[${i}] minSec 오름차순 아님`);
      prev = m.minSec;
      ref(m.textId, `timeMarks.${name}[${i}]`);
    });
  };
  checkMarks(data.timeMarks.focus, 'focus');
  checkMarks(data.timeMarks.rest, 'rest');

  // ── endings ──
  const e = data.endings;
  if (e.preEndingTalks.length === 0) errors.push('preEndingTalks가 비어 있음');
  e.preEndingTalks.forEach((tk, i) => {
    ref(tk.textId, `preEndingTalks[${i}]`);
    if (tk.choice) {
      ref(tk.choice.yesId, `preEndingTalks[${i}].yes`);
      ref(tk.choice.noId, `preEndingTalks[${i}].no`);
    }
  });
  ref(e.endingEvent.textId, 'endingEvent.text');
  ref(e.endingEvent.stayLabelId, 'endingEvent.stay');
  ref(e.endingEvent.farewellLabelId, 'endingEvent.farewell');
  ref(e.farewellEpilogueId, 'endings.farewellEpilogue');
  ref(e.cohabitTransitionId, 'endings.cohabitTransition');
  ref(e.farewellFromCohabitId, 'endings.farewellFromCohabit');

  // ── badges (M11a) ──
  const milestoneIds = new Set(data.events.milestones.map((m) => m.id));
  const badgeIds = new Set<string>();
  (data.badges ?? []).forEach((b, i) => {
    if (badgeIds.has(b.id)) errors.push(`중복 badge.id "${b.id}"`);
    badgeIds.add(b.id);
    ref(b.nameId, `badges[${i}].name`);
    ref(b.lineId, `badges[${i}].line`);
    const w = b.when ?? {};
    const keys = Object.keys(w);
    if (keys.length !== 1)
      errors.push(`badges[${i}] "${b.id}": when은 정확히 한 필드여야 함`);
    if (w.milestone !== undefined && !milestoneIds.has(w.milestone))
      errors.push(`badges[${i}] "${b.id}": 알 수 없는 milestone "${w.milestone}"`);
    if (w.crisisArc !== undefined && !['retreat', 'sick', 'farewell2'].includes(w.crisisArc))
      errors.push(`badges[${i}] "${b.id}": 알 수 없는 crisisArc "${w.crisisArc}"`);
    if (
      w.quadrantSeen !== undefined &&
      !['clingy', 'avoidant', 'chaotic'].includes(w.quadrantSeen)
    )
      errors.push(`badges[${i}] "${b.id}": 알 수 없는 quadrantSeen "${w.quadrantSeen}"`);
  });

  // ── treeFinds (M15) ──
  const treeFindIds = new Set<string>();
  (data.treeFinds ?? []).forEach((f, i) => {
    if (treeFindIds.has(f.id)) errors.push(`중복 treeFind.id "${f.id}"`);
    treeFindIds.add(f.id);
    ref(f.textId, `treeFinds[${i}]`);
    if (typeof f.minStage !== 'number' || f.minStage < 0 || f.minStage > 5)
      errors.push(`treeFinds[${i}] "${f.id}": minStage는 0~5`);
    if (
      f.season !== undefined &&
      !['spring', 'summer', 'autumn', 'winter'].includes(f.season)
    )
      errors.push(`treeFinds[${i}] "${f.id}": 알 수 없는 season "${f.season}"`);
  });
  // after 체인: 존재하는 발견을 가리켜야 하고, 선행의 minStage가 더 높으면
  // 후행이 영원히 잠긴다 (앞 단계에서 막힘)
  (data.treeFinds ?? []).forEach((f, i) => {
    if (f.after === undefined) return;
    if (!treeFindIds.has(f.after))
      errors.push(`treeFinds[${i}] "${f.id}": 알 수 없는 after "${f.after}"`);
    const prev = (data.treeFinds ?? []).find((p) => p.id === f.after);
    if (prev && prev.minStage > f.minStage)
      errors.push(
        `treeFinds[${i}] "${f.id}": after "${f.after}"의 minStage(${prev.minStage})가 더 높음`,
      );
  });

  // ── moments (M11a) ──
  const restActKeys = new Set(data.restActs.map((a) => a.key));
  const momentIds = new Set<string>();
  (data.moments ?? []).forEach((m, i) => {
    if (momentIds.has(m.id)) errors.push(`중복 moment.id "${m.id}"`);
    momentIds.add(m.id);
    ref(m.summaryId, `moments[${i}].summary`);
    ref(m.revealId, `moments[${i}].reveal`);
    if (m.restAct !== undefined && m.when !== undefined)
      errors.push(`moments[${i}] "${m.id}": when과 restAct는 상호배타`);
    if (m.restAct !== undefined && !restActKeys.has(m.restAct))
      errors.push(`moments[${i}] "${m.id}": 알 수 없는 restAct "${m.restAct}"`);
    checkCondition(m.when, `moments[${i}] "${m.id}"`);
    if (m.weight !== undefined && m.weight <= 0)
      errors.push(`moments[${i}] "${m.id}": weight는 0보다 커야 함`);
  });

  // ── 코드(SYS/UI)만 참조하는 textId도 카탈로그에 존재해야 함 ──
  // (구조 파일이 아닌 코드가 쓰는 id: sys.notification.restEnd, ui.buttons.* 등이
  //  삭제/오타나면 런타임에 '[MISSING TEXT]'가 뜨므로 여기서 잡는다)
  const codeRefs = collectCodeRefs();
  for (const id of codeRefs)
    if (!(id in catalog)) errors.push(`missing textId "${id}" (code SYS/UI)`);

  // ── 카탈로그 값 형태 · TODO · orphan ──
  const todos: string[] = [];
  for (const [id, variants] of Object.entries(catalog)) {
    if (!Array.isArray(variants) || variants.length === 0) {
      errors.push(`카탈로그 "${id}"는 비어 있지 않은 변형 배열이어야 함`);
      continue;
    }
    variants.forEach((pages, vi) => {
      if (!Array.isArray(pages) || pages.length === 0)
        errors.push(`카탈로그 "${id}"[${vi}]는 비어 있지 않은 페이지 배열이어야 함`);
      else
        pages.forEach((p, pi) => {
          if (typeof p !== 'string' || p.trim() === '')
            errors.push(`카탈로그 "${id}"[${vi}][${pi}] 빈 문자열`);
          else if (p.includes('[TODO')) todos.push(id);
        });
    });
    if (!referenced.has(id) && !codeRefs.has(id))
      warnings.push(`카탈로그 "${id}" 어디서도 참조되지 않음 (orphan)`);
  }

  return { errors, warnings, todos: [...new Set(todos)].sort() };
}

/**
 * 카탈로그 원문에서 **최상위** 중복 키 탐지 (JSON.parse는 조용히 덮으므로 원문 스캔).
 * 중첩 깊이(brace/bracket)를 세어 depth===1(루트 객체 직속) 키만 비교 →
 * 로케일이 중첩 객체를 갖게 돼도 서로 다른 하위 객체의 동일 키를 오탐하지 않는다.
 * 문자열 리터럴 안의 `{`/`}`/`"`는 깊이 계산에서 제외한다.
 */
export function findDuplicateKeys(rawJson: string): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  let depth = 0;
  let inStr = false;
  let escaped = false;
  let strStart = -1;

  for (let i = 0; i < rawJson.length; i++) {
    const c = rawJson[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') {
        inStr = false;
        // 이 문자열이 최상위 객체의 키인지: 닫는 " 다음 non-space가 ':' 이고 depth===1
        if (depth === 1) {
          let j = i + 1;
          while (j < rawJson.length && /\s/.test(rawJson[j])) j++;
          if (rawJson[j] === ':') {
            const key = rawJson.slice(strStart + 1, i);
            if (seen.has(key)) dups.add(key);
            seen.add(key);
          }
        }
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      strStart = i;
    } else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return [...dups];
}
