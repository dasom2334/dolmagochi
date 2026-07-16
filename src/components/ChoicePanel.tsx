import type { GameState } from '../game/types';
import { gameData } from '../store/gameStore';
import { dispatch, now, t } from '../store/appStore';
import { btnOutline, card } from './ui';

/** 집중 중 조용한 선택지 — 팝업·사운드 없음, 화면 하단에 머문다 */
export function ChoicePanel({ state }: { state: GameState }) {
  const cs = state.session.choiceState;
  if (!cs) return null;

  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const choice =
    cs.source === 'foreshadow'
      ? state.pendingEvent
      : action?.choices[cs.index];
  if (!choice) return null;

  const promptId = choice.promptId;
  return (
    <div
      style={{
        ...card,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <p
        className="pre-line"
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.7,
          animation: 'logFade .4s steps(3) both',
        }}
      >
        * {t(promptId)}
      </p>
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}
      >
        {choice.options.map((o, i) => (
          <button
            key={o.labelId}
            className="hv"
            style={{ ...btnOutline, minHeight: 44 }}
            onClick={() =>
              dispatch({ type: 'CHOICE_PICKED', optionIndex: i, nowMs: now() })
            }
          >
            {t(o.labelId)}
          </button>
        ))}
      </div>
    </div>
  );
}
