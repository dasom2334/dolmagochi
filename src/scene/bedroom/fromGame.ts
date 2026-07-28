/**
 * GameState → 침실 씬 상태·레이어. 거실 fromGame 과 같은 원칙:
 * 씬이 표현할 수 있는 건 전부 표현되게 두고, 게임에 아직 축이 없으면 기본값으로
 * 켜 둔 채 여기 한 줄로 남긴다 — UI 가 생기면 이 파일만 고치면 된다.
 *
 * 씬에 그림이 없는 침실 품목: pillow(베개는 침대에 구워져 있다 — 분리 컷이 생기면
 * 게이팅), stationery·apitoken(책상 위 그림 미정). 씬에 있는데 품목이 없는 것:
 * 스툴(bd-chair, 돌의 작업 자리라 항상 있다), 카페인(bd-deskplant, 연출 소품).
 */
import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { resolveTimeOfDay, resolveSeason } from '../../game/timeOfDay';
import { WEATHER } from '../livingroom/fromGame';
import type { BedroomSceneState, BedroomOrbSpot } from './types';
import type { SceneSeason } from '../livingroom/types';

export function bedroomSceneFrom(
  state: GameState,
  nowMs: number,
  /** 창문 열림·작업등 — 게임 축이 아니라 씬 조작(클릭 토글). SceneView 가 들고 있다 */
  windowOpen = false,
  lampOn = true,
): BedroomSceneState {
  const tod = resolveTimeOfDay(state.settings, nowMs);
  return {
    time: tod === 'twilight' ? 'sunset' : tod,
    season: resolveSeason(state.settings, nowMs) as SceneSeason,
    weather: WEATHER[state.weather] ?? 'clear',
    orb: orbSpotOf(state),
    lamp: lampOn ? 'on' : 'off',
    // 카페인 3종(커피/아아/레드불)은 아직 게임 축이 없다 — 커피 고정.
    // 소모품이 생기면 여기서 고른다.
    drink: 'coffee',
    window: windowOpen ? 'open' : 'closed',
  };
}

/** 돌이 방에 있나 — 심고 나면 돌은 없다(창밖 나무가 됐다). 거실 orbPresent 와 동일 */
function orbPresent(state: GameState): boolean {
  return isRockPresent(state) && !state.planted;
}

/** 돌의 자리 — 작업(personalWork)=의자(스툴), 누워있기(lie)=침대(없으면 러그),
 *  그 밖(휴식 페이저로 구경 온 때)=러그. 스툴은 품목이 아니라 항상 있다. */
function orbSpotOf(state: GameState): BedroomOrbSpot {
  if (!orbPresent(state)) return 'none';
  if (state.phase === 'focus') {
    if (state.selectedAction === 'personalWork') return 'chair';
    if (state.selectedAction === 'lie')
      return state.items['bed']?.placed ? 'bed' : 'rug';
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
  if (!placed('desk')) {
    off.add('bd-desk');
    // 책상 위 물건은 책상이 있어야 놓인다 — 책상 없이 켜면 허공에 뜬다
    off.add('bd-deskplant');
  }
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
  // 선풍기 — 상점의 fan 은 room: living 인데 거실 캔버스엔 선풍기 그림이 없다.
  // 침실 그림에 자리를 주되, 소속이 갈리는 건 거실 스탠드(lamp→floorlamp 개명)처럼
  // 데이터 정리가 필요하다 — PR 리뷰에서 정할 것.
  if (!placed('fan')) off.add('bd-fan');

  if (animOff) off.add('anim');
  return off;
}
