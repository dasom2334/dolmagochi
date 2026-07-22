import type { GameState } from '../game/types';
import { resolveTimeOfDay } from '../game/timeOfDay';
import { gameData } from '../store/gameStore';
import { isActionAvailable } from '../game/stateMachine';
import { dispatch, t, tNight } from '../store/appStore';
import { UI } from '../game/text';

/**
 * 표시 순서: 병간호 상태면 '병간호하기'만, 아니면 자유행동을 맨 앞에 두고
 * 병간호는 숨긴다(평소엔 선택 불가).
 */
function displayActions(state: GameState) {
  const acts = gameData.actions;
  if (state.presence.sick) return acts.filter((a) => a.id === 'nurse');
  const rest = acts.filter((a) => a.id !== 'free' && a.id !== 'nurse');
  const free = acts.filter((a) => a.id === 'free');
  return [...free, ...rest];
}

/** 행동 카드 그리드 — 잠긴 행동은 자물쇠 대신 (잠김) 라벨 (디자인 데모 방식) */
export function ActionGrid({ state }: { state: GameState }) {
  // 시간대 (M12) — 밤에는 햇빛쬐기가 달빛쬐기로 표기된다 (별도 행동 아님).
  // 문구 분기는 tNight(밤 얼굴) 공통 경로로 처리 — 버튼·캡션·서술이 한 축을 쓴다.
  const tod = resolveTimeOfDay(state.settings, Date.now());
  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        alignContent: 'start',
      }}
    >
      {displayActions(state).map((a) => {
        const locked = !isActionAvailable(a, state);
        const selected = a.id === state.selectedAction;
        return (
          <button
            key={a.id}
            className={locked ? undefined : 'hv'}
            disabled={locked}
            style={{
              minHeight: 44,
              border: `2px solid ${locked ? 'var(--line)' : selected ? 'var(--accent)' : 'var(--text)'}`,
              background: 'transparent',
              color: locked ? 'var(--hint-dim)' : selected ? 'var(--accent)' : 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 13,
              cursor: locked ? 'default' : 'pointer',
              padding: 8,
            }}
            onClick={() => dispatch({ type: 'SELECT_ACTION', actionId: a.id })}
          >
            {tNight(a.nameId, tod)}
            {locked ? ` ${t(UI.labels.locked)}` : ''}
          </button>
        );
      })}
    </div>
  );
}
