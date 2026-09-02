import type { TextId, TimeOfDay } from './types';
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

/**
 * 동석 축 (피드백4-2) — 지금 이 방에 누가 있는가.
 * 문구는 이 축으로 변형을 찾는다: `{id}.absent` / `{id}.companion`.
 * 개별 호출부마다 present 분기를 쓰던 방식은 빠뜨리기 쉬워, 해석을 한곳에 모은다.
 */
export type Company = 'present' | 'absent' | 'companion';

/**
 * 시간대 축 (M23) — 밤이고 `{id}.night` 변형이 있으면 그 id로, 없으면 원본.
 * 낮·황혼은 항상 원본. 햇빛쬐기 계열이 밤에 달빛 화법으로 바뀌는 공통 경로다.
 * (동석 축과 달리 present일 때만 적용 — 부재 문구는 볕을 언급하지 않는다.)
 */
export function nightVariant(
  catalog: TextCatalog,
  id: TextId,
  tod: TimeOfDay | undefined,
): TextId {
  if (tod !== 'night') return id;
  const n: TextId = `${id}.night`;
  return catalog[n] ? n : id;
}

/**
 * 상황에 맞는 변형 id를 고른다 — 구체(축 접미사) → 공용 폴백 → 기본 순.
 * companion(3차 아이)은 부재의 한 종류라, 전용 변형이 없으면 absent로 내려온다.
 * tod가 오면 present 얼굴에 밤 변형을 겹쳐 고른다(공통 처리).
 */
export function resolveSlot(
  catalog: TextCatalog,
  baseId: TextId,
  company: Company,
  shared?: Partial<Record<Company, TextId>>,
  tod?: TimeOfDay,
): TextId {
  if (company === 'present') return nightVariant(catalog, baseId, tod);
  const chain: TextId[] =
    company === 'companion'
      ? [
          `${baseId}.companion`,
          shared?.companion ?? '',
          `${baseId}.absent`,
          shared?.absent ?? '',
        ]
      : [`${baseId}.absent`, shared?.absent ?? ''];
  return chain.find((id) => id && catalog[id]) ?? baseId;
}

/** resolveSlot + 추첨 — 문구를 꺼내는 표준 경로 */
export function pickFor(
  catalog: TextCatalog,
  baseId: TextId,
  company: Company,
  rng: Rng,
  shared?: Partial<Record<Company, TextId>>,
  tod?: TimeOfDay,
): string[] {
  return pickText(
    catalog,
    resolveSlot(catalog, baseId, company, shared, tod),
    rng,
  );
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
    gateWait: 'sys.journal.gateWait',
    gateOpen: 'sys.journal.gateOpen',
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
  /** 개인작업이 실제로 발동한 세션의 결과 한 줄 — 일지에 남는 유일한 증거 */
  personalWorkDone: 'sys.personalWork.done',
  absentAmbientCompanion: 'sys.absentAmbient.companion',
  focusEnd: 'sys.focusEnd',
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
    saveLoadFailed: 'sys.toasts.saveLoadFailed',
    saveCorrupted: 'sys.toasts.saveCorrupted',
    saveWriteFailed: 'sys.toasts.saveWriteFailed',
  },
  captions: {
    restRoom: 'sys.captions.restRoom',
    restRoomAbsent: 'sys.captions.restRoomAbsent',
    apartRoom: 'sys.captions.apartRoom',
    treeRoom: 'sys.captions.treeRoom',
  },
  notification: {
    restEnd: 'sys.notification.restEnd',
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
    cloud: 'sys.weather.cloud',
    fog: 'sys.weather.fog',
    rain: 'sys.weather.rain',
    downpour: 'sys.weather.downpour',
    snow: 'sys.weather.snow',
    petals: 'sys.weather.petals',
    grass: 'sys.weather.grass',
    leaves: 'sys.weather.leaves',
  } as Record<string, string>,
  /** 계절 전환 나레이션 (M22) — 날씨와 같은 자연 도래 화법 */
  season: {
    spring: 'sys.season.spring',
    summer: 'sys.season.summer',
    autumn: 'sys.season.autumn',
    winter: 'sys.season.winter',
  } as Record<string, string>,
  /** 시간대 전환 나레이션 (M22) */
  timeOfDay: {
    day: 'sys.timeOfDay.day',
    twilight: 'sys.timeOfDay.twilight',
    night: 'sys.timeOfDay.night',
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
    blanket: 'ui.noise.blanket',
    cooking: 'ui.noise.cooking',
    sweeping: 'ui.noise.sweeping',
    rainSoft: 'ui.noise.rainSoft',
    rainHard: 'ui.noise.rainHard',
    umbrellaRain: 'ui.noise.umbrellaRain',
    cicadas: 'ui.noise.cicadas',
  } satisfies Record<LayerId, string>,
  /**
   * 분위기 바 (M22) — 소리 모드.
   * Short는 세그먼트 탭 라벨(둘 다 늘 보인다), 긴 쪽은 고른 모드의 설명 한 줄.
   * 설명에 '아래 격자가 무슨 뜻인지'를 같이 적는다 — 모드에 따라 격자의 의미가
   * 뒤집히는데(끌 것 고르기 ↔ 틀 것 고르기) 그게 안 보여 아무도 몰랐다.
   */
  ambience: {
    modeAutoShort: 'ui.ambience.mode.autoShort',
    modeCustomShort: 'ui.ambience.mode.customShort',
    modeAuto: 'ui.ambience.mode.auto',
    modeCustom: 'ui.ambience.mode.custom',
  },
  /** 날씨·시간대 라벨 (M12) */
  weatherUi: {
    now: 'ui.weather.now',
    kinds: {
      clear: 'ui.weather.kind.clear',
      cloud: 'ui.weather.kind.cloud',
      fog: 'ui.weather.kind.fog',
      rain: 'ui.weather.kind.rain',
      downpour: 'ui.weather.kind.downpour',
      snow: 'ui.weather.kind.snow',
      // 계절 한정 날씨 (M12) — 빠져 있어 봄·가을 상점에서 '[MISSING TEXT]'가 떴다
      petals: 'ui.weather.kind.petals',
      grass: 'ui.weather.kind.grass',
      leaves: 'ui.weather.kind.leaves',
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
  /**
   * 알림 권한 안내 (M24) — 첫 진입 소프트 프롬프트 + 설정의 권한 상태 표시.
   * 네이티브 다이얼로그는 사실상 일회용이라(거부되면 재요청 불가) 먼저 여기서 묻는다.
   */
  notify: {
    ask: 'ui.notify.ask',
    askYes: 'ui.notify.askYes',
    askLater: 'ui.notify.askLater',
    permission: 'ui.notify.permission',
    permGranted: 'ui.notify.permGranted',
    permDenied: 'ui.notify.permDenied',
    permDefault: 'ui.notify.permDefault',
    permUnsupported: 'ui.notify.permUnsupported',
    deniedHint: 'ui.notify.deniedHint',
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
  /** 새 버전 대기 배너 (PWA 갱신, src/pwa.ts) */
  update: {
    ready: 'ui.update.ready',
    action: 'ui.update.action',
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
    stocked: 'ui.shop.stocked', // 소장품의 소모품 — 재고가 방에 있다 (토글 없음)
  },
  tabs: ['ui.tabs.journal', 'ui.tabs.talk', 'ui.tabs.select', 'ui.tabs.shop'],
} as const;
