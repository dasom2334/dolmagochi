import type { ActionId, GameState } from '../game/types';
import { BALANCE } from '../game/balance';
import { isRockPresent, PERSONAL_WORK_ACTION } from '../game/stateMachine';
import { dispatch, now, t, tf } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { gameData } from '../store/gameStore';
import { btnDashed } from './ui';
import { UmbrellaPrompt } from './UmbrellaPrompt';

/** 세션 포크가 활성인가 (M18) — 개막(3티어) 후의 1차 육성, 돌 재석 */
export function approachActive(state: GameState): boolean {
  return (
    state.era === 'raising' &&
    isRockPresent(state) &&
    !state.presence.sick &&
    state.relationTier >= BALANCE.ATTACH_ONSET_TIER
  );
}

/** 행동별 포크 라벨 (M19c) — 카탈로그에 있으면 그 행동의 문구, 없으면 공용 폴백 */
function forkLabel(
  side: 'near' | 'apart',
  actionId: ActionId,
  actionName: string,
): string {
  const specific = `ui.approach.${side}.${actionId}`;
  return gameData.text[specific]
    ? t(specific)
    : tf(UI.approach[side], { action: actionName });
}

function ForkButtons({
  actionId,
  actionName,
  onStart,
}: {
  actionId: ActionId;
  actionName: string;
  onStart: (approach?: 'near' | 'apart') => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <button className="hv" style={btnDashed} onClick={() => onStart('near')}>
        {forkLabel('near', actionId, actionName)}
      </button>
      <button className="hv" style={btnDashed} onClick={() => onStart('apart')}>
        {forkLabel('apart', actionId, actionName)}
      </button>
    </div>
  );
}

/**
 * 자유행동 위임 (피드백2) — '오늘은 돌에게 맡긴다'를 누르면 돌이 원하는
 * 세션이 공개된다: 실제 행동(포크 선택으로 시작) / 미해금(구매 힌트+확인만) /
 * 개인작업(작업 세션으로 시작 — 이것도 어엿한 행동이다).
 */
function DelegateControl({
  state,
  onStart,
}: {
  state: GameState;
  onStart: (approach?: 'near' | 'apart') => void;
}) {
  const d = state.delegate;
  if (!d) {
    return (
      <button
        className="hv"
        style={btnDashed}
        onClick={() => dispatch({ type: 'FREE_DELEGATE' })}
      >
        {t(UI.delegate.start)}
      </button>
    );
  }
  const nameOf = (id: ActionId) =>
    t(gameData.actions.find((a) => a.id === id)?.nameId ?? '');
  if (d.kind === 'locked') {
    const itemName = t(
      gameData.shop.find((s) => s.id === d.item)?.nameId ?? '',
    );
    // 행동별 문구가 있으면 그것 — 없으면 공용 폴백 ('~하기를 하고 싶은' 겹말 방지)
    const lockedId = `sys.delegate.locked.${d.action}`;
    const lockedLine = gameData.text[lockedId]
      ? tf(lockedId, { item: itemName })
      : tf(SYS.delegate.locked, { action: nameOf(d.action), item: itemName });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>
          {lockedLine}
        </p>
        <button
          className="hv"
          style={btnDashed}
          onClick={() => dispatch({ type: 'DELEGATE_CANCEL' })}
        >
          {t(UI.delegate.confirm)}
        </button>
      </div>
    );
  }
  const wantsId = d.kind === 'personal' ? null : `sys.delegate.wants.${d.action}`;
  const announce =
    d.kind === 'personal'
      ? t(SYS.delegate.personal)
      : wantsId && gameData.text[wantsId]
        ? t(wantsId)
        : tf(SYS.delegate.wants, { action: nameOf(d.action) });
  // 개인작업도 제 행동으로 연다 — 버튼에 '자유행동'이 뜨던 자리다
  const forkId: ActionId =
    d.kind === 'personal' ? PERSONAL_WORK_ACTION : d.action;
  const forkName = nameOf(forkId);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>{announce}</p>
      {approachActive(state) ? (
        <ForkButtons actionId={forkId} actionName={forkName} onStart={onStart} />
      ) : (
        <button className="hv" style={btnDashed} onClick={() => onStart()}>
          {tf(UI.buttons.startFocus, { action: forkName })}
        </button>
      )}
    </div>
  );
}

/**
 * 집중 시작 컨트롤 (M18) — 우산 대기면 우산 질문, 자유행동이면 위임 흐름,
 * 포크 활성이면 두 버튼(곁에서/한 발 떨어져), 아니면 단일 시작 버튼.
 * 행동선택·휴식 공용. onStart를 주면 디스패치 대신 그 콜백을 부른다.
 */
export function StartFocusControl({
  state,
  actionName,
  onStart,
}: {
  state: GameState;
  actionName: string;
  onStart?: (approach?: 'near' | 'apart') => void;
}) {
  if (state.pendingUmbrella) return <UmbrellaPrompt />;
  const start = (approach?: 'near' | 'apart') => {
    if (onStart) onStart(approach);
    else dispatch({ type: 'START_FOCUS', nowMs: now(), approach });
  };
  // 자유행동 = 돌에게 맡기기 (피드백2): 돌이 곁에 있어야 위임이 성립한다.
  // 부재·2차 이후에는 예전처럼 단일 시작(혼자만의 세션)으로 흐른다
  if (
    state.selectedAction === 'free' &&
    isRockPresent(state) &&
    !state.presence.sick &&
    (state.era === 'raising' || state.era === 'cohabit')
  ) {
    return <DelegateControl state={state} onStart={start} />;
  }
  if (!approachActive(state)) {
    return (
      <button className="hv" style={btnDashed} onClick={() => start()}>
        {tf(UI.buttons.startFocus, { action: actionName })}
      </button>
    );
  }
  return (
    <ForkButtons
      actionId={state.selectedAction}
      actionName={actionName}
      onStart={start}
    />
  );
}
