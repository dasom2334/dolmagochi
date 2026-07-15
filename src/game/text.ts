import type { TextId } from './types';
import type { Rng } from './rng';

/** 로케일 카탈로그: textId → 변형 배열 → 페이지 배열 (페이지 안 \n = 줄바꿈) */
export type TextCatalog = Record<string, string[][]>;

/** 변형 하나를 추첨해 페이지 배열로 돌려준다. 누락 id는 표식 문자열로. */
export function pickText(catalog: TextCatalog, id: TextId, rng: Rng): string[] {
  const variants = catalog[id];
  if (!variants || variants.length === 0) return [`[MISSING TEXT: ${id}]`];
  return variants[Math.floor(rng() * variants.length)] ?? [];
}

/** 변형을 인덱스로 지정 (붙잡기 문구 단계 상승 등). 범위 밖은 마지막 변형. */
export function textVariantAt(
  catalog: TextCatalog,
  id: TextId,
  index: number,
): string[] {
  const variants = catalog[id];
  if (!variants || variants.length === 0) return [`[MISSING TEXT: ${id}]`];
  return variants[Math.min(index, variants.length - 1)];
}

/** {var} 치환 — 페이지 전체에 적용 */
export function fillPages(
  pages: string[],
  vars: Record<string, string | number>,
): string[] {
  return pages.map((p) =>
    p.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)),
  );
}

/** 화자 시스템 문구 id 상수 (본문은 카탈로그) */
export const SYS = {
  journal: {
    sessionStartAbsent: 'sys.journal.sessionStartAbsent',
    rockReturned: 'sys.journal.rockReturned',
    visitStart: 'sys.journal.visitStart',
    visitEnd: 'sys.journal.visitEnd',
  },
  absentAmbient: 'sys.absentAmbient',
  focusEnd: 'sys.focusEnd',
  focusEndAbsent: 'sys.focusEndAbsent',
  restSummary: 'sys.restSummary',
  talkSpent: 'sys.talkSpent',
  talkSpentAbsent: 'sys.talkSpent.absent',
  nextActionNote: 'sys.nextActionNote',
  status: {
    focus: 'sys.status.focus',
    focusAbsent: 'sys.status.focusAbsent',
    rest: 'sys.status.rest',
  },
  toasts: {
    purchase: 'sys.toasts.purchase',
    absenceStart: 'sys.toasts.absenceStart',
    importOk: 'sys.toasts.importOk',
    importFail: 'sys.toasts.importFail',
    importVersion: 'sys.toasts.importVersion',
    exportOk: 'sys.toasts.exportOk',
  },
  captions: {
    restRoom: 'sys.captions.restRoom',
    restRoomAbsent: 'sys.captions.restRoomAbsent',
    apartRoom: 'sys.captions.apartRoom',
  },
  notification: {
    restEnd: 'sys.notification.restEnd',
    focusMark: 'sys.notification.focusMark', // {min}
  },
  placement: { prompt: 'sys.placement.prompt' },
  hints: { flowtime: 'sys.hints.flowtime' },
  settings: {
    noiseOn: 'sys.settings.noiseOn',
    noiseOff: 'sys.settings.noiseOff',
    on: 'sys.settings.on',
    off: 'sys.settings.off',
    farewell: 'sys.settings.farewell',
  },
  trustLadder: ['sys.trust.0', 'sys.trust.1', 'sys.trust.2', 'sys.trust.3'],
  trustAbsent: 'sys.trustAbsent',
  restIncomplete: 'sys.restIncomplete.prompt',
} as const;

/** 순수 UI 단문 id 상수 (M2에서 사용) */
export const UI = {
  buttons: {
    endFocus: 'ui.buttons.endFocus',
    startFocus: 'ui.buttons.startFocus',
    talk: 'ui.buttons.talk',
    yes: 'ui.buttons.yes',
    no: 'ui.buttons.no',
    settings: 'ui.buttons.settings',
    close: 'ui.buttons.close',
    epilogueDone: 'ui.buttons.epilogueDone',
    startAnyway: 'ui.buttons.startAnyway',
    keepResting: 'ui.buttons.keepResting',
    exportSave: 'ui.buttons.exportSave',
    importSave: 'ui.buttons.importSave',
    resetFlowtime: 'ui.buttons.resetFlowtime',
    back: 'ui.buttons.back',
  },
  labels: {
    locked: 'ui.labels.locked',
    modeFocus: 'ui.labels.modeFocus',
    modeRest: 'ui.labels.modeRest',
    care: 'ui.labels.care', // {points}
    noiseSetting: 'ui.labels.noiseSetting',
    soundSetting: 'ui.labels.soundSetting',
    soundGroup: 'ui.labels.soundGroup',
    notifyGroup: 'ui.labels.notifyGroup',
    notifyAll: 'ui.labels.notifyAll',
    notifyRest: 'ui.labels.notifyRest',
    notifyFocusHint: 'ui.labels.notifyFocusHint',
    tierNotify: 'ui.labels.tierNotify',
    flowtime: {
      title: 'ui.labels.flowtimeTitle',
      hint: 'ui.labels.flowtimeHint',
      under: 'ui.labels.flowtimeUnder',
      above: 'ui.labels.flowtimeAbove',
      restSuffix: 'ui.labels.flowtimeRestSuffix',
    },
    pauseOnHide: 'ui.labels.pauseOnHide',
  },
  shop: {
    owned: 'ui.shop.owned',
    poor: 'ui.shop.poor',
    price: 'ui.shop.price', // {price}
    place: 'ui.shop.place',
    stash: 'ui.shop.stash',
  },
  tabs: ['ui.tabs.journal', 'ui.tabs.talk', 'ui.tabs.select', 'ui.tabs.shop'],
} as const;
