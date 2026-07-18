import type { GameState } from '../game/types';
import { BALANCE } from '../game/balance';
import { isRockPresent } from '../game/stateMachine';
import { dispatch, now, tf } from '../store/appStore';
import { UI } from '../game/text';
import { btnDashed } from './ui';
import { UmbrellaPrompt } from './UmbrellaPrompt';

/** 세션 포크가 활성인가 (M18) — 개막(3티어) 후의 1차 육성, 돌 재석 */
export function approachActive(state: GameState): boolean {
  return (
    state.era === 'raising' &&
    isRockPresent(state) &&
    !state.presence.sick &&
    state.relationTier >= BALANCE.ATTACH_ONSET_TIER
  );
}

/**
 * 집중 시작 컨트롤 (M18) — 우산 대기면 우산 질문, 포크 활성이면 두 버튼
 * (곁에서/한 발 떨어져), 아니면 단일 시작 버튼. 행동선택·휴식 공용.
 * onStart를 주면 디스패치 대신 그 콜백을 부른다 (휴식의 미완주 확인 흐름).
 */
export function StartFocusControl({
  state,
  actionName,
  onStart,
}: {
  state: GameState;
  actionName: string;
  onStart?: (approach?: 'near' | 'apart') => void;
}) {
  if (state.pendingUmbrella) return <UmbrellaPrompt />;
  const start = (approach?: 'near' | 'apart') => {
    if (onStart) onStart(approach);
    else dispatch({ type: 'START_FOCUS', nowMs: now(), approach });
  };
  if (!approachActive(state)) {
    return (
      <button className="hv" style={btnDashed} onClick={() => start()}>
        {tf(UI.buttons.startFocus, { action: actionName })}
      </button>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <button className="hv" style={btnDashed} onClick={() => start('near')}>
        {tf(UI.approach.near, { action: actionName })}
      </button>
      <button className="hv" style={btnDashed} onClick={() => start('apart')}>
        {tf(UI.approach.apart, { action: actionName })}
      </button>
    </div>
  );
}
