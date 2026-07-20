/**
 * GameState → 거실 씬 상태·레이어. **게임과 씬의 유일한 접점**이다.
 *
 * 원칙: 씬이 표현할 수 있는 건 전부 표현되게 둔다. 아직 게임에 그 축이 없으면
 * 기본값으로 켜 두고 여기 한 줄로 남긴다 — UI 가 생기면 이 파일만 고치면 된다.
 * (씬을 반쪽만 켜 두면 나중에 "왜 안 나오지"를 씬 쪽에서 찾게 된다.)
 */
import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { resolveTimeOfDay } from '../../game/timeOfDay';
import { resolveSeason } from '../../game/timeOfDay';
import type { SceneState, SceneSeason, SceneWeather } from './types';

/** 게임 날씨 6종 → 씬 날씨.
 *  꽃잎·낙엽은 씬에서 **한 종류**로 합쳤다(색은 계절 팔레트가 정한다) — 그래서 둘 다 petals.
 *  씬 고유의 cloud/fog 는 게임에 대응 축이 없어 여기서는 안 나온다. */
const WEATHER: Record<GameState['weather'], SceneWeather> = {
  clear: 'clear',
  rain: 'rain',
  downpour: 'downpour',
  snow: 'snow',
  petals: 'petals',
  leaves: 'petals',
};

/** 창밖 나무는 **묘목이 된 돌**의 자리다(성장 단계별로 모습이 달라질 예정).
 *  지금 v1/v2 는 그 자리를 잡아 두려고 그려 둔 시험용이라 **아직 안 보인다**.
 *  성장 단계가 붙으면 hiddenLayers 에서 'tree-v1'/'tree-v2' 를 빼고 단계로 고른다. */
const TREE_PLACEHOLDER = 'v1' as const;

export function sceneStateFrom(
  state: GameState,
  nowMs: number,
  /** 창문 열림 — 게임 축이 아니라 씬 조작(유리를 클릭해 연다) */
  windowOpen = false,
): SceneState {
  const tod = resolveTimeOfDay(state.settings, nowMs);
  const season = resolveSeason(state.settings, nowMs) as SceneSeason;

  return {
    // 게임 twilight = 씬 sunset (같은 시간대, 이름만 다르다)
    time: tod === 'twilight' ? 'sunset' : tod,
    season,
    weather: WEATHER[state.weather] ?? 'clear',
    // 돌은 러그가 제자리다. 부재 중이면 아래 hiddenLayers 가 돌 자체를 끈다.
    orb: 'rug',
    tree: TREE_PLACEHOLDER,
    window: windowOpen ? 'open' : 'closed',
    cup: state.items['cup']?.placed ? 'full' : 'empty',
    readBook: readBookOf(state),
  };
}

/** 펼친 책 권수 0~6 — 권마다 표지·책등 색이 다르다.
 *  책을 안 샀으면 0(=담요가 책장에 개어져 있는 상태). */
function readBookOf(state: GameState): SceneState['readBook'] {
  const owned = ['book', 'book2'].filter((id) => state.items[id]?.placed).length;
  return Math.min(6, owned) as SceneState['readBook'];
}

/**
 * 끌 레이어. 씬은 **기본이 전부 켜짐**이라 여기 적은 것만 사라진다.
 *
 * 상점 소품은 배치했을 때만 보여야 하므로 안 산 것을 끈다.
 * 대응하는 게임 아이템이 아직 없는 씬 소품은 **끄지 않는다** — 그게
 * "UI 가 없어도 전부 표현되게" 의 뜻이다.
 */
export function hiddenLayers(state: GameState, animOff: boolean): Set<string> {
  const off = new Set<string>();
  const placed = (id: string) => !!state.items[id]?.placed;

  // 게임 아이템에 대응하는 씬 소품 — 안 샀으면 끈다
  if (!placed('cushion')) off.add('p-cushion');
  if (!placed('cup')) off.add('p-cup');
  if (!placed('plant')) off.add('sill-plant');
  if (!placed('soda')) off.add('p-waterglass');
  // 풍경은 main 의 shop.json 엔 아직 없고 콘텐츠 브랜치에 있다.
  // 미리 이어 두면 그 브랜치가 들어올 때 저절로 붙는다 — 지금은 항상 false 라 꺼진다.
  if (!placed('windchime')) off.add('p-windchime');

  // 창턱 새는 상점 소품이 아니라 **이벤트** 연출이다 — 이벤트 훅이 붙기 전까진 끈다.
  off.add('p-bird');

  // 창밖 나무는 묘목이 된 돌의 자리(시험용 배치) — 성장 단계가 붙기 전까진 끈다.
  off.add('tree-v1');
  off.add('tree-v2');
  off.add('tree-bare');

  // 담요(p-blanket / p-blanket-wrap)는 **다른 브랜치에서 정해진다** → 손대지 않는다.

  // 돌 부재 — 돌과 그 부속(방석 앞판·자국)을 함께 끈다.
  // 담요는 남긴다: 돌이 없어도 담요는 그 자리에 있는 게 자연스럽다.
  if (!isRockPresent(state)) {
    off.add('orb');
    off.add('orb-rug');
  }

  if (animOff) off.add('anim');
  return off;
}
