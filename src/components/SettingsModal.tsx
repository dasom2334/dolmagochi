import type { GameState } from '../game/types';
import { dispatch, t } from '../store/appStore';
import { SYS, UI } from '../game/text';

/** 설정 — 작별 버튼은 설정 메뉴 안쪽에만 (M5에서 동거 시 활성화) */
export function SettingsModal({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,16,26,.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 400,
          maxWidth: '88vw',
          background: '#332b3d',
          border: '3px solid #f2ead8',
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
        }}
      >
        <div style={{ fontSize: 17, color: '#fdf8ec' }}>
          * {t(UI.buttons.settings)}
        </div>
        <button
          className="hv-text"
          style={{
            textAlign: 'left',
            border: 'none',
            background: 'none',
            color: '#e0d6c4',
            fontFamily: 'inherit',
            fontSize: 13,
            padding: '4px 0',
            cursor: 'pointer',
          }}
          onClick={() =>
            dispatch({ type: 'SET_NOISE', on: !state.settings.noiseOn })
          }
        >
          * {t(UI.labels.noiseSetting)} —{' '}
          {t(state.settings.noiseOn ? SYS.settings.noiseOn : SYS.settings.noiseOff)}
        </button>
        <div
          style={{
            borderTop: '2px solid #4a4156',
            paddingTop: 11,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: '#8a7f96' }}>
            {t(SYS.settings.farewellLocked)}
          </span>
          <button
            className="hv"
            style={{
              border: '2px solid #f2ead8',
              background: 'transparent',
              color: '#f2ead8',
              fontFamily: 'inherit',
              fontSize: 13,
              padding: '6px 18px',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            {t(UI.buttons.close)}
          </button>
        </div>
      </div>
    </div>
  );
}
