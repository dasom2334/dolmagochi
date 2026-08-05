/**
 * 씬 뷰 — 그림은 CanvasScene(이식한 절차 렌더러)이 전부 그린다.
 * 여기 남은 것은 그림 밖의 것들: 테두리 상자·캡션·방 페이저(◂ n/m ▸).
 *
 * (이전의 SVG 소품 컴포넌트(props/*)와 LivingRoomArt(PNG 실험)는 캔버스 씬으로
 *  대체됐다 — 파일은 남아 있으나 더는 그리지 않는다. 정리는 별도 커밋에서.)
 */
import type { GameState } from '../../game/types';
import { isRockPresent } from '../../game/stateMachine';
import { gameData } from '../../store/gameStore';
import { appStore, t } from '../../store/appStore';
import { SYS } from '../../game/text';
import { DEFAULT_ROOM, stepRoom } from '../../game/rooms';
import { CanvasScene } from './CanvasScene';

const roomById = (id: string) =>
  gameData.rooms.find((r) => r.id === id) ?? gameData.rooms[1];

export function SceneView({ state }: { state: GameState }) {
  const isFocus = state.phase === 'focus';
  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const currentRoom = state.settings.lastRoom || DEFAULT_ROOM;
  const present = isRockPresent(state);

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
        background: '#1a1330',
        border: '3px solid #f2ead8',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <CanvasScene state={state} />
      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 8,
          fontSize: 10,
          color: '#cfc8e0',
          textShadow: '0 1px 2px rgba(0,0,0,.6)',
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
            color: '#b9b2cc',
            textShadow: '0 1px 2px rgba(0,0,0,.6)',
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
