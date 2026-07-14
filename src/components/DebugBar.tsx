import type { GameState } from '../game/types';
import { appStore, dispatch, t } from '../store/appStore';
import { UI } from '../game/text';
import { btnSmall } from './ui';

/**
 * ?debug=1 일 때만 표시되는 개발용 바 — 타이머 빨리감기.
 * 잠수 발동/해제는 설정 모달의 디버그 영역에 있다.
 * 코어 이벤트를 늘리지 않도록 rest endsAt 조작은 스토어 setState로 직접 처리한다.
 */
export function DebugBar({ state, nowMs }: { state: GameState; nowMs: number }) {
  const fastForward = () => {
    if (state.phase === 'focus') {
      dispatch({ type: 'TICK', dtSec: 300 }); // 집중 +5분
    } else if (state.phase === 'rest') {
      // 휴식 카운트다운을 끝으로 당긴다 (실시각 기준)
      appStore.setState((prev) => ({
        state: { ...prev.state, rest: { ...prev.state.rest, endsAt: nowMs } },
      }));
    }
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        border: '2px dashed #6b6178',
        color: '#a89cb4',
        fontSize: 11,
      }}
    >
      <span>debug</span>
      <button className="hv" style={btnSmall} onClick={fastForward}>
        {t(UI.debug.fastForward)}
      </button>
      <span style={{ marginLeft: 'auto', color: '#6b6178' }}>
        {state.phase} · {state.era}
        {state.presence.state === 'absent' ? ' · absent' : ''}
      </span>
    </div>
  );
}
