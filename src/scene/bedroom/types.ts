/**
 * 침실 씬의 상태 축 — src/scene/bedroom/render.js 가 그대로 받는 모양.
 *
 * 거실과 같은 원칙: 게임 상태와 **일부러 분리**한다. 씬은 게임을 모르고, 게임은
 * 씬의 레이어 이름을 모른다. 둘을 잇는 건 fromGame.ts 한 곳뿐이다.
 * 시간·계절·날씨 축은 거실과 공유한다(팔레트·오버레이가 거실 모듈이므로).
 */
import type { SceneTime, SceneSeason, SceneWeather } from '../livingroom/types';

/** 돌이 앉은 자리 — 작업=의자(스툴), 누워있기=침대, 그 밖=러그. none=부재 */
export type BedroomOrbSpot = 'none' | 'chair' | 'bed' | 'rug';

/** 책상 위 카페인 — 소모품 '잠 깨는 것'(caffeine)의 종류가 정한다:
 *  붉은 황소=redbull / 3샷 커피=coffee / 아이스 아메리카노=iced */
export type BedroomDrink = 'coffee' | 'iced' | 'redbull';

export interface BedroomSceneState {
  time: SceneTime;
  season: SceneSeason;
  weather: SceneWeather;
  orb: BedroomOrbSpot;
  /** 책상 스탠드 불 — 스탠드를 눌러 켜고 끈다 */
  lamp: 'on' | 'off';
  /** 랩탑 화면 불 — 랩탑을 눌러 켜고 끈다. 스탠드와 **따로** 논다 */
  screen: 'on' | 'off';
  /** 벽에 걸린 액자 수(0~7) — 호감도가 오를수록 추억이 한 장씩 늘어난다 */
  frames: number;
  drink: BedroomDrink;
  window: 'closed' | 'open';
}
