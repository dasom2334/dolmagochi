import { useState } from 'react';
import type { GameState, RestStep } from '../game/types';
import type { ShopItemData } from '../data/schema';
import { gameData } from '../store/gameStore';
import { isItemAvailable, isRockPresent, weathersOfSeason } from '../game/stateMachine';
import { resolveSeason } from '../game/timeOfDay';
import { dateKey, needsBand } from '../game/stats';
import { dailyMoodLine } from '../game/mood';
import { careTargetNeed } from '../game/freeAction';
import { BALANCE } from '../game/balance';
import { dispatch, now, t, tf } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { btnDashed, btnOutline, btnSmall, card, PagesView } from './ui';
import { ActionGrid } from './ActionGrid';
import { StartFocusControl } from './StartFocusControl';
import { MemoryAlbum } from './MemoryAlbum';

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
  // 미완주 확인을 거치는 동안 포크 선택(M18)을 보존한다
  const [heldApproach, setHeldApproach] = useState<'near' | 'apart' | undefined>();

  const startFocus = (approach?: 'near' | 'apart') => {
    if (restIncomplete) {
      setHeldApproach(approach);
      setConfirming(true);
    } else dispatch({ type: 'START_FOCUS', nowMs: now(), approach });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <p
        style={{
          margin: 0,
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--ok)',
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
                border: `2px solid ${active ? 'var(--text)' : 'var(--hint-dim)'}`,
                background: active ? 'var(--text)' : 'transparent',
                color: active ? 'var(--panel)' : 'var(--ink-soft)',
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
            <WeatherRow state={state} />
            <ActionGrid state={state} />
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--hint)' }}>
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
            style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}
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
                dispatch({
                  type: 'START_FOCUS',
                  nowMs: now(),
                  approach: heldApproach,
                });
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
        // 우산 대기(M16)·세션 포크(M18)·단일 시작을 공용 컨트롤이 처리한다
        <StartFocusControl
          state={state}
          actionName={t(action?.nameId ?? '')}
          onStart={startFocus}
        />
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
  // 최결핍 강조 (M16): 자유행동 사다리를 막는 욕구가 바닥 밴드면 한 줄 더 —
  // 수치 없이, 지금 어느 축부터 챙겨야 하는지만 짚어준다
  const blocking = isRockPresent(state)
    ? careTargetNeed(state.stats.needs)
    : null;
  const hint =
    blocking && needsBand(state.stats.needs[blocking]) === 0
      ? t(SYS.needsHint[blocking])
      : null;
  // 오늘의 기분 (M17): 수치 없는 순수 서술 — 날짜로 고정, 날씨가 가볍게 기운다
  const mood = isRockPresent(state)
    ? dailyMoodLine(gameData.text, dateKey(now()), state.weather)
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
        <div style={{ fontSize: 12, color: 'var(--accent)' }}>
          {tf(SYS.restSummary, {
            mins: state.rest.summary.mins,
            earned: state.rest.summary.earned,
          })}
        </div>
        {mood && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>* {mood}</div>
        )}
        {glance && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>* {glance}</div>
        )}
        {hint && (
          <div style={{ fontSize: 12, color: 'var(--accent)' }}>* {hint}</div>
        )}
        {state.session.journal.map((j, i) => (
          <div
            key={i}
            className="pre-line"
            style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.6 }}
          >
            * <span style={{ color: 'var(--hint)' }}>{j.t}</span> {j.text}
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
                border: `2px solid ${off ? 'var(--line)' : 'var(--hint-dim)'}`,
                background: 'transparent',
                color: off ? 'var(--hint-dim)' : 'var(--text-soft)',
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
      <p style={{ margin: 0, fontSize: 11, color: 'var(--hint)' }}>
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
              onClick={() => dispatch({ type: 'TALK_CHOICE', yes: true, nowMs: now() })}
            >
              {t(UI.buttons.yes)}
            </button>
            <button
              className="hv"
              style={{ ...btnOutline, fontSize: 12, padding: '6px 20px' }}
              onClick={() => dispatch({ type: 'TALK_CHOICE', yes: false, nowMs: now() })}
            >
              {t(UI.buttons.no)}
            </button>
          </div>
        )}
        {spent && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--hint)' }}>
            * {t(spentId)}
          </p>
        )}
      </PagesView>
    </>
  );
}

/** 진열대: 지금 살 수 있는 다음 한 걸음만 — 보유·재고·이전 티어 미달·미해금은 숨긴다 */
function storeItems(state: GameState) {
  return gameData.shop.filter((it) => {
    if (!isItemAvailable(it, state)) return false;
    if (it.requires !== undefined && !(it.requires in state.items)) return false;
    if (it.consumable) return (state.supplies[it.id] ?? 0) === 0; // 재고는 소장품에
    return !(it.id in state.items); // 보유 비소모품도 소장품에
  });
}

/** 소장품: 보유 비소모품 + 재고 있는 소모품 — 배치/보관을 여기서 조절 */
function ownedList(state: GameState) {
  return gameData.shop.filter((it) =>
    it.consumable ? (state.supplies[it.id] ?? 0) > 0 : it.id in state.items,
  );
}

/** 날씨 줄 (M12) — 현재 날씨 표시 + 정성 지불 순환 변경. 자연 변화는 무료 */
function WeatherRow({ state }: { state: GameState }) {
  // 계절 가용 날씨 안에서만 순환 (M12: 눈=겨울, 꽃잎비=봄, 낙엽비=가을)
  const order = weathersOfSeason(resolveSeason(state.settings, now()));
  const idx = order.indexOf(state.weather);
  const next = order[(idx + 1) % Math.max(1, order.length)] ?? 'clear';
  const poor = state.care.points < BALANCE.WEATHER_CHANGE_COST;
  return (
    <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--hint)' }}>
      * {t(UI.weatherUi.now)} — {t(UI.weatherUi.kinds[state.weather])}{' '}
      <button
        className={poor ? undefined : 'hv-text'}
        disabled={poor}
        style={{
          border: 'none',
          background: 'none',
          color: poor ? 'var(--hint-dim)' : 'var(--ink)',
          fontFamily: 'inherit',
          fontSize: 11,
          cursor: poor ? 'default' : 'pointer',
        }}
        onClick={() =>
          dispatch({ type: 'SET_WEATHER', weather: next, nowMs: now() })
        }
      >
        [{t(UI.weatherUi.kinds[next])} — {tf(UI.weatherUi.change, { price: BALANCE.WEATHER_CHANGE_COST })}]
      </button>
    </p>
  );
}

function RestShop({ state }: { state: GameState }) {
  const [sub, setSub] = useState<'store' | 'owned' | 'memories'>('store');
  const [page, setPage] = useState(0);
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
          style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}
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

  // 도감(기억) 탭은 자체 페이저를 가진 앨범(MemoryAlbum)이 담당한다 (M19d)
  const all: ShopItemData[] =
    sub === 'store' ? storeItems(state) : sub === 'owned' ? ownedList(state) : [];
  const pages = Math.max(1, Math.ceil(all.length / 3));
  const p = Math.min(page, pages - 1);
  const items = all.slice(p * 3, p * 3 + 3);
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['store', 'owned', 'memories'] as const).map((k) => {
          const on = sub === k;
          return (
            <button
              key={k}
              className="hv"
              style={{
                border: `2px solid ${on ? 'var(--text)' : 'var(--line)'}`,
                background: on ? 'var(--text)' : 'transparent',
                color: on ? 'var(--panel)' : 'var(--ink-soft)',
                fontFamily: 'inherit',
                fontSize: 11,
                padding: '3px 10px',
                cursor: 'pointer',
              }}
              onClick={() => {
                setSub(k);
                setPage(0);
              }}
            >
              {t(
                k === 'store'
                  ? UI.shop.subStore
                  : k === 'owned'
                    ? UI.shop.subOwned
                    : UI.shop.subBadges,
              )}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sub !== 'memories' && items.length === 0 && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--hint)' }}>
            * {t(sub === 'owned' ? UI.shop.ownedEmpty : UI.shop.storeEmpty)}
          </p>
        )}
        {sub === 'memories' && <MemoryAlbum state={state} />}
        {sub !== 'memories' && items.map((it) => {
          if (sub === 'owned') {
            // 소장품: 배치/보관 조절 (소모품 포함 — 재고가 방에 보인다)
            const isPlaced = !!state.items[it.id]?.placed;
            return (
              <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: 'var(--text-soft)',
                    lineHeight: 1.5,
                    padding: '6px 4px',
                  }}
                >
                  {t(it.nameId)}{' '}
                  <span style={{ color: 'var(--hint)' }}>{t(it.descId)}</span>
                </div>
                <button
                  className="hv"
                  style={btnSmall}
                  onClick={() =>
                    dispatch({
                      type: 'SET_PLACEMENT',
                      itemId: it.id,
                      placed: !isPlaced,
                    })
                  }
                >
                  {t(isPlaced ? UI.shop.stash : UI.shop.place)}
                </button>
              </div>
            );
          }
          // 진열대: 지금 살 수 있는 것만 — 정성 여부만 표시.
          // 소모품은 이번 휴식의 진열 종류(고정 랜덤)를 이름에 병기한다.
          const poor = state.care.points < it.price;
          const stateLabel = poor
            ? t(UI.shop.poor)
            : tf(UI.shop.price, { price: it.price });
          const offerKey = it.consumable
            ? (state.rest.offers[it.id] ?? it.consumable.variants[0].key)
            : null;
          const offerName = offerKey ? t(`shop.${it.id}.var.${offerKey}`) : '';
          return (
            <div key={it.id} style={{ display: 'flex', gap: 6 }}>
              <button
                className={poor ? undefined : 'hv'}
                disabled={poor}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  border: `2px solid ${poor ? 'var(--line)' : 'var(--hint-dim)'}`,
                  background: 'transparent',
                  color: poor ? 'var(--hint-dim)' : 'var(--text-soft)',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  cursor: poor ? 'default' : 'pointer',
                  padding: '8px 10px',
                  lineHeight: 1.5,
                }}
                onClick={() =>
                  dispatch({ type: 'BUY', itemId: it.id, nowMs: now() })
                }
              >
                {t(it.nameId)}
                {offerName ? ` · ${offerName}` : ''} — {stateLabel}{' '}
                <span style={{ color: 'var(--hint)' }}>{t(it.descId)}</span>
              </button>
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
            color: p === 0 ? 'var(--line)' : 'var(--ink-soft)',
          }}
          onClick={() => setPage(Math.max(0, p - 1))}
        >
          ◂
        </button>
        <span style={{ fontSize: 11, color: 'var(--hint)' }}>
          {p + 1} / {pages}
        </span>
        <button
          className={p >= pages - 1 ? undefined : 'hv'}
          disabled={p >= pages - 1}
          style={{
            ...btnSmall,
            fontSize: 12,
            padding: '3px 12px',
            color: p >= pages - 1 ? 'var(--line)' : 'var(--ink-soft)',
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
          color: 'var(--text)',
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
