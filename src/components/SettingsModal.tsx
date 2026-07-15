import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch, now, t } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { exportSaveJson, importSaveJson } from '../persistence/exportImport';
import { requestNotifyPermission } from '../notifications';
import { cloneFlowtime } from '../game/timer';
import type { NotifySettings } from '../game/types';

const numInput = {
  width: 42,
  background: '#241d30',
  border: '2px solid #6b6178',
  color: '#f2ead8',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '3px 4px',
  textAlign: 'center' as const,
};

/**
 * 숫자 입력 — 로컬 문자열로 편집하고 blur/Enter에서만 커밋(정규화는 커밋 후 리듀서가).
 * 편집 중에는 clamp하지 않아 여러 자리 입력·필드 비우기가 자연스럽다.
 * 외부에서 값이 바뀌면(예: 기본값으로 돌아가기) 포커스가 없을 때만 동기화한다.
 */
function NumField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const [txt, setTxt] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(String(value));
  }, [value]);
  const commit = () => {
    const v = parseInt(txt, 10);
    if (Number.isNaN(v)) setTxt(String(value));
    else onCommit(v);
  };
  return (
    <input
      type="number"
      min={1}
      style={numInput}
      value={txt}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

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
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const nf = state.settings.notify;
  const onOff = (v: boolean) => t(v ? SYS.settings.on : SYS.settings.off);
  const toggleNotify = (key: keyof NotifySettings) => {
    const on = !state.settings.notify[key];
    dispatch({ type: 'SET_NOTIFY', key, on });
    // 켤 때 권한이 아직 미결정이면 요청 (거부/미지원이면 알림만 조용히 빠진다)
    if (on) void requestNotifyPermission();
  };
  const focusToggles: [keyof NotifySettings, string][] = [
    ['restEnd', UI.labels.notify.restEnd],
    ['focus25', UI.labels.notify.focus25],
    ['focus50', UI.labels.notify.focus50],
    ['focus90', UI.labels.notify.focus90],
  ];

  const ft = state.settings.flowtime;
  const setBound = (i: number, v: number) => {
    const bounds = ft.bounds.slice();
    bounds[i] = v;
    dispatch({ type: 'SET_FLOWTIME', flowtime: { bounds, rests: ft.rests } });
  };
  const setRest = (i: number, v: number) => {
    const rests = ft.rests.slice();
    rests[i] = v;
    dispatch({ type: 'SET_FLOWTIME', flowtime: { bounds: ft.bounds, rests } });
  };

  const doExport = () => {
    const json = exportSaveJson(appStore.getState().state, now());
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

        <button
          className="hv-text"
          style={settingBtn}
          onClick={() =>
            dispatch({
              type: 'SET_PAUSE_ON_HIDE',
              on: !state.settings.pauseOnHide,
            })
          }
        >
          * {t(UI.labels.pauseOnHide)} — {onOff(state.settings.pauseOnHide)}
        </button>

        <button
          className="hv-text"
          style={settingBtn}
          onClick={() => toggleNotify('enabled')}
        >
          * {t(UI.labels.notifyAll)} — {onOff(nf.enabled)}
        </button>
        {nf.enabled && (
          <div
            style={{ display: 'flex', flexDirection: 'column', paddingLeft: 12 }}
          >
            {focusToggles.map(([key, labelId]) => (
              <button
                key={key}
                className="hv-text"
                style={{ ...settingBtn, fontSize: 12, color: '#c8bdd0' }}
                onClick={() => toggleNotify(key)}
              >
                - {t(labelId)} — {onOff(nf[key])}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 13, color: '#e0d6c4' }}>
            * {t(UI.labels.flowtime.title)}
          </div>
          <div style={{ fontSize: 11, color: '#8a7f96' }}>
            {t(UI.labels.flowtime.hint)}
          </div>
          {ft.rests.map((rest, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: '#c8bdd0',
                paddingLeft: 12,
              }}
            >
              <span
                style={{
                  minWidth: 92,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {i < ft.bounds.length ? (
                  <>
                    <NumField
                      value={ft.bounds[i]}
                      onCommit={(v) => setBound(i, v)}
                    />
                    {t(UI.labels.flowtime.under)}
                  </>
                ) : (
                  t(UI.labels.flowtime.above)
                )}
              </span>
              <span>→</span>
              <NumField value={rest} onCommit={(v) => setRest(i, v)} />
              {t(UI.labels.flowtime.restSuffix)}
            </div>
          ))}
          <button
            className="hv-text"
            style={{ ...settingBtn, fontSize: 12, color: '#a8c491', paddingLeft: 12 }}
            onClick={() =>
              dispatch({ type: 'SET_FLOWTIME', flowtime: cloneFlowtime() })
            }
          >
            - {t(UI.buttons.resetFlowtime)}
          </button>
        </div>

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
