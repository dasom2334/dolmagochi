/**
 * 캔버스 씬 — design 워크트리에서 이식한 절차 렌더러(src/scene/art)를 게임 상태에
 * 물린다. 방 셋(주방·거실·침실) + 산책 야외 3종을 한 캔버스(128×72)로 그린다.
 *
 * 여기가 하는 일은 **매핑뿐**이다: 게임의 시간대·계절·날씨·소품 보유·돌 상태를
 * 렌더러의 state/off 로 옮긴다. 그림 규칙은 전부 렌더러(=design 워크트리)에 있고,
 * 이 파일에 픽셀 좌표가 나타나면 자리를 잘못 잡은 것이다.
 *
 * 시간대 이름만 서로 다르다: 게임 twilight = 렌더러 sunset.
 */
import { useEffect, useRef } from 'react';
import type { GameState } from '../../game/types';
import { gameData } from '../../store/gameStore';
import { now } from '../../store/appStore';
import { isRockPresent } from '../../game/stateMachine';
import { resolveTimeOfDay, resolveSeason } from '../../game/timeOfDay';
import { sproutStageOf } from '../../game/sprout';
import { treeStage } from '../../game/tree';
import { propVisibleInRoom, focusRoomOf, DEFAULT_ROOM } from '../../game/rooms';
// 이식한 렌더러 (plain JS — design 워크트리와 동일 소스. 규칙은 SCENE-RULES.md)
import {
  render as renderLiving,
  SHOP_PROPS as LIVING_SHOP,
} from '../../scene/art/livingroom/scene/render.js';
import {
  render as renderBedroom,
  SHOP_PROPS as BD_SHOP,
} from '../../scene/art/bedroom/render.js';
import { render as renderKitchen } from '../../scene/art/cookingroom/render.js';
import { ITEM_LAYER as KT_ITEM_LAYER } from '../../scene/art/cookingroom/geom-items.js';
import { render as renderWalk } from '../../scene/art/walk/scene.js';
import { reduceMotion } from '../../scene/art/livingroom/scene/anim.js';

const GX = 128;
const GY = 72;

/** 게임 소품 id → 거실 레이어 id들 (렌더러 SHOP_PROPS 의 부분집합만 게임에 존재) */
const LIVING_LAYER: Record<string, string[]> = {
  cushion: ['p-cushion'],
  cup: ['p-cup'],
  windchime: ['p-windchime'],
  blanket: ['p-blanket'],
  // 벽난로는 몸체와 불을 함께 켠다 — 광원(lp-fire)은 LIGHT_SOURCE가 따라온다
  fireplace: ['g-fireplace', 'fire'],
  floorlamp: ['lamp'],
  birdfeeder: ['p-bird'],
};
/** 게임 소품 id → 침실 레이어 id. desk 는 의자와 한 세트로 판다. */
const BD_LAYER: Record<string, string[]> = {
  desk: ['bd-desk', 'bd-chair'],
  laptop: ['bd-laptop'],
  lamp: ['bd-lamp'],
  fan: ['bd-fan'],
  bed: ['bd-bed'],
  pillow: ['bd-pillow'],
};
/** 카페인 종류 → 침실 렌더러 음료 그림. 붉은 황소=캔 / 3샷=테이크아웃 / 아아=아이스 */
const DRINK_OF: Record<string, string> = {
  energy: 'redbull',
  triple: 'coffee',
  iced: 'iced',
};

/** 새싹 — 게임 SproutStage → 렌더러 (stage, wither).
 *  숫자(동거 시듦 단계)는 "무성한 싹이 그만큼 시든 것"이다. */
function sproutOf(state: GameState): { sprout: string; wither: number } {
  const sp = sproutStageOf(state, gameData.dialogues);
  if (sp == null) return { sprout: 'none', wither: 0 };
  if (typeof sp === 'number')
    return { sprout: 'thriving', wither: Math.min(3, sp) };
  return { sprout: sp, wither: Math.min(3, Math.round(state.witherLevel)) };
}

/** 산책 씬 로테이션 (기획서 §178) — 날마다 다른 길로 나간다 */
const WALK_SCENES = ['ridge', 'riverside', 'homeward'] as const;

type RenderFn = (
  cv: HTMLCanvasElement,
  st: Record<string, unknown>,
  off: Set<string>,
  t: number,
) => void;

/**
 * 게임 상태 → (렌더러, 렌더 state, off 레이어)
 *
 * export 하는 이유: 여기가 게임(9종 날씨·36종 상품)과 렌더러의 문자열 키를 손으로
 * 잇는 유일한 경계인데, render를 RenderFn으로 캐스팅하는 순간 타입 검사가 사라져
 * 키 하나가 빠져도 tsc도 테스트도 아무 말을 안 한다(grass·birdfeeder가 그랬다).
 * 순수 함수라 스냅샷으로 고정할 수 있다 — __tests__/sceneOf.test.ts 참고.
 */
export function sceneOf(state: GameState): {
  render: RenderFn;
  st: Record<string, unknown>;
  off: Set<string>;
} {
  const nowMs = now();
  const tod = resolveTimeOfDay(state.settings, nowMs);
  const time = tod === 'twilight' ? 'sunset' : tod;
  const season = resolveSeason(state.settings, nowMs);
  // 흩날리는 것들은 렌더러에서 'petals' 한 종류로 접힌다. grass(풀잎비)가 빠져
  // 있어서 여름 풀잎비 날에는 입자도 구름도 색감도 안 걸린 완전한 맑음이 그려졌다
  // — 텍스트와 소리는 풀잎비라고 말하는데 그림만 맑았다.
  const weather =
    state.weather === 'leaves' || state.weather === 'grass'
      ? 'petals'
      : state.weather;
  const present = isRockPresent(state) && !state.planted;
  const { sprout, wither } = sproutOf(state);

  const isFocus = state.phase === 'focus';
  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const sceneId = isFocus ? (action?.sceneId ?? 'free') : 'room';

  const placed = (id: string) => !!state.items[id]?.placed;
  const room = isFocus
    ? focusRoomOf(state.selectedAction, gameData.rooms)
    : state.settings.lastRoom || DEFAULT_ROOM;
  const show = (id: string) => {
    if (!placed(id) || room === null) return false;
    const item = gameData.shop.find((i) => i.id === id);
    if (!item) return false;
    return propVisibleInRoom(item, gameData.rooms, room, present);
  };
  const base = { time, season, weather, sprout, wither };

  // 소모품 연출(구 SupplyProp) — **재고가 있거나 지금 쓰는 중**이면 그림이 나온다.
  // (재고는 세션 시작에 소진되고 session.supply 로 옮겨가므로 둘 다 봐야 한다.)
  // 잔만 사 두고 김 나는 차가 담겨 있으면 차를 사는 의미가 없다 — 는 규칙의 역방향.
  const stocked = (id: string) =>
    (state.supplies[id] ?? 0) > 0 || state.session.supply?.itemId === id;

  // 산책 — 야외. 실내 소품은 없다(rooms.ts focusRoomOf = null).
  if (room === null) {
    const day = Math.floor(nowMs / 86_400_000);
    return {
      render: renderWalk as RenderFn,
      st: {
        ...base,
        scene: WALK_SCENES[day % WALK_SCENES.length],
        orb: present ? 'path' : 'none',
        umbrella: state.session.umbrella ? 'on' : 'off',
        // 도시락을 싸 온 산책 — 돌 곁 피크닉 바구니, 천 색이 내용물(종류)
        basket:
          state.session.supply?.itemId === 'lunchbox'
            ? state.session.supply.variant
            : 'off',
      },
      off: new Set<string>(),
    };
  }

  if (room === 'kitchen') {
    const off = new Set<string>();
    for (const [gameId, layer] of Object.entries(
      KT_ITEM_LAYER as Record<string, string>,
    ))
      if (!show(gameId)) off.add(layer);
    return {
      render: renderKitchen as RenderFn,
      st: {
        ...base,
        variant: 'b',
        // 요리 중엔 냄비 곁(개정 v5 §176 "장면 간 위치는 바뀔 수 있다"), 평소엔 바닥
        orb: !present ? 'none' : sceneId === 'cook' ? 'sink' : 'floor',
        stove: isFocus && sceneId === 'cook' && show('pot') ? 'on' : 'off',
      },
      off,
    };
  }

  if (room === 'bedroom') {
    // bd-pillow 는 렌더러 SHOP_PROPS 에 없다(침대 유무로 자리만 갈리는 소품이라
    // 목록 밖) — off 초기값에 직접 넣지 않으면 안 산 베개가 늘 러그에 놓인다.
    const off = new Set<string>([...(BD_SHOP as string[]), 'bd-pillow']);
    for (const [gameId, layers] of Object.entries(BD_LAYER))
      if (show(gameId)) for (const l of layers) off.delete(l);
    // 소모품 — 카페인은 책상 위 음료(책상이 있어야 놓인다), 잠자리 음료는
    // 협탁+머그(김 애니 포함). 렌더러 SHOP_PROPS 라 기본 off, 여기서만 켠다.
    if (stocked('caffeine') && show('desk')) off.delete('bd-deskplant');
    if (stocked('nightdrink')) off.delete('bd-nightstand');
    return {
      render: renderBedroom as RenderFn,
      st: {
        ...base,
        variant: 'v3',
        // 침실 돌의 자리 규칙: 작업=의자 / 누워있기=침대, **받침이 없으면 러그**.
        // 안 산 침대 자리에 돌을 앉히면 벽에 떠 있게 된다(실제로 떴다).
        orb: !present
          ? 'none'
          : sceneId === 'personalWork' && show('desk')
            ? 'chair'
            : sceneId === 'lie' && show('bed')
              ? 'bed'
              : 'rug',
        lamp: time === 'night' ? 'on' : 'off',
        // 이번 카페인의 종류가 그림을 정한다 — 쓰는 중이면 그 종류, 아니면 재고 종류
        drink:
          DRINK_OF[
            (state.session.supply?.itemId === 'caffeine'
              ? state.session.supply.variant
              : state.supplyVariants['caffeine']) ?? ''
          ] ?? 'coffee',
        window: 'closed',
      },
      off,
    };
  }

  // 거실 (기본). 심은 뒤엔 창밖 나무가 단계대로 자란다(기획서 §180).
  const off = new Set<string>(LIVING_SHOP as string[]);
  for (const [gameId, layers] of Object.entries(LIVING_LAYER))
    if (show(gameId)) for (const l of layers) off.delete(l);
  if (!placed('moss')) off.add('orb-moss');
  // 비 산책에서 젖어 돌아온 돌 — 'wet' 은 물기, 'snowy' 는 눈 얹힘
  if (state.session.wetness !== 'wet') off.add('orb-wet');
  if (state.session.wetness !== 'snowy') off.add('orb-snow');
  // 부재면 orb='none' — 렌더러 visible() 이 돌·새싹을 스스로 끄고,
  // **눌린 자국(rug-mark)이 드러난다** (돌이 자리를 비웠을 때만 보이는 레이어).
  if (!present) off.add('p-blanket-wrap');   // 돌 없는 바닥에 목도리만 남았었다
  return {
    render: renderLiving as RenderFn,
    st: {
      ...base,
      orb: !present ? 'none' : sceneId === 'sun' ? 'sill' : 'rug',
      tree: 'v1',
      window: 'closed',
      // 잔에 차가 담기는 건 차(소모품)가 있을 때만 — 잔은 잔대로 사는 물건이다.
      // (렌더러는 cup==='full' 로 차·김만 더 그리고 잔 유무는 안 본다 → 여기서 게이트)
      cup: show('cup') && stocked('tea') ? 'full' : 'empty',
      // 책을 **읽는 동안만** 펼쳐 놓는다. 소유(show('book'))로 켜면 휴식 중에도
      // 내내 담요를 두르고 책이 펼쳐져 있었다.
      readBook: sceneId === 'read' ? 1 : 0,
      ptree:
        state.planted && state.plantedAt !== null
          ? treeStage(state.plantedAt, state.treeBondDays, nowMs)
          : 'none',
    },
    off,
  };
}

export function CanvasScene({ state }: { state: GameState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0;
    const t0 = performance.now();
    const still = reduceMotion();
    const draw = (nowT: number) => {
      const { render, st, off } = sceneOf(latest.current);
      if (still) off.add('anim');
      render(cv, st, off, nowT - t0);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      width={GX}
      height={GY}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated',
      }}
    />
  );
}
