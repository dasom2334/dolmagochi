/**
 * GameState → 거실 씬 상태·레이어. **게임과 씬의 유일한 접점**이다.
 *
 * 원칙: 씬이 표현할 수 있는 건 전부 표현되게 둔다. 아직 게임에 그 축이 없으면
 * 기본값으로 켜 두고 여기 한 줄로 남긴다 — UI 가 생기면 이 파일만 고치면 된다.
 * (씬을 반쪽만 켜 두면 나중에 "왜 안 나오지"를 씬 쪽에서 찾게 된다.)
 */
import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { sproutStageOf } from '../../game/sprout';
import type { DialoguesData } from '../../data/schema';
import { resolveTimeOfDay } from '../../game/timeOfDay';
import { resolveSeason } from '../../game/timeOfDay';
import type { SceneState, SceneSeason, SceneWeather } from './types';

/** 게임 날씨 7종 → 씬 날씨.
 *  꽃잎·풀잎·낙엽은 씬에서 **한 종류**로 합쳤다(색은 계절 팔레트가 정한다) — 그래서 둘 다 petals.
 *  씬 고유의 cloud/fog 는 게임에 대응 축이 없어 여기서는 안 나온다. */
const WEATHER: Record<GameState['weather'], SceneWeather> = {
  clear: 'clear',
  rain: 'rain',
  downpour: 'downpour',
  snow: 'snow',
  petals: 'petals',
  grass: 'petals',
  leaves: 'petals',
};

/** 창밖 나무는 **묘목이 된 돌**이다 — 2차 엔딩에서 심고 나면 창밖에 서 있다.
 *
 *  v2(활엽)를 쓴다. 겨울엔 렌더러가 잎을 끄고 tree-bare 로 바꾸는데, 침엽(v1)이
 *  겨울에 앙상해지는 건 앞뒤가 안 맞기 때문이다.
 *
 *  TODO: 성장 단계별 그래픽. 지금은 심은 순간부터 **한 모습**으로 고정이다.
 *  game/tree.ts 의 treeStage(plantedAt, treeBondDays, now) 가 단계를 주므로,
 *  단계별 스프라이트가 그려지면 여기서 골라 켜면 된다. */
const TREE_PLACEHOLDER = 'v2' as const;

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
    // 돌은 러그가 제자리다. 부재 중엔 'sill' 로 둔다 — 돌 자체는 hiddenLayers 가
    // 끄고, 러그에는 **눌린 자국(rug-mark)** 만 남는다. 렌더러가 orb!=='rug' 일 때만
    // 자국을 그리기 때문이다. 'rug' 로 두면 자국도 안 나와 빈 러그가 된다.
    orb: orbPresent(state) ? 'rug' : 'sill',
    tree: TREE_PLACEHOLDER,
    window: windowOpen ? 'open' : 'closed',
    // 찻잔 **내용물**은 차를 사야 생긴다. 잔(p-cup)과 별개 품목이라, 잔만 놓고
    // 김이 오르는 차가 담겨 있으면 차를 사는 의미가 없어진다.
    cup:
      state.items['cup']?.placed && (state.supplies['tea'] ?? 0) > 0
        ? 'full'
        : 'empty',
    readBook: readBookOf(state),
  };
}

/** 돌이 러그에 있나 — 심고 나면 돌은 없다(창밖 나무가 됐다).
 *  isRockPresent 만 보면, 방문 중에 심기가 성사된 판에서 돌이 러그에 영원히
 *  남는다. 나무의 방이라는 자막 밑에 돌이 앉아 있게 된다. */
function orbPresent(state: GameState): boolean {
  return isRockPresent(state) && !state.planted;
}

/** 러그에 펼친 책 — **꺼내 온 한 권의 번호**다(0 = 안 읽는 중). 권수가 아니다.
 *
 *  렌더러는 이 번호로 세 가지를 한꺼번에 정한다(render.js `visible`):
 *    · p-openbook-N 을 러그에 편다
 *    · 그 책의 책장 칸 bk-N 을 비운다 (같은 책이 두 군데 있을 수 없으니까)
 *    · 담요를 돌에 두른다 (0 이면 책장 옆에 개어 둔다)
 *
 *  그래서 **책읽기 세션 중에만** 켠다. 여기에 소장 권수를 넣었더니 책을 사는
 *  순간부터 러그에 책이 영영 펼쳐져 있고, 책장 한 칸이 이유 없이 비고,
 *  개어 둔 담요는 볼 수 없었다. */
function readBookOf(state: GameState): SceneState['readBook'] {
  if (state.phase !== 'focus' || state.selectedAction !== 'read') return 0;
  // 꺼내 오는 건 **가진** 책이라야 한다 — 없는 칸을 비워 봐야 보이지도 않는다
  return shelvedBooks(state) as SceneState['readBook'];
}

/** 1번째 칸 — 배치형 책(책·헌책). 소지 여부로 센다. */
function shelvedBooks(state: GameState): number {
  return ['book', 'book2'].filter((id) => state.items[id]?.placed).length;
}

/** 2번째 칸 — 일회용 책(오늘의 책)을 **여태 몇 권 샀는지**.
 *
 *  supplies 는 0/1 이라 못 쓴다(세션마다 소모된다). 대신 구매할 때마다
 *  memory 에 `buy-readbook` 이 쌓이고 그 count 가 곧 누적 구매 수다 —
 *  게임 상태에 새 필드를 만들 필요가 없었다. */
function readbooksBought(state: GameState): number {
  return state.memory['buy-readbook']?.count ?? 0;
}

/**
 * 끌 레이어. 씬은 **기본이 전부 켜짐**이라 여기 적은 것만 사라진다.
 *
 * 상점 소품은 배치했을 때만 보여야 하므로 안 산 것을 끈다.
 * 대응하는 게임 아이템이 아직 없는 씬 소품은 **끄지 않는다** — 그게
 * "UI 가 없어도 전부 표현되게" 의 뜻이다.
 */
export function hiddenLayers(
  state: GameState,
  animOff: boolean,
  /** 새싹 단계 판정에 필요 — gameData.dialogues 를 그대로 넘긴다 */
  dialogues: DialoguesData,
): Set<string> {
  const off = new Set<string>();
  const placed = (id: string) => !!state.items[id]?.placed;

  // 게임 아이템에 대응하는 씬 소품 — 안 샀으면 끈다.
  // 씬 그림에 **구워져 있는 것**(벽난로·스탠드·담요)도 예외가 아니다.
  // 배경이라 늘 보였는데, 사지도 않은 물건이 처음부터 방에 있으면
  // 상점에서 그걸 사는 의미가 사라진다.
  if (!placed('cushion')) off.add('p-cushion');
  if (!placed('cup')) off.add('p-cup');
  if (!placed('plant')) off.add('sill-plant');
  if (!placed('soda')) off.add('p-waterglass');
  if (!placed('windchime')) off.add('p-windchime');
  if (!placed('blanket')) {
    off.add('p-blanket');        // 책장에 개어 둔 것
    off.add('p-blanket-wrap');   // 돌을 두른 것
  }
  if (!placed('fireplace')) {
    off.add('g-fireplace');
    off.add('fire');             // 불꽃(fire-body 는 이 토글에 딸려 꺼진다)
  }
  // 스탠드는 거실 전용 품목(floorlamp)이다. 침실의 램프(lamp)와 다른 물건 —
  // 씬의 스탠드가 거실에 서 있는데 상점의 lamp 는 침실 소속이라 서로 안 맞았다.
  if (!placed('floorlamp')) {
    off.add('lamp');
    off.add('lamp-glow');
  }

  // 책장 — 처음엔 두 칸 다 비어 있다.
  //   1번째 칸(6권) 배치형 책(책·헌책)
  //   2번째 칸(4권) 일회용 책(오늘의 책) — **살 때마다** 한 권씩 꽂힌다
  for (let n = shelvedBooks(state) + 1; n <= 6; n++) off.add(`bk-${n}`);
  for (let n = readbooksBought(state) + 1; n <= 4; n++) off.add(`bk2-${n}`);

  // 창턱 새는 상점 소품이 아니라 **이벤트** 연출이다 — 이벤트 훅이 붙기 전까진 끈다.
  off.add('p-bird');

  // 창밖 나무 = 묘목이 된 돌. **심기 전에는 없다** (2차 엔딩 이후에 생긴다).
  // 겨울 앙상한 가지(tree-bare)는 계절이 알아서 잎과 바꿔 끼우므로 같이 열어 둔다.
  if (!state.planted) {
    off.add('tree-v1');
    off.add('tree-v2');
    off.add('tree-bare');
  } else {
    off.add('tree-v1');   // 안 쓰는 쪽(침엽)만 끈다 — TREE_PLACEHOLDER 참고
  }

  // 돌 상태 오버레이 — 기본은 전부 끄고 해당하는 것만 켠다.
  // 기존 RockSprite 가 하던 표현이라 캔버스로 갈아 끼우며 통째로 빠져 있었다.
  const ORB_FX = ['orb-moss', 'orb-wet', 'orb-snow',
    'orb-sprout-bud', 'orb-sprout-thrive', 'orb-sprout-wither'];
  const showFx = new Set<string>();
  if (orbPresent(state)) {
    if (placed('moss')) showFx.add('orb-moss');
    if (state.session.wetness === 'wet') showFx.add('orb-wet');
    if (state.session.wetness === 'snowy') showFx.add('orb-snow');
    const sprout = sproutStageOf(state, dialogues);
    if (sprout !== null) showFx.add(spriteOfSprout(sprout));
  }
  for (const id of ORB_FX) if (!showFx.has(id)) off.add(id);

  // 돌 부재 — 러그의 돌을 끈다. 창턱 자리(orb)는 애초에 안 쓰지만 같이 닫아 둔다.
  // 담요는 남긴다: 돌이 없어도 담요는 그 자리에 있는 게 자연스럽다.
  if (!orbPresent(state)) {
    off.add('orb');
    off.add('orb-rug');
  }

  if (animOff) off.add('anim');
  return off;
}

/** SproutStage → 씬 스프라이트.
 *  게임은 budding / thriving / rooting1 / rooting2 / 시듦(숫자) 다섯 갈래인데
 *  씬 그림은 **셋**뿐이다. 뿌리내림 둘은 무성한 쪽으로 묶고, 숫자(동거 의존도에
 *  따른 시듦)는 전부 시든 그림으로 보낸다 — 단계별 그림이 생기면 여기서 갈라낸다. */
function spriteOfSprout(stage: ReturnType<typeof sproutStageOf>): string {
  if (typeof stage === 'number') return 'orb-sprout-wither';
  if (stage === 'budding') return 'orb-sprout-bud';
  return 'orb-sprout-thrive';   // thriving / rooting1 / rooting2
}
