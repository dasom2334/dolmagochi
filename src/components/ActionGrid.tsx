import type { GameState } from '../game/types';
import { gameData } from '../store/gameStore';
import { isActionAvailable } from '../game/stateMachine';
import { dispatch, t } from '../store/appStore';
import { UI } from '../game/text';

/** 행동 카드 그리드 — 잠긴 행동은 자물쇠 대신 (잠김) 라벨 (디자인 데모 방식) */
export function ActionGrid({ state }: { state: GameState }) {
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
      {gameData.actions.map((a) => {
        const locked = !isActionAvailable(a, state);
        const selected = a.id === state.selectedAction;
        return (
          <button
            key={a.id}
            className={locked ? undefined : 'hv'}
            disabled={locked}
            style={{
              minHeight: 44,
              border: `2px solid ${locked ? '#4a4156' : selected ? '#ffd866' : '#f2ead8'}`,
              background: 'transparent',
              color: locked ? '#6b6178' : selected ? '#ffd866' : '#f2ead8',
              fontFamily: 'inherit',
              fontSize: 13,
              cursor: locked ? 'default' : 'pointer',
              padding: 8,
            }}
            onClick={() => dispatch({ type: 'SELECT_ACTION', actionId: a.id })}
          >
            {t(a.nameId)}
            {locked ? ` ${t(UI.labels.locked)}` : ''}
          </button>
        );
      })}
    </div>
  );
}
