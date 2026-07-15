import { useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch, t } from '../store/appStore';
import { gameData } from '../store/gameStore';
import { UI, pickText } from '../game/text';
import { needsLevelOf } from '../game/stats';
import { allowedIntimacy } from '../game/security';
import { startAbsence, presentState } from '../game/absence';
import { wipeSave } from '../persistence/persist';
import { BALANCE } from '../game/balance';
import { btnSmall } from '../components/ui';

/**
 * 개발용 디버그 패널 — DEV 전용. App이 import.meta.env.DEV + ?debug=1 게이트로 동적 로드하므로
 * 프로덕션 번들에는 이 파일이 포함되지 않는다.
 * 숨은 수치·기억/추억 열람, 타이머 빨리감기, 잠수/엔딩 강제, 마일스톤 프리뷰, 세이브 삭제.
 * 필드 라벨은 게임 텍스트가 아닌 기술 명칭이라 카탈로그를 거치지 않는다.
 */
export default function DebugPanel({
  state,
  nowMs,
}: {
  state: GameState;
  nowMs: number;
}) {
  const [panel, setPanel] = useState<'none' | 'stats' | 'tools' | 'mem'>('none');
  const toggle = (p: 'stats' | 'tools' | 'mem') =>
    setPanel((cur) => (cur === p ? 'none' : p));

  const fastForward = () => {
    if (state.phase === 'focus') dispatch({ type: 'TICK', dtSec: 300 });
    else if (state.phase === 'rest')
      appStore.setState((prev) => ({
        state: { ...prev.state, rest: { ...prev.state.rest, endsAt: nowMs } },
      }));
  };

  return (
    <div
      style={{
        border: '2px dashed #6b6178',
        color: '#a89cb4',
        fontSize: 11,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          flexWrap: 'wrap',
        }}
      >
        <span>debug</span>
        <button className="hv" style={btnSmall} onClick={fastForward}>
          {t(UI.debug.fastForward)}
        </button>
        <TabBtn label="stats" on={panel === 'stats'} onClick={() => toggle('stats')} />
        <TabBtn label="tools" on={panel === 'tools'} onClick={() => toggle('tools')} />
        <TabBtn label="mem" on={panel === 'mem'} onClick={() => toggle('mem')} />
        <span style={{ marginLeft: 'auto', color: '#6b6178' }}>
          {state.phase} · {state.era}
          {state.presence.state === 'absent' ? ' · absent' : ''}
        </span>
      </div>
      {panel === 'stats' && <DebugStats state={state} />}
      {panel === 'tools' && <DebugTools state={state} />}
      {panel === 'mem' && <DebugMemory state={state} />}
    </div>
  );
}

function DebugTools({ state }: { state: GameState }) {
  const toggleAbsence = () =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        presence:
          prev.state.presence.state === 'absent'
            ? presentState()
            : startAbsence(() => Math.random()),
      },
    }));

  // 엔딩 강제: 자아실현 완성 + 엔딩 전 대화 소진으로 두고 엔딩 이벤트로 점프
  const forceEnding = () =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        era: 'raising',
        phase: 'ending',
        stats: { ...prev.state.stats, selfActualization: BALANCE.SELF_ACT_COMPLETE },
        endingTalksSeen: gameData.endings.preEndingTalks.length,
      },
    }));

  // 마일스톤 프리뷰: 휴식 대화 슬롯에 해당 마일스톤 텍스트를 띄운다 (텍스트 확인용)
  const previewMilestone = (textId: string) =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        phase: 'rest',
        restStep: 'talk',
        rest: {
          ...prev.state.rest,
          talkPressed: true,
          talkState: {
            kind: 'milestone',
            pages: pickText(gameData.text, textId, () => 0),
            hasChoice: false,
            done: false,
          },
        },
      },
    }));

  const wipe = async () => {
    await wipeSave();
    location.reload();
  };

  return (
    <div style={panelStyle}>
      <Section label="force" />
      <div style={rowWrap}>
        <button className="hv" style={btnSmall} onClick={toggleAbsence}>
          {t(
            state.presence.state === 'absent'
              ? UI.debug.endAbsence
              : UI.debug.triggerAbsence,
          )}
        </button>
        <button className="hv" style={btnSmall} onClick={forceEnding}>
          force ending
        </button>
        <button className="hv" style={btnSmall} onClick={() => void wipe()}>
          wipe save
        </button>
      </div>
      <Section label="milestone preview" />
      <div style={rowWrap}>
        {gameData.events.milestones.map((m) => (
          <button
            key={m.id}
            className="hv"
            style={btnSmall}
            onClick={() => previewMilestone(m.textId)}
          >
            {m.id}
          </button>
        ))}
      </div>
    </div>
  );
}

function DebugMemory({ state }: { state: GameState }) {
  const tokens = Object.entries(state.memory);
  return (
    <div style={panelStyle}>
      <Section label={`memory tokens (${tokens.length})`} />
      {tokens.length === 0 && <div style={{ color: '#6b6178' }}>—</div>}
      {tokens.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: '#c9c0d4' }}>{k}</span>{' '}
          <span style={{ color: '#8a7f96' }}>
            w={v.w.toFixed(2)} count={v.count} lastAt={v.lastAt}
          </span>
        </div>
      ))}
      <Section label={`remembrances (${state.remembrances.length})`} />
      {state.remembrances.length === 0 && (
        <div style={{ color: '#6b6178' }}>—</div>
      )}
      {state.remembrances.map((r) => (
        <div key={r.id}>
          <span
            style={{
              color: state.remembrancesRecalled.includes(r.id)
                ? '#6b6178'
                : '#ffd866',
            }}
          >
            {r.id}
          </span>{' '}
          <span style={{ color: '#8a7f96' }}>
            {state.remembrancesRecalled.includes(r.id) ? '(recalled)' : '(new)'}{' '}
            {r.summaryId} / {r.revealId}
          </span>
        </div>
      ))}
    </div>
  );
}

function DebugStats({ state }: { state: GameState }) {
  const st = state.stats;
  const usedPools = Object.entries(state.dialogue.usedByPool)
    .map(([k, v]) => `${k}[${v.length}]`)
    .join(' ');
  const list = (arr: readonly string[]) => (arr.length ? arr.join(', ') : '—');

  return (
    <div
      style={{
        ...panelStyle,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        columnGap: 10,
        rowGap: 2,
      }}
    >
      <Section label="needs" />
      <Row k="physiological" v={st.needs.physiological} />
      <Row k="safety" v={st.needs.safety} />
      <Row k="belonging" v={st.needs.belonging} />
      <Row k="esteem" v={st.needs.esteem} />
      <Row k="→ level" v={needsLevelOf(st.needs)} />

      <Section label="stats" />
      <Row k="mood" v={st.mood} />
      <Row k="affection" v={st.affection} />
      <Row k="security" v={`${st.security} (allow≤${allowedIntimacy(st.security)})`} />
      <Row k="selfActual." v={st.selfActualization} />
      <Row k="dependence" v={st.dependence} />

      <Section label="care" />
      <Row k="points" v={state.care.points} />
      <Row k="carryMin" v={state.care.carryMinutes.toFixed(1)} />

      <Section label="presence / apart" />
      <Row
        k="presence"
        v={`${state.presence.state} plan${state.presence.plannedSessions} low${state.presence.lowIntimacyProgress}${state.presence.returnPending ? ' return!' : ''}`}
      />
      <Row
        k="apart"
        v={`visit${state.apart.visiting ? 'Y' : 'N'} left${state.apart.visitSessionsLeft} leave${state.apart.leavePending ? 'Y' : 'N'} hold${state.apart.holdCount}`}
      />

      <Section label="flags / unlocks" />
      <Row k="flags" v={list(state.flags)} />
      <Row k="unlockAct" v={list(state.unlockedActions)} />
      <Row k="unlockItem" v={list(state.unlockedItems)} />

      <Section label="items (placed)" />
      <Row
        k="items"
        v={
          Object.entries(state.items)
            .map(([k, v]) => `${k}${v.placed ? '✓' : '·'}`)
            .join(' ') || '—'
        }
      />

      <Section label="progress" />
      <Row k="totals" v={`${state.totals.sessions}sess ${(state.totals.focusSeconds / 3600).toFixed(1)}h`} />
      <Row k="milestones" v={list(state.milestonesFired)} />
      <Row k="endingTalks" v={state.endingTalksSeen} />
      <Row k="foreUsed" v={list(state.foreUsed.map(String))} />
      <Row k="pendingEvent" v={state.pendingEvent ? state.pendingEvent.promptId : '—'} />
      <Row k="usedPools" v={usedPools || '—'} />

      <Section label="session" />
      <Row
        k="session"
        v={`el${Math.round(state.session.elapsedSec)}s fired${state.session.choicesFired} marks[${state.session.timeMarksFired.join(',')}]`}
      />
    </div>
  );
}

const panelStyle = {
  borderTop: '2px dashed #4a4156',
  padding: '6px 8px',
  maxHeight: 260,
  overflowY: 'auto' as const,
  color: '#c9c0d4',
  lineHeight: 1.5,
};

const rowWrap = {
  gridColumn: '1 / -1',
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap' as const,
  marginBottom: 4,
};

function TabBtn({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="hv"
      style={{ ...btnSmall, color: on ? '#ffd866' : '#a89cb4' }}
      onClick={onClick}
    >
      {label} {on ? '▴' : '▾'}
    </button>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        color: '#ffd866',
        marginTop: 4,
        borderBottom: '1px solid #4a4156',
      }}
    >
      {label}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <>
      <span style={{ color: '#8a7f96' }}>{k}</span>
      <span style={{ wordBreak: 'break-all' }}>{v}</span>
    </>
  );
}
