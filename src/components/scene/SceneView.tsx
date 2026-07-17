import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { gameData } from '../../store/gameStore';
import { now, t } from '../../store/appStore';
import { SYS } from '../../game/text';
import { Floor } from './Floor';
import { WindowSprite } from './WindowSprite';
import { DaySun } from './DaySun';
import { TimeTint, WeatherFx } from './WeatherFx';
import { resolveTimeOfDay } from '../../game/timeOfDay';
import { SunPatch } from './SunPatch';
import { GrassTufts } from './GrassTufts';
import { RockSprite, RockShadow } from './RockSprite';
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

/** 행동별 풍경 색 (디자인 원본 값 그대로 — cook/chore 씬은 디자인 미정, 방 색으로 폴백) */
const SCENE_COLORS: Record<string, { bg: string; floor: string; line: string }> = {
  walk: { bg: '#2e3d49', floor: '#2e4430', line: '#3a5440' },
  sun: { bg: '#3d3446', floor: '#4a4053', line: '#5a4e66' },
  read: { bg: '#2b2436', floor: '#3a3145', line: '#453a56' },
  lie: { bg: '#232030', floor: '#2d2838', line: '#3a3348' },
  nurse: { bg: '#2a2530', floor: '#37303c', line: '#463c4e' },
};
const ROOM_COLORS = { bg: '#262031', floor: '#332b40', line: '#453a56' };

export function SceneView({ state }: { state: GameState }) {
  const isFocus = state.phase === 'focus';
  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const sceneId = isFocus ? (action?.sceneId ?? 'free') : 'room';
  const colors = (isFocus && SCENE_COLORS[sceneId]) || ROOM_COLORS;
  const present = isRockPresent(state);

  const placed = (id: string) => !!state.items[id]?.placed;
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
  const showBook = (isFocus && sceneId === 'read') || placed('book2');

  const caption = isFocus
    ? t(action?.captionId ?? '')
    : state.era === 'apart' && !state.apart.visiting
      ? t(SYS.captions.apartRoom)
      : present
        ? t(SYS.captions.restRoom)
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
      {showWindow && <WindowSprite glassColor={glassColor} />}
      {outdoor && <DaySun variant={tod === 'night' ? 'moon' : 'sun'} />}
      <Floor bg={colors.floor} line={colors.line} />
      {isFocus && sceneId === 'sun' && <SunPatch />}
      {isFocus && sceneId === 'walk' && <GrassTufts />}
      {present ? (
        <RockSprite
          moss={placed('moss')}
          sprout={sproutStageOf(state, gameData.dialogues)}
          wetness={state.session.wetness}
        />
      ) : (
        <RockShadow />
      )}
      {placed('cup') && <CupProp />}
      {showBook && <BookProp />}
      {placed('plant') && <PlantProp />}
      {placed('soda') && <SodaProp />}
      {placed('fan') && <FanProp />}
      {placed('lamp') && <LampProp />}
      {placed('cushion') && <CushionProp />}
      {placed('shoes') && <ShoesProp />}
      {placed('book') && <ReadBookProp />}
      {placed('pot') && <PotProp />}
      {placed('broom') && <BroomProp />}
      {placed('pillow') && <PillowProp />}
      {placed('bed') && <BedProp />}
      {placed('umbrella') && <UmbrellaProp />}
      {placed('fireplace') && <FireplaceProp />}
      {placed('rockingchair') && <RockingChairProp />}
      {placed('brush') && <BrushProp />}
      {placed('board') && <BoardProp />}
      {placed('ladle') && <LadleProp />}
      {placed('desk') && <DeskProp />}
      {placed('stationery') && <StationeryProp />}
      {placed('laptop') && <LaptopProp />}
      {STOCK_PROP_IDS.map((id) =>
        state.items[id]?.placed && (state.supplies[id] ?? 0) > 0 ? (
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
    </div>
  );
}
