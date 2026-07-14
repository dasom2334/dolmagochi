import { useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch, now, t } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { startAbsence, presentState } from '../game/absence';
import { exportSaveJson, importSaveJson } from '../persistence/exportImport';

const settingBtn = {
  textAlign: 'left' as const,
  border: 'none',
  background: 'none',
  color: '#e0d6c4',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '4px 0',
  cursor: 'pointer',
};

/** 설정 — 작별 버튼은 설정 메뉴 안쪽에만 (M5에서 동거 시 활성화) */
export function SettingsModal({
  state,
  debug = false,
  onClose,
}: {
  state: GameState;
  debug?: boolean;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const toggleAbsence = () => {
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        presence:
          prev.state.presence.state === 'absent'
            ? presentState()
            : startAbsence(() => Math.random()),
      },
    }));
  };

  const doExport = () => {
    const json = exportSaveJson(appStore.getState().state, Date.now());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dol-save.json';
    a.click();
    URL.revokeObjectURL(url);
    setMsg(t(SYS.toasts.exportOk));
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importSaveJson(String(reader.result));
      if (res.ok) {
        appStore.setState({ state: res.state });
        dispatch({ type: 'SETTLE', nowMs: now() });
        setMsg(t(SYS.toasts.importOk));
      } else {
        setMsg(
          t(
            res.reason === 'version'
              ? SYS.toasts.importVersion
              : SYS.toasts.importFail,
          ),
        );
      }
    };
    reader.readAsText(file);
  };
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
        {debug && (
          <button
            className="hv-text"
            style={{
              textAlign: 'left',
              border: 'none',
              background: 'none',
              color: '#c2a06a',
              fontFamily: 'inherit',
              fontSize: 13,
              padding: '4px 0',
              cursor: 'pointer',
            }}
            onClick={toggleAbsence}
          >
            *{' '}
            {t(
              state.presence.state === 'absent'
                ? UI.debug.endAbsence
                : UI.debug.triggerAbsence,
            )}
          </button>
        )}
        <button className="hv-text" style={settingBtn} onClick={doExport}>
          * {t(UI.buttons.exportSave)}
        </button>
        <button
          className="hv-text"
          style={settingBtn}
          onClick={() => fileRef.current?.click()}
        >
          * {t(UI.buttons.importSave)}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />
        {msg && (
          <p
            className="pre-line"
            style={{ margin: 0, fontSize: 11, color: '#a8c491', lineHeight: 1.5 }}
          >
            * {msg}
          </p>
        )}
        <div
          style={{
            borderTop: '2px solid #4a4156',
            paddingTop: 11,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* 작별은 엔딩에서 '남기'를 택한 동거 상태에서만 — 설정 안쪽에 조용히 */}
          {state.era === 'cohabit' ? (
            <button
              className="hv-text"
              style={{ ...settingBtn, color: '#8a7f96', fontSize: 11 }}
              onClick={() => {
                dispatch({ type: 'FAREWELL_FROM_COHABIT' });
                onClose();
              }}
            >
              {t(SYS.settings.farewell)}
            </button>
          ) : (
            <span />
          )}
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
