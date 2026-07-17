import type { GameState } from '../game/types';
import { formatElapsed } from '../game/timer';
import { restProgressPct, restRemainingSec } from '../persistence/restClock';
import { dispatch, now, t, tf } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { btnSmall } from './ui';

export function TimerCard({
  state,
  nowMs,
  onOpenSettings,
}: {
  state: GameState;
  nowMs: number;
  onOpenSettings: () => void;
}) {
  const isFocus = state.phase === 'focus';
  const isRest = state.phase === 'rest';
  const restLeft = restRemainingSec(state.rest.endsAt, nowMs);
  const restPct = restProgressPct(state.rest.endsAt, state.rest.totalSec, nowMs);
  const timerText = isFocus
    ? formatElapsed(state.session.elapsedSec)
    : isRest
      ? formatElapsed(restLeft)
      : formatElapsed(0);

  return (
    <div
      style={{
        border: '3px solid var(--text)',
        background: 'var(--panel)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 13, color: isRest ? 'var(--ok-hi)' : 'var(--warn)' }}>
            ◆ {isRest ? t(UI.labels.modeRest) : t(UI.labels.modeFocus)}
          </span>
          <span
            style={{
              fontSize: 26,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 2,
              color: 'var(--text-hi)',
            }}
          >
            {timerText}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>
            {tf(UI.labels.care, { points: state.care.points })}
          </span>
          <button className="hv" style={btnSmall} onClick={onOpenSettings}>
            {t(UI.buttons.settings)}
          </button>
        </div>
      </div>
      {isFocus && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--hint)' }}>
            {t(SYS.hints.flowtime)}
          </span>
          <button
            className="hv"
            style={{
              border: '2px solid var(--text)',
              background: 'transparent',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 13,
              padding: '7px 16px',
              cursor: 'pointer',
            }}
            onClick={() => dispatch({ type: 'END_FOCUS', nowMs: now() })}
          >
            {t(UI.buttons.endFocus)}
          </button>
        </div>
      )}
      {isRest && (
        <div
          style={{
            height: 8,
            border: '2px solid var(--text)',
            background: 'var(--panel-3)',
            padding: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--ok-hi)',
              transition: 'width 1s linear',
              width: `${restPct}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
