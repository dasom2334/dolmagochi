import { useState } from 'react';
import type { GameState, RestStep } from '../game/types';
import { gameData } from '../store/gameStore';
import { isItemAvailable } from '../game/stateMachine';
import { dispatch, now, t, tf } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { btnDashed, btnOutline, btnSmall, card, PagesView } from './ui';
import { ActionGrid } from './ActionGrid';

const STEPS: RestStep[] = ['journal', 'talk', 'select', 'shop'];

export function RestPanel({ state }: { state: GameState }) {
  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontSize: 11,
          color: '#a8c491',
        }}
      >
        {t(SYS.status.rest)}
      </p>
      {state.era === 'apart' && state.apart.leavePending && (
        <VisitLeavePrompt />
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {STEPS.map((step, i) => {
          const active = state.restStep === step;
          return (
            <button
              key={step}
              className="hv"
              style={{
                flex: 1,
                border: `2px solid ${active ? '#f2ead8' : '#6b6178'}`,
                background: active ? '#f2ead8' : 'transparent',
                color: active ? '#332b3d' : '#a89cb4',
                fontFamily: 'inherit',
                fontSize: 12,
                padding: '7px 0',
                cursor: 'pointer',
              }}
              onClick={() => dispatch({ type: 'REST_STEP', step })}
            >
              {t(UI.tabs[i])}
            </button>
          );
        })}
      </div>
      <div
        style={{
          ...card,
          padding: '14px 16px',
          minHeight: 132,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {state.restStep === 'journal' && <RestJournal state={state} />}
        {state.restStep === 'talk' && <RestTalk state={state} />}
        {state.restStep === 'select' && (
          <>
            <ActionGrid state={state} />
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8a7f96' }}>
              * {tf(SYS.nextActionNote, { action: t(action?.nameId ?? '') })}
            </p>
          </>
        )}
        {state.restStep === 'shop' && <RestShop state={state} />}
      </div>
      <button
        className="hv"
        style={btnDashed}
        onClick={() => dispatch({ type: 'START_FOCUS', nowMs: now() })}
      >
        {tf(UI.buttons.startFocus, { action: t(action?.nameId ?? '') })}
      </button>
    </div>
  );
}

function RestJournal({ state }: { state: GameState }) {
  return (
    <>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: 150,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        <div style={{ fontSize: 12, color: '#ffd866' }}>
          {tf(SYS.restSummary, {
            mins: state.rest.summary.mins,
            earned: state.rest.summary.earned,
          })}
        </div>
        {state.session.journal.map((j, i) => (
          <div
            key={i}
            className="pre-line"
            style={{ fontSize: 13, color: '#e0d6c4', lineHeight: 1.6 }}
          >
            * <span style={{ color: '#8a7f96' }}>{j.t}</span> {j.text}
          </div>
        ))}
      </div>
      {/* 작은 행동 — 집중 세션이 끝난 뒤 1회 (기획서 v3-6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 9,
          marginTop: 10,
        }}
      >
        {gameData.restActs.map((a) => {
          const off = state.rest.actUsed;
          return (
            <button
              key={a.key}
              className={off ? undefined : 'hv'}
              disabled={off}
              style={{
                minHeight: 44,
                border: `2px solid ${off ? '#4a4156' : '#6b6178'}`,
                background: 'transparent',
                color: off ? '#6b6178' : '#e0d6c4',
                fontFamily: 'inherit',
                fontSize: 13,
                cursor: off ? 'default' : 'pointer',
                padding: 8,
              }}
              onClick={() => dispatch({ type: 'REST_ACT', key: a.key })}
            >
              {t(a.labelId)}
            </button>
          );
        })}
      </div>
    </>
  );
}

function RestTalk({ state }: { state: GameState }) {
  const ts = state.rest.talkState;
  if (!state.rest.talkPressed) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          className="hv"
          style={{ ...btnDashed, minWidth: 220 }}
          onClick={() => dispatch({ type: 'TALK' })}
        >
          {t(UI.buttons.talk)}
        </button>
      </div>
    );
  }
  if (!ts) {
    return (
      <p style={{ margin: 0, fontSize: 11, color: '#8a7f96' }}>
        * {t(SYS.talkSpent)}
      </p>
    );
  }
  const spent = !ts.hasChoice || ts.done;
  return (
    <>
      <PagesView pages={ts.pages}>
        {ts.hasChoice && !ts.done && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              className="hv"
              style={{ ...btnOutline, fontSize: 12, padding: '6px 20px' }}
              onClick={() => dispatch({ type: 'TALK_CHOICE', yes: true })}
            >
              {t(UI.buttons.yes)}
            </button>
            <button
              className="hv"
              style={{ ...btnOutline, fontSize: 12, padding: '6px 20px' }}
              onClick={() => dispatch({ type: 'TALK_CHOICE', yes: false })}
            >
              {t(UI.buttons.no)}
            </button>
          </div>
        )}
        {spent && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#8a7f96' }}>
            * {t(SYS.talkSpent)}
          </p>
        )}
      </PagesView>
    </>
  );
}

function RestShop({ state }: { state: GameState }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(gameData.shop.length / 3));
  const p = Math.min(page, pages - 1);
  const items = gameData.shop.slice(p * 3, p * 3 + 3);
  const pending = state.pendingPlacement;

  return (
    <>
      {pending && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            className="pre-line"
            style={{ flex: 1, fontSize: 12, color: '#f2ead8', lineHeight: 1.5 }}
          >
            * {t(SYS.placement.prompt)}
          </span>
          <button
            className="hv"
            style={{ ...btnSmall, color: '#e0d6c4' }}
            onClick={() =>
              dispatch({ type: 'SET_PLACEMENT', itemId: pending, placed: true })
            }
          >
            {t(UI.shop.place)}
          </button>
          <button
            className="hv"
            style={btnSmall}
            onClick={() =>
              dispatch({ type: 'SET_PLACEMENT', itemId: pending, placed: false })
            }
          >
            {t(UI.shop.stash)}
          </button>
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it) => {
          const owned = it.id in state.items;
          const available = isItemAvailable(it, state);
          const poor = state.care.points < it.price;
          const disabled = owned || poor || !available;
          const stateLabel = owned
            ? t(UI.shop.owned)
            : poor
              ? t(UI.shop.poor)
              : tf(UI.shop.price, { price: it.price });
          return (
            <div key={it.id} style={{ display: 'flex', gap: 6 }}>
              <button
                className={disabled ? undefined : 'hv'}
                disabled={disabled}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  border: `2px solid ${disabled ? '#4a4156' : '#6b6178'}`,
                  background: 'transparent',
                  color: disabled ? '#6b6178' : '#e0d6c4',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  cursor: disabled ? 'default' : 'pointer',
                  padding: '8px 10px',
                  lineHeight: 1.5,
                }}
                onClick={() =>
                  dispatch({ type: 'BUY', itemId: it.id, nowMs: now() })
                }
              >
                {t(it.nameId)} — {stateLabel}{' '}
                <span style={{ color: '#8a7f96' }}>{t(it.descId)}</span>
              </button>
              {owned && state.pendingPlacement !== it.id && (
                <button
                  className="hv"
                  style={btnSmall}
                  onClick={() =>
                    dispatch({
                      type: 'SET_PLACEMENT',
                      itemId: it.id,
                      placed: !state.items[it.id].placed,
                    })
                  }
                >
                  {t(state.items[it.id].placed ? UI.shop.stash : UI.shop.place)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          marginTop: 8,
        }}
      >
        <button
          className={p === 0 ? undefined : 'hv'}
          disabled={p === 0}
          style={{
            ...btnSmall,
            fontSize: 12,
            padding: '3px 12px',
            color: p === 0 ? '#4a4156' : '#a89cb4',
          }}
          onClick={() => setPage(Math.max(0, p - 1))}
        >
          ◂
        </button>
        <span style={{ fontSize: 11, color: '#8a7f96' }}>
          {p + 1} / {pages}
        </span>
        <button
          className={p >= pages - 1 ? undefined : 'hv'}
          disabled={p >= pages - 1}
          style={{
            ...btnSmall,
            fontSize: 12,
            padding: '3px 12px',
            color: p >= pages - 1 ? '#4a4156' : '#a89cb4',
          }}
          onClick={() => setPage(Math.min(pages - 1, p + 1))}
        >
          ▸
        </button>
      </div>
    </>
  );
}

/** apart: 돌이 떠나려는 기색 — 붙잡기/보내주기 (기획서 v3-14) */
function VisitLeavePrompt() {
  const vl = gameData.dialogues.visitLeave;
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
          color: '#f2ead8',
          lineHeight: 1.7,
          animation: 'logFade .4s steps(3) both',
        }}
      >
        * {t(vl.promptId)}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        <button
          className="hv"
          style={{ ...btnOutline, minHeight: 44 }}
          onClick={() => dispatch({ type: 'VISIT_HOLD', hold: true })}
        >
          {t(vl.holdLabelId)}
        </button>
        <button
          className="hv"
          style={{ ...btnOutline, minHeight: 44 }}
          onClick={() => dispatch({ type: 'VISIT_HOLD', hold: false })}
        >
          {t(vl.letGoLabelId)}
        </button>
      </div>
    </div>
  );
}
