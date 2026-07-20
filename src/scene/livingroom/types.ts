/**
 * 거실 씬의 상태 축 — design/livingroom/scene 이 그대로 받는 모양.
 *
 * 게임 상태와 **일부러 분리**한다. 씬은 게임을 모르고, 게임은 씬의 레이어 이름을
 * 모른다. 둘을 잇는 건 fromGame.ts 한 곳뿐이라, 씬을 v3.html 에서 계속 손봐도
 * 앱이 안 깨진다.
 */

/** 시간대 — 게임의 twilight 이 씬에서는 sunset 이다 */
export type SceneTime = 'day' | 'sunset' | 'night';

export type SceneSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** 날씨 8종. 게임 날씨 6종(clear/rain/downpour/snow/petals/leaves) 위에
 *  씬 고유의 흐림 2종(cloud/fog)이 얹혀 있다 — 아직 게임 축이 없어 UI 만 기다린다. */
export type SceneWeather =
  | 'clear'
  | 'cloud'
  | 'fog'
  | 'rain'
  | 'downpour'
  | 'snow'
  | 'petals';

/** 돌이 앉은 자리 */
export type OrbSpot = 'sill' | 'rug';

export interface SceneState {
  time: SceneTime;
  season: SceneSeason;
  weather: SceneWeather;
  /** 돌 자리 — 창턱 / 러그 */
  orb: OrbSpot;
  /** 창밖 나무 — v1 침엽 / v2 활엽 */
  tree: 'v1' | 'v2';
  window: 'closed' | 'open';
  cup: 'empty' | 'full';
  /** 펼친 책 권수 0~6 (0 = 없음). 0 이면 담요가 책장에 개어져 있다 */
  readBook: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}
