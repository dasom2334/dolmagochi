import { useState } from 'react';
import type { GameState, RestStep } from '../game/types';
import { gameData } from '../store/gameStore';
import { isItemAvailable, isRockPresent } from '../game/stateMachine';
import { needsBand } from '../game/stats';
import { dispatch, now, t, tf } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { btnDashed, btnOutline, btnSmall, card, PagesView } from './ui';
import { ActionGrid } from './ActionGrid';

const STEPS: RestStep[] = ['journal', 'talk', 'select', 'shop'];

export function RestPanel({
  state,
  nowMs,
}: {
  state: GameState;
  nowMs: number;
}) {
  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  // 휴식 타이머가 아직 다 흐르지 않았으면(권장 휴식 미완료) 시작 전 되묻는다
  const restIncomplete = state.rest.endsAt > 0 && nowMs < state.rest.endsAt;
  const [confirming, setConfirming] = useState(false);

  const startFocus = () => {
    if (restIncomplete) setConfirming(true);
    else dispatch({ type: 'START_FOCUS', nowMs: now() });
  };

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
      {confirming ? (
        <div
          style={{
            ...card,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          <p
            className="pre-line"
            style={{ margin: 0, fontSize: 12, color: '#f2ead8', lineHeight: 1.6 }}
          >
            * {t(SYS.restIncomplete)}
          </p>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}
          >
            <button
              className="hv"
              style={{ ...btnOutline, minHeight: 44 }}
              onClick={() => {
                setConfirming(false);
                dispatch({ type: 'START_FOCUS', nowMs: now() });
              }}
            >
              {t(UI.buttons.startAnyway)}
            </button>
            <button
              className="hv"
              style={{ ...btnOutline, minHeight: 44 }}
              onClick={() => setConfirming(false)}
            >
              {t(UI.buttons.keepResting)}
            </button>
          </div>
        </div>
      ) : (
        <button className="hv" style={btnDashed} onClick={startFocus}>
          {tf(UI.buttons.startFocus, { action: t(action?.nameId ?? '') })}
        </button>
      )}
    </div>
  );
}

function RestJournal({ state }: { state: GameState }) {
  // 정성적 욕구 관찰 한 줄 — 숫자 없이 밴드별 어휘만 (돌이 없으면 관찰도 없다)
  const glance = isRockPresent(state)
    ? tf(SYS.needsGlance.frame, {
        physiological: t(
          SYS.needsGlance.words.physiological[needsBand(state.stats.needs.physiological)],
        ),
        safety: t(SYS.needsGlance.words.safety[needsBand(state.stats.needs.safety)]),
        belonging: t(
          SYS.needsGlance.words.belonging[needsBand(state.stats.needs.belonging)],
        ),
        esteem: t(SYS.needsGlance.words.esteem[needsBand(state.stats.needs.esteem)]),
      })
    : null;
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
        {glance && (
          <div style={{ fontSize: 12, color: '#a89cb4' }}>* {glance}</div>
        )}
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
  // 돌이 없을 때(잠수/빈자리)는 '과한 관심을 부담스러워한다'가 어울리지 않는다
  const spentId = isRockPresent(state) ? SYS.talkSpent : SYS.talkSpentAbsent;
  if (!ts) {
    return (
      <p style={{ margin: 0, fontSize: 11, color: '#8a7f96' }}>
        * {t(spentId)}
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
            * {t(spentId)}
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

  // 구매 직후 배치 결정은 상점을 덮는다 — 결정 전에는 다음 물건을 살 수 없다
  // (pendingPlacement가 한 칸뿐이라, 덮지 않으면 연속 구매 시 이전 결정이 사라진다)
  if (pending) {
    const item = gameData.shop.find((i) => i.id === pending);
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <p
          className="pre-line"
          style={{ margin: 0, fontSize: 13, color: '#f2ead8', lineHeight: 1.7 }}
        >
          * {tf(SYS.placement.prompt, { item: t(item?.nameId ?? '') })}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="hv"
            style={{ ...btnOutline, minHeight: 44, minWidth: 110 }}
            onClick={() =>
              dispatch({ type: 'SET_PLACEMENT', itemId: pending, placed: true })
            }
          >
            {t(UI.shop.place)}
          </button>
          <button
            className="hv"
            style={{ ...btnOutline, minHeight: 44, minWidth: 110 }}
            onClick={() =>
              dispatch({ type: 'SET_PLACEMENT', itemId: pending, placed: false })
            }
          >
            {t(UI.shop.stash)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it) => {
          const isConsumable = !!it.consumable;
          // 소모품은 재고(0/1)로 관리 — 소모하면 다시 살 수 있다
          const owned = !isConsumable && it.id in state.items;
          const stocked = isConsumable && (state.supplies[it.id] ?? 0) > 0;
          const reqMissing =
            it.requires !== undefined && !(it.requires in state.items);
          const available = isItemAvailable(it, state);
          const poor = state.care.points < it.price;
          const disabled = owned || stocked || poor || !available || reqMissing;
          const stateLabel = owned
            ? t(UI.shop.owned)
            : stocked
              ? t(UI.shop.stocked)
              : reqMissing
                ? tf(UI.shop.requires, {
                    name: t(
                      gameData.shop.find((o) => o.id === it.requires)?.nameId ?? '',
                    ),
                  })
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
