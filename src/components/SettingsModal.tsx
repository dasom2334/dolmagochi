import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch, now, t } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { exportSaveJson, importSaveJson } from '../persistence/exportImport';
import { requestNotifyPermission } from '../notifications';
import { cloneFlowtime } from '../game/timer';

const numInput = {
  width: 42,
  background: 'var(--panel-4)',
  border: '2px solid var(--hint-dim)',
  color: 'var(--text)',
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
  color: 'var(--text-soft)',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '4px 0',
  cursor: 'pointer',
};

const overlayStyle = (zIndex: number) =>
  ({
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex,
  }) as const;

const panelStyle = {
  width: 400,
  maxWidth: '88vw',
  background: 'var(--panel)',
  border: '3px solid var(--text)',
  padding: 22,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 11,
};

const closeBtn = {
  border: '2px solid var(--text)',
  background: 'transparent',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '6px 18px',
  cursor: 'pointer',
};

/** 하위 설정 모달(뎁스 +1) — 사운드/알림을 각각 별도 시트로. */
function SubSheet({
  titleId,
  onBack,
  children,
}: {
  titleId: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={overlayStyle(11)}>
      <div style={panelStyle}>
        <div style={{ fontSize: 17, color: 'var(--text-hi)' }}>* {t(titleId)}</div>
        {children}
        <div
          style={{
            borderTop: '2px solid var(--line)',
            paddingTop: 11,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="hv" style={closeBtn} onClick={onBack}>
            {t(UI.buttons.back)}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [sub, setSub] = useState<'timer' | null>(null);

  const nf = state.settings.notify;
  const onOff = (v: boolean) => t(v ? SYS.settings.on : SYS.settings.off);
  const toggleNotify = (key: 'enabled' | 'restEnd') => {
    const on = !state.settings.notify[key];
    dispatch({ type: 'SET_NOTIFY', key, on });
    // 켤 때 권한이 아직 미결정이면 요청 (거부/미지원이면 알림만 조용히 빠진다)
    if (on) void requestNotifyPermission();
  };
  const toggleFocusMark = (index: number) => {
    const on = !state.settings.notify.focusMarks[index];
    dispatch({ type: 'SET_FOCUS_NOTIFY', index, on });
    if (on) void requestNotifyPermission();
  };

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
    <>
    <div style={overlayStyle(10)}>
      <div style={panelStyle}>
        <div style={{ fontSize: 17, color: 'var(--text-hi)' }}>
          * {t(UI.buttons.settings)}
        </div>

        {/* 효과음만 남는다 — 화이트노이즈·레이어 믹서는 분위기 바(M22)로 */}
        <button
          className="hv-text"
          style={settingBtn}
          onClick={() =>
            dispatch({ type: 'SET_SOUND', on: !state.settings.soundOn })
          }
        >
          * {t(UI.labels.soundSetting)} — {onOff(state.settings.soundOn)}
        </button>
        <button
          className="hv-text"
          style={settingBtn}
          onClick={() => setSub('timer')}
        >
          * {t(UI.labels.timerGroup)} ▸
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

        {/* 테마는 타이머 카드로, 시간대·계절·날씨·소리풍경은 분위기 바로 이관 (M22) */}

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
            style={{ margin: 0, fontSize: 11, color: 'var(--ok)', lineHeight: 1.5 }}
          >
            * {msg}
          </p>
        )}
        <div
          style={{
            borderTop: '2px solid var(--line)',
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
              style={{ ...settingBtn, color: 'var(--hint)', fontSize: 11 }}
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
              border: '2px solid var(--text)',
              background: 'transparent',
              color: 'var(--text)',
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

    {sub === 'timer' && (
      <SubSheet titleId={UI.labels.timerGroup} onBack={() => setSub(null)}>
        {/* 알림: 전체 스위치 + 휴식 종료. 집중 구간 알림은 아래 표에서 구간별로. */}
        <button
          className="hv-text"
          style={settingBtn}
          onClick={() => toggleNotify('enabled')}
        >
          * {t(UI.labels.notifyAll)} — {onOff(nf.enabled)}
        </button>
        {nf.enabled && (
          <button
            className="hv-text"
            style={{ ...settingBtn, fontSize: 12, color: 'var(--ink)', paddingLeft: 12 }}
            onClick={() => toggleNotify('restEnd')}
          >
            - {t(UI.labels.notifyRest)} — {onOff(nf.restEnd)}
          </button>
        )}

        <div style={{ height: 2, background: 'var(--line)', margin: '4px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>
            * {t(UI.labels.flowtime.title)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--hint)' }}>
            {t(UI.labels.flowtime.hint)}
          </div>
          {ft.rests.map((rest, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 5,
                fontSize: 12,
                color: 'var(--ink)',
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
              {/* 각 구간(경계)마다 집중 알림 토글 — 경계를 바꾸면 알림 시각도 따라간다.
                  전체 알림이 꺼져 있으면 흐리게(발동 안 함). */}
              {i < ft.bounds.length && (
                <button
                  className="hv-text"
                  style={{
                    border: 'none',
                    background: 'none',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    cursor: 'pointer',
                    marginLeft: 'auto',
                    color: !nf.enabled
                      ? 'var(--line)'
                      : nf.focusMarks[i]
                        ? 'var(--ok)'
                        : 'var(--hint-dim)',
                  }}
                  onClick={() => toggleFocusMark(i)}
                >
                  {t(UI.labels.tierNotify)} {nf.focusMarks[i] ? '●' : '○'}
                </button>
              )}
            </div>
          ))}
          <button
            className="hv-text"
            style={{ ...settingBtn, fontSize: 12, color: 'var(--ok)', paddingLeft: 12 }}
            onClick={() =>
              dispatch({ type: 'SET_FLOWTIME', flowtime: cloneFlowtime() })
            }
          >
            - {t(UI.buttons.resetFlowtime)}
          </button>
        </div>
      </SubSheet>
    )}
    </>
  );
}
