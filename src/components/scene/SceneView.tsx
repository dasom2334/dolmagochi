import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { gameData } from '../../store/gameStore';
import { appStore, now, t } from '../../store/appStore';
import { SYS } from '../../game/text';
import { Floor } from './Floor';
import { WindowSprite } from './WindowSprite';
import { DaySun } from './DaySun';
import { TimeTint, WeatherFx } from './WeatherFx';
import { resolveTimeOfDay } from '../../game/timeOfDay';
import { DEFAULT_ROOM, focusRoomOf, propVisibleInRoom, stepRoom } from '../../game/rooms';
import { SunPatch } from './SunPatch';
import { GrassTufts } from './GrassTufts';
import { RockSprite, RockShadow } from './RockSprite';
import { TreeSprite } from './TreeSprite';
import { treeStage } from '../../game/tree';
import { sproutStageOf } from '../../game/sprout';
import { PlantProp } from './props/PlantProp';
import { PillowProp } from './props/PillowProp';
import { CushionProp } from './props/CushionProp';
import { ShoesProp } from './props/ShoesProp';
import { ReadBookProp } from './props/ReadBookProp';
import { PotProp } from './props/PotProp';
import { BroomProp } from './props/BroomProp';
import { BedProp } from './props/BedProp';
import { UmbrellaProp } from './props/UmbrellaProp';
import { FireplaceProp } from './props/FireplaceProp';
import { RockingChairProp } from './props/RockingChairProp';
import { BrushProp } from './props/BrushProp';
import { BoardProp } from './props/BoardProp';
import { LadleProp } from './props/LadleProp';
import { DeskProp } from './props/DeskProp';
import { StationeryProp } from './props/StationeryProp';
import { LaptopProp } from './props/LaptopProp';
import { SupplyProp } from './SupplyProp';
import { StockProp, STOCK_PROP_IDS } from './StockProp';
import { SodaProp } from './props/SodaProp';
import { CupProp } from './props/CupProp';
import { FanProp } from './props/FanProp';
import { LampProp } from './props/LampProp';
import { BookProp } from './props/BookProp';
import { LivingRoomArt } from './LivingRoomArt';

/** 행동별 풍경 색 (디자인 원본 값 그대로 — cook/chore 씬은 디자인 미정, 방 색으로 폴백) */
const SCENE_COLORS: Record<string, { bg: string; floor: string; line: string }> = {
  walk: { bg: '#2e3d49', floor: '#2e4430', line: '#3a5440' },
  sun: { bg: '#3d3446', floor: '#4a4053', line: '#5a4e66' },
  read: { bg: '#2b2436', floor: '#3a3145', line: '#453a56' },
  lie: { bg: '#232030', floor: '#2d2838', line: '#3a3348' },
  nurse: { bg: '#2a2530', floor: '#37303c', line: '#463c4e' },
};
/** 방 팔레트는 rooms.json (개정 v5) — 미묘한 색조 변주만, 시간대는 전역 */
const roomById = (id: string) =>
  gameData.rooms.find((r) => r.id === id) ?? gameData.rooms[1];

export function SceneView({ state }: { state: GameState }) {
  const isFocus = state.phase === 'focus';
  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const sceneId = isFocus ? (action?.sceneId ?? 'free') : 'room';
  const currentRoom = state.settings.lastRoom || DEFAULT_ROOM;
  // 집중: 행동 풍경 고정 (cook/chore는 자기 방=주방 팔레트로 폴백, v5).
  // 휴식: 현재 방 팔레트.
  const colors = isFocus
    ? (SCENE_COLORS[sceneId] ??
      (sceneId === 'cook' || sceneId === 'chore'
        ? roomById('kitchen').palette
        : roomById(DEFAULT_ROOM).palette))
    : roomById(currentRoom).palette;
  const present = isRockPresent(state);

  const placed = (id: string) => !!state.items[id]?.placed;
  // 소품은 그 장면의 방에 속한 것만 — 휴식은 현재 방, 집중은 행동의 방
  // (walk는 야외 = 실내 소품 없음). 부재 시 신발 숨김은 공통 (v5 §4).
  const sceneRoom = isFocus
    ? focusRoomOf(state.selectedAction, gameData.rooms)
    : currentRoom;
  const show = (id: string) => {
    if (!placed(id) || sceneRoom === null) return false;
    const item = gameData.shop.find((i) => i.id === id);
    if (!item) return false;
    return propVisibleInRoom(item, gameData.rooms, sceneRoom, present);
  };
  const setRoom = (dir: 1 | -1) =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        settings: {
          ...prev.state.settings,
          lastRoom: stepRoom(gameData.rooms, currentRoom, dir),
        },
      },
    }));
  const showWindow = !(isFocus && sceneId === 'walk');
  // 시간대·날씨 (M12) — 씬 축 (UI 테마와 독립, B23). 창 유리색이 바깥을 비춘다.
  const tod = resolveTimeOfDay(state.settings, now());
  const outdoor = isFocus && sceneId === 'walk';
  const wet = state.weather === 'rain' || state.weather === 'downpour';
  const glassColor =
    state.weather === 'snow'
      ? '#dfe6ee'
      : wet
        ? '#9db3c9'
        : tod === 'night'
          ? '#8b95c0'
          : tod === 'twilight'
            ? '#e8a05c'
            : isFocus && sceneId === 'sun'
              ? '#ffd878'
              : '#c9a86a';
  const showBook = (isFocus && sceneId === 'read') || show('book2');
  // 거실 휴식 씬은 확정 PNG 아트로 렌더 (LivingRoomArt 참조) — 나머지는 SVG 유지
  const pngLiving = !isFocus && currentRoom === 'living';

  const caption = isFocus
    ? t(action?.captionId ?? '')
    : state.planted
      ? t(SYS.captions.treeRoom)
      : state.era === 'apart' && !state.apart.visiting
        ? t(SYS.captions.apartRoom)
      : present
        ? t(roomById(currentRoom).captionId)
        : t(SYS.captions.restRoomAbsent);

  return (
    <div
      style={{
        position: 'relative',
        width: 480,
        maxWidth: '100%',
        aspectRatio: '320/180',
        background: colors.bg,
        border: '3px solid #f2ead8',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {pngLiving ? (
        <LivingRoomArt
          glassColor={glassColor}
          showRock={present && !state.planted}
          showTree={state.planted && state.plantedAt !== null}
          showPlant={show('plant')}
        />
      ) : (
      <>
      {showWindow && <WindowSprite glassColor={glassColor} />}
      {outdoor && <DaySun variant={tod === 'night' ? 'moon' : 'sun'} />}
      <Floor bg={colors.floor} line={colors.line} />
      {isFocus && sceneId === 'sun' && <SunPatch />}
      {isFocus && sceneId === 'walk' && <GrassTufts />}
      {state.planted && state.plantedAt !== null ? (
        // 3차 (M15): 돌의 자리에 나무가 자란다 — 성장은 달력이 정한다
        <TreeSprite stage={treeStage(state.plantedAt, state.treeBondDays, now())} />
      ) : present ? (
        <RockSprite
          moss={placed('moss')}
          sprout={sproutStageOf(state, gameData.dialogues)}
          wetness={state.session.wetness}
        />
      ) : (
        <RockShadow />
      )}
      {show('cup') && <CupProp />}
      {showBook && <BookProp />}
      {show('plant') && <PlantProp />}
      {show('soda') && <SodaProp />}
      {show('fan') && <FanProp />}
      {show('lamp') && <LampProp />}
      {show('cushion') && <CushionProp />}
      {show('shoes') && <ShoesProp />}
      {show('book') && <ReadBookProp />}
      {show('pot') && <PotProp />}
      {show('broom') && <BroomProp />}
      {show('pillow') && <PillowProp />}
      {show('bed') && <BedProp />}
      {(show('umbrella') ||
        (isFocus && sceneId === 'walk' && state.session.umbrella)) && (
        <UmbrellaProp />
      )}
      {show('fireplace') && <FireplaceProp />}
      {show('rockingchair') && <RockingChairProp />}
      {show('brush') && <BrushProp />}
      {show('board') && <BoardProp />}
      {show('ladle') && <LadleProp />}
      {show('desk') && <DeskProp />}
      {show('stationery') && <StationeryProp />}
      {show('laptop') && <LaptopProp />}
      {STOCK_PROP_IDS.map((id) =>
        show(id) && (state.supplies[id] ?? 0) > 0 ? (
          <StockProp key={id} itemId={id} />
        ) : null,
      )}
      {isFocus && state.session.supply && (
        <SupplyProp
          itemId={state.session.supply.itemId}
          variant={state.session.supply.variant}
        />
      )}
      {outdoor && state.weather !== 'clear' && (
        <WeatherFx kind={state.weather} />
      )}
      {outdoor && <TimeTint tod={tod} />}
      </>
      )}
      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 8,
          fontSize: 10,
          color: '#55556e',
        }}
      >
        {caption}
      </div>
      {!isFocus && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: '#8a839c',
          }}
        >
          <button className="hv" style={pagerBtn} onClick={() => setRoom(-1)}>
            ◂
          </button>
          <span>
            {gameData.rooms.findIndex((r) => r.id === currentRoom) + 1}/
            {gameData.rooms.length}
          </span>
          <button className="hv" style={pagerBtn} onClick={() => setRoom(1)}>
            ▸
          </button>
        </div>
      )}
    </div>
  );
}

const pagerBtn: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'inherit',
  fontFamily: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
  padding: '2px 4px',
};
