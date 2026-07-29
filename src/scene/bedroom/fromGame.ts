/**
 * GameState → 침실 씬 상태·레이어. 거실 fromGame 과 같은 원칙:
 * 씬이 표현할 수 있는 건 전부 표현되게 두고, 게임에 아직 축이 없으면 기본값으로
 * 켜 둔 채 여기 한 줄로 남긴다 — UI 가 생기면 이 파일만 고치면 된다.
 *
 * 씬에 그림이 없는 침실 품목: stationery·apitoken(책상 위 그림 미정).
 * 씬에 있는데 품목이 없는 것: 없음 — 스툴은 책상에 딸려 온다(책상 앞 의자).
 */
import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { resolveTimeOfDay, resolveSeason } from '../../game/timeOfDay';
import { WEATHER } from '../livingroom/fromGame';
import type { BedroomSceneState, BedroomOrbSpot, BedroomDrink } from './types';
import type { SceneSeason } from '../livingroom/types';

export function bedroomSceneFrom(
  state: GameState,
  nowMs: number,
  /** 창문 열림·작업등 — 게임 축이 아니라 씬 조작(클릭 토글). SceneView 가 들고 있다 */
  windowOpen = false,
  lampOn = true,
  screenOn = true,
): BedroomSceneState {
  const tod = resolveTimeOfDay(state.settings, nowMs);
  return {
    time: tod === 'twilight' ? 'sunset' : tod,
    season: resolveSeason(state.settings, nowMs) as SceneSeason,
    weather: WEATHER[state.weather] ?? 'clear',
    orb: orbSpotOf(state),
    lamp: lampOn ? 'on' : 'off',
    screen: screenOn ? 'on' : 'off',
    frames: framesOf(state),
    drink: drinkOf(state),
    window: windowOpen ? 'open' : 'closed',
  };
}

/** 벽에 걸린 액자 수 — **호감도 100% 를 7등분**해 한 칸 오를 때마다 한 장 걸린다.
 *  액자 그림은 돌과의 추억이라(볕 쬐는 돌, 두 돌, 창가의 돌 …) 사이가 깊어질수록
 *  벽이 채워지는 게 맞다. 게임에도 AFFECTION_TIERS 7단계가 있지만 간격이 고르지
 *  않아(0/6/23/43/61/78/95) 그대로 쓰면 초반에 몰린다 — 균등 7등분으로 간다. */
const FRAME_COUNT = 7;
function framesOf(state: GameState): number {
  const a = Math.max(0, Math.min(100, state.stats?.affection ?? 0));
  return Math.min(FRAME_COUNT, Math.floor((a / 100) * FRAME_COUNT));
}

/** 책상 위 카페인 — 소모품 '잠 깨는 것'(caffeine)의 **이번 종류**가 그림을 정한다.
 *  붉은 황소=레드불 캔 / 3샷 커피=테이크아웃 컵 / 아이스 아메리카노=아이스 컵.
 *  어느 것이 잡힐지는 상점 진열이 추첨하므로(rest.offers) 여기선 고르기만 한다. */
const DRINK_OF_VARIANT: Record<string, BedroomDrink> = {
  energy: 'redbull',
  triple: 'coffee',
  iced: 'iced',
};
function drinkOf(state: GameState): BedroomDrink {
  // 세션에 쓰는 중이면 그 종류, 아니면 재고의 종류
  const inUse =
    state.session.supply?.itemId === 'caffeine'
      ? state.session.supply.variant
      : null;
  const key = inUse ?? state.supplyVariants['caffeine'];
  return (key && DRINK_OF_VARIANT[key]) || 'coffee';
}

/** 책상 위에 카페인이 놓여 있나 — **재고가 있거나 지금 마시는 중**일 때만.
 *  거실 찻잔과 같은 규칙이다(잔만 놓고 김 나는 차가 담겨 있으면 차를 사는 의미가 없다). */
function caffeinePresent(state: GameState): boolean {
  return (
    (state.supplies['caffeine'] ?? 0) > 0 ||
    state.session.supply?.itemId === 'caffeine'
  );
}

/** 돌이 방에 있나 — 심고 나면 돌은 없다(창밖 나무가 됐다). 거실 orbPresent 와 동일 */
function orbPresent(state: GameState): boolean {
  return isRockPresent(state) && !state.planted;
}

/** 돌의 자리 — 작업(personalWork)=의자(스툴), 누워있기(lie)=침대,
 *  그 밖(휴식 페이저로 구경 온 때)=러그.
 *  **가구가 없으면 러그**다 — 없는 의자·침대 위에 돌만 떠 있으면 안 된다.
 *  (스툴은 책상에 딸려 오므로 책상 소지를 본다) */
function orbSpotOf(state: GameState): BedroomOrbSpot {
  if (!orbPresent(state)) return 'none';
  const placed = (id: string) => !!state.items[id]?.placed;
  if (state.phase === 'focus') {
    if (state.selectedAction === 'personalWork' && placed('desk')) return 'chair';
    if (state.selectedAction === 'lie' && placed('bed')) return 'bed';
  }
  return 'rug';
}

/**
 * 끌 레이어. 씬은 **기본이 전부 켜짐**이라 여기 적은 것만 사라진다.
 * 상점 소품은 배치했을 때만 보여야 하므로 안 산 것을 끈다 — 씬 그림에 구워져
 * 있어도 예외가 아니다(거실 벽난로와 같은 이유).
 */
export function hiddenBedroomLayers(state: GameState, animOff: boolean): Set<string> {
  const off = new Set<string>();
  const placed = (id: string) => !!state.items[id]?.placed;

  if (!placed('bed')) off.add('bd-bed');
  // 베개는 침대와 **별개 품목**이고 더 싸다(bed requires pillow) — 침대가 없으면
  // 렌더러가 러그 위 자리로 그린다. 여기선 소지 여부만 본다.
  if (!placed('pillow')) off.add('bd-pillow');
  // 스툴은 책상 앞 의자다 — 책상을 사면 딸려 온다(따로 파는 품목이 아니다)
  if (!placed('desk')) {
    off.add('bd-desk');
    off.add('bd-chair');
  }
  // 카페인은 소모품 — 재고가 있거나 지금 마시는 중일 때만 책상에 놓인다
  if (!placed('desk') || !caffeinePresent(state)) off.add('bd-deskplant');
  if (!placed('laptop') || !placed('desk')) {
    off.add('bd-laptop');
    off.add('screen-glow');
  }
  // lamp 는 침실 소속 스탠드 품목(거실 것은 floorlamp — fromGame.ts(거실) 참고)
  if (!placed('lamp') || !placed('desk')) {
    off.add('bd-lamp');
    off.add('lamp-glow');
  }
  // 나이트드링크 = 협탁 위 김 나는 잔. 협탁과 잔이 한 레이어라 품목 하나로 같이 온다
  if (!placed('nightdrink')) off.add('bd-nightstand');
  // 선풍기 — shop.json 에서 침실 소속으로 옮겼다(거실 캔버스엔 선풍기 그림이 없다)
  if (!placed('fan')) off.add('bd-fan');

  if (animOff) off.add('anim');
  return off;
}
