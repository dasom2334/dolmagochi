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

/** 책상 위 카페인 — 아직 게임 축이 없어 커피로 고정. 품목이 생기면 fromGame 서 고른다 */
export type BedroomDrink = 'coffee' | 'iced' | 'redbull';

export interface BedroomSceneState {
  time: SceneTime;
  season: SceneSeason;
  weather: SceneWeather;
  orb: BedroomOrbSpot;
  /** 작업등 — 켜면 스탠드 발광 + 모니터 발광 (각자 lamp-glow/screen-glow 로 끌 수 있다) */
  lamp: 'on' | 'off';
  drink: BedroomDrink;
  window: 'closed' | 'open';
}
