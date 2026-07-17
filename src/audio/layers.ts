/**
 * 소리풍경 레이어 도출 (M9) — 상황(행동 × 보유 아이템 × 실내외)에서
 * 활성 레이어 목록을 계산하는 순수 함수. 합성은 synths.ts, 재생 관리는 engine.ts.
 * M12(날씨)·M13/M-last(BGM)는 이 목록에 레이어를 추가하는 구조로 확장한다.
 */

export type LayerId =
  | 'roomBase' // 실내 기본 앰비언트 (브라운노이즈 — 기존 화이트노이즈 계승)
  | 'fireplace' // 벽난로 타닥 — 실내 + fireplace 보유
  | 'footsteps' // 산책 발소리
  | 'birdsWind' // 야외/창가 새·바람
  | 'pageTurn' // 책읽기 책장 넘김
  | 'rockingChair' // 책읽기 + rockingchair 보유 — 끼익
  | 'pageWriting' // 자유행동 + desk 보유 — 페이지·필기
  | 'cooking' // 요리 — 도마·보글
  | 'sweeping' // 집안일 — 빗자루
  | 'rainSoft' // 실내에서 듣는 창밖 빗소리 (M12)
  | 'rainHard' // 야외 빗소리 (M12)
  | 'umbrellaRain'; // 우산 위 빗방울 (M12)

/** 설정 UI 노출 순서 — 전 레이어 개별 음소거 대상 */
export const ALL_LAYERS: readonly LayerId[] = [
  'roomBase',
  'fireplace',
  'birdsWind',
  'footsteps',
  'pageTurn',
  'pageWriting',
  'rockingChair',
  'cooking',
  'sweeping',
  'rainSoft',
  'rainHard',
  'umbrellaRain',
];

export interface SoundSituation {
  /** focus면 actionId의 풍경, 그 외(휴식·행동선택 등)는 돌의 방 */
  phase: 'focus' | 'room';
  actionId: string | null;
  /** 보유 아이템 id 목록 (배치 여부 무관 — 기획 초안 "구매되어 있으면") */
  ownedItems: readonly string[];
  /** 현재 날씨 (M12) — 비·장대비면 빗소리 레이어 추가 */
  weather?: 'clear' | 'rain' | 'downpour' | 'snow';
  /** 이번 산책에 우산을 썼는가 (M12) — 야외 빗소리가 우산 위 소리로 바뀐다 */
  umbrella?: boolean;
}

/** 야외 풍경 행동 — 실내 기본음 대신 야외 레이어 */
const OUTDOOR_ACTIONS = new Set(['walk']);

/**
 * 상황 → 활성 레이어 목록. 결정적·순수 — vitest 대상.
 * 음소거 필터는 여기가 아니라 재생 쪽(engine)에서 적용한다
 * (설정 UI가 "지금 적용될 수 있는 레이어"를 알아야 하므로 도출은 전량을 돌려준다).
 */
export function deriveLayers(sit: SoundSituation): LayerId[] {
  const owned = new Set(sit.ownedItems);
  const layers: LayerId[] = [];
  const indoor =
    sit.phase !== 'focus' || !OUTDOOR_ACTIONS.has(sit.actionId ?? '');

  if (indoor) {
    layers.push('roomBase');
    if (owned.has('fireplace')) layers.push('fireplace');
  }

  const rainy = sit.weather === 'rain' || sit.weather === 'downpour';
  if (sit.phase !== 'focus') {
    if (rainy) layers.push('rainSoft'); // 방에서 듣는 창밖의 비 (M12)
    return layers;
  }

  switch (sit.actionId) {
    case 'walk':
      layers.push('footsteps', 'birdsWind');
      break;
    case 'sun':
      layers.push('birdsWind'); // 창가 — 실내 기본음 위에 바깥이 은은히
      break;
    case 'read':
      layers.push('pageTurn');
      if (owned.has('rockingchair')) layers.push('rockingChair');
      break;
    case 'free':
      if (owned.has('desk')) layers.push('pageWriting');
      break;
    case 'cook':
      layers.push('cooking');
      break;
    case 'chore':
      layers.push('sweeping');
      break;
    default:
      break; // lie·nurse·기타: 실내 기본만
  }

  // 날씨 레이어 (M12) — 비·장대비일 때만. 눈은 시각·서술 담당 (소리는 고요가 연출)
  if (rainy) {
    if (indoor) {
      layers.push('rainSoft');
    } else {
      // 야외 빗속에서는 새소리가 물러난다
      const i = layers.indexOf('birdsWind');
      if (i >= 0) layers.splice(i, 1);
      layers.push(sit.umbrella ? 'umbrellaRain' : 'rainHard');
    }
  }
  return layers;
}
