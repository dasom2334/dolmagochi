import type { TextId } from './types';
import type { Rng } from './rng';
import type { LayerId } from '../audio/layers';

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
    sessionStartCompanion: 'sys.journal.sessionStartCompanion',
    rockReturned: 'sys.journal.rockReturned',
    rockSick: 'sys.journal.rockSick',
    rockRecovered: 'sys.journal.rockRecovered',
    crisisRetreat: 'sys.journal.crisisRetreat',
    crisisSick: 'sys.journal.crisisSick',
    gotWet: 'sys.journal.gotWet',
    gotSnowy: 'sys.journal.gotSnowy',
    bloom: 'sys.journal.bloom',
    bloomAfar: 'sys.journal.bloomAfar',
    farewell2: 'sys.journal.farewell2',
    witherEase: 'sys.journal.witherEase',
    rootingStill: 'sys.journal.rootingStill',
    companionWorry: 'sys.journal.companionWorry',
    restShort: 'sys.journal.restShort',
    restSkipped: 'sys.journal.restSkipped',
    visitStart: 'sys.journal.visitStart',
    visitEnd: 'sys.journal.visitEnd',
  },
  absentAmbient: 'sys.absentAmbient',
  /** 3차 각성 강제 이벤트 (피드백6) */
  awakening: {
    result0: 'tree.awakening.o0.r0',
    result1: 'tree.awakening.o1.r0',
  },
  companionMeet: 'dlg.companionMeet',
  /** 자유행동 위임 (피드백2) — 돌이 원하는 세션 공개 */
  delegate: {
    wants: 'sys.delegate.wants',
    locked: 'sys.delegate.locked',
    personal: 'sys.delegate.personal',
  },
  absentAmbientCompanion: 'sys.absentAmbient.companion',
  focusEnd: 'sys.focusEnd',
  focusEndAbsent: 'sys.focusEndAbsent',
  focusEndCompanion: 'sys.focusEnd.companion',
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
    actionUnlocked: 'sys.toasts.actionUnlocked', // {action} — 구매로 행동 해금
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
    treeRoom: 'sys.captions.treeRoom',
  },
  notification: {
    restEnd: 'sys.notification.restEnd',
    restEndAbsent: 'sys.notification.restEnd.absent',
    restEndCompanion: 'sys.notification.restEnd.companion',
    focusMark: 'sys.notification.focusMark', // {min}
  },
  singleTab: {
    occupied: 'sys.singleTab.occupied',
    occupiedHint: 'sys.singleTab.occupiedHint',
    promoted: 'sys.singleTab.promoted',
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
  /** 휴식 일지의 정성적 욕구 관찰 한 줄 — 숫자 없이 밴드(0/1/2)별 어휘만 */
  needsGlance: {
    frame: 'sys.needsGlance.frame', // {physiological} {safety} {belonging} {esteem}
    words: {
      physiological: [
        'sys.needsGlance.phys.0',
        'sys.needsGlance.phys.1',
        'sys.needsGlance.phys.2',
      ],
      safety: [
        'sys.needsGlance.safety.0',
        'sys.needsGlance.safety.1',
        'sys.needsGlance.safety.2',
      ],
      belonging: [
        'sys.needsGlance.belonging.0',
        'sys.needsGlance.belonging.1',
        'sys.needsGlance.belonging.2',
      ],
      esteem: [
        'sys.needsGlance.esteem.0',
        'sys.needsGlance.esteem.1',
        'sys.needsGlance.esteem.2',
      ],
    },
  },
  /** 최결핍 욕구 강조 힌트 (M16) — 사다리를 막는 욕구가 바닥 밴드일 때 한 줄 */
  needsHint: {
    physiological: 'sys.needsHint.physiological',
    safety: 'sys.needsHint.safety',
    belonging: 'sys.needsHint.belonging',
    esteem: 'sys.needsHint.esteem',
  } as Record<string, string>,
  // 호감도 7티어와 1:1 — 티어마다 고유 관찰 문구 (인덱스 = 티어-1)
  trustLadder: [
    'sys.trust.0',
    'sys.trust.1',
    'sys.trust.2',
    'sys.trust.3',
    'sys.trust.4',
    'sys.trust.5',
    'sys.trust.6',
  ],
  planting: 'sys.planting',
  /** 뿌리내림기 (M19b) — 진입 1회의 잘라내기 선택. 예=잘라내 본다 / 아니오=둔다 */
  rooting: {
    prompt: 'sys.rooting.prompt',
    cut: 'sys.rooting.cut',
    leave: 'sys.rooting.leave',
  },
  farewell2: 'sys.farewell2',
  farewell2Apart: 'sys.farewell2.apart',
  trustAbsent: 'sys.trustAbsent',
  restIncomplete: 'sys.restIncomplete.prompt',
  /** 추억의 선택 기록 재생 (M11a) — {label} */
  remembrance: {
    choice: 'sys.remembrance.choice',
    locked: 'sys.remembrance.locked',
  },
  /** 날씨 변경 서술 (M12) — 종류별 */
  weather: {
    clear: 'sys.weather.clear',
    rain: 'sys.weather.rain',
    downpour: 'sys.weather.downpour',
    snow: 'sys.weather.snow',
    petals: 'sys.weather.petals',
    leaves: 'sys.weather.leaves',
  } as Record<string, string>,
  /** 돌이 곁에 없을 때의 날씨 변경 서술 — 돌 반응 누출 방지 */
  weatherAbsent: {
    clear: 'sys.weather.clear.absent',
    rain: 'sys.weather.rain.absent',
    downpour: 'sys.weather.downpour.absent',
    snow: 'sys.weather.snow.absent',
    petals: 'sys.weather.petals.absent',
    leaves: 'sys.weather.leaves.absent',
  } as Record<string, string>,
} as const;

/** 순수 UI 단문 id 상수 (M2에서 사용) */
export const UI = {
  /** 소리풍경 레이어 라벨 (M9) — LayerId 추가 시 라벨 누락은 컴파일 에러로 잡힌다 */
  noiseLayers: {
    roomBase: 'ui.noise.roomBase',
    fireplace: 'ui.noise.fireplace',
    birdsWind: 'ui.noise.birdsWind',
    footsteps: 'ui.noise.footsteps',
    pageTurn: 'ui.noise.pageTurn',
    pageWriting: 'ui.noise.pageWriting',
    rockingChair: 'ui.noise.rockingChair',
    cooking: 'ui.noise.cooking',
    sweeping: 'ui.noise.sweeping',
    rainSoft: 'ui.noise.rainSoft',
    rainHard: 'ui.noise.rainHard',
    umbrellaRain: 'ui.noise.umbrellaRain',
    cicadas: 'ui.noise.cicadas',
  } satisfies Record<LayerId, string>,
  /** 날씨·시간대 라벨 (M12) */
  weatherUi: {
    now: 'ui.weather.now',
    change: 'ui.weather.change', // {price}
    kinds: {
      clear: 'ui.weather.kind.clear',
      rain: 'ui.weather.kind.rain',
      downpour: 'ui.weather.kind.downpour',
      snow: 'ui.weather.kind.snow',
    } as Record<string, string>,
    umbrellaAsk: 'ui.weather.umbrellaAsk',
    umbrellaYes: 'ui.weather.umbrellaYes',
    umbrellaNo: 'ui.weather.umbrellaNo',
    timeSetting: 'ui.time.setting',
    timeModes: {
      auto: 'ui.time.auto',
      day: 'ui.time.day',
      twilight: 'ui.time.twilight',
      night: 'ui.time.night',
    } as Record<string, string>,
    seasonSetting: 'ui.season.setting',
    seasonModes: {
      auto: 'ui.season.auto',
      spring: 'ui.season.spring',
      summer: 'ui.season.summer',
      autumn: 'ui.season.autumn',
      winter: 'ui.season.winter',
    } as Record<string, string>,
  },
  /** 테마 라벨 (M10) */
  theme: {
    setting: 'ui.theme.setting',
    auto: 'ui.theme.auto',
    light: 'ui.theme.light',
    dark: 'ui.theme.dark',
  },
  /** 도감 앨범 (M19d) */
  album: {
    pickHint: 'ui.album.pickHint',
  },
  /** 세션 포크 (M18) — 개막 후 집중 시작이 둘로 갈라진다. {action} */
  approach: {
    near: 'ui.approach.near',
    apart: 'ui.approach.apart',
  },
  awakening: {
    option0: 'tree.awakening.o0.label',
    option1: 'tree.awakening.o1.label',
  },
  delegate: {
    start: 'ui.delegate.start',
    confirm: 'ui.delegate.confirm',
  },
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
    timerGroup: 'ui.labels.timerGroup',
    notifyAll: 'ui.labels.notifyAll',
    notifyRest: 'ui.labels.notifyRest',
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
    subStore: 'ui.shop.subStore', // 물건 탭 내부: 진열대(지금 살 수 있는 것만)
    subOwned: 'ui.shop.subOwned', // 물건 탭 내부: 소장품(보유·재고 + 배치/보관)
    subBadges: 'ui.shop.subBadges', // 물건 탭 내부: 기억(도감 — 뱃지·추억, M11a)
    badgesEmpty: 'ui.shop.badgesEmpty', // 도감 빈 상태
    ownedEmpty: 'ui.shop.ownedEmpty', // 소장품 빈 상태
    storeEmpty: 'ui.shop.storeEmpty', // 진열대 빈 상태 (전부 보유/재고)
    poor: 'ui.shop.poor',
    price: 'ui.shop.price', // {price}
    place: 'ui.shop.place',
    stash: 'ui.shop.stash',
  },
  tabs: ['ui.tabs.journal', 'ui.tabs.talk', 'ui.tabs.select', 'ui.tabs.shop'],
} as const;
