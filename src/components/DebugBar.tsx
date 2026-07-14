import { useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch, t } from '../store/appStore';
import { UI } from '../game/text';
import { needsLevelOf } from '../game/stats';
import { allowedIntimacy } from '../game/security';
import { btnSmall } from './ui';

/**
 * ?debug=1 일 때만 표시되는 개발용 바 — 타이머 빨리감기 + 숨은 수치 뷰어.
 * 잠수 발동/해제는 설정 모달의 디버그 영역에 있다.
 * (프로덕션 노출 금지 규칙: 이 바 전체가 ?debug=1 게이트 뒤에 있다. M4에서 DEV 전용 패널로 이관 예정)
 * 필드 라벨은 게임 텍스트가 아닌 기술 명칭이라 카탈로그를 거치지 않는다.
 */
export function DebugBar({ state, nowMs }: { state: GameState; nowMs: number }) {
  const [open, setOpen] = useState(false);
  const fastForward = () => {
    if (state.phase === 'focus') {
      dispatch({ type: 'TICK', dtSec: 300 }); // 집중 +5분
    } else if (state.phase === 'rest') {
      appStore.setState((prev) => ({
        state: { ...prev.state, rest: { ...prev.state.rest, endsAt: nowMs } },
      }));
    }
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
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}
      >
        <span>debug</span>
        <button className="hv" style={btnSmall} onClick={fastForward}>
          {t(UI.debug.fastForward)}
        </button>
        <button
          className="hv"
          style={btnSmall}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'stats ▴' : 'stats ▾'}
        </button>
        <span style={{ marginLeft: 'auto', color: '#6b6178' }}>
          {state.phase} · {state.era}
          {state.presence.state === 'absent' ? ' · absent' : ''}
        </span>
      </div>
      {open && <DebugStats state={state} />}
    </div>
  );
}

function DebugStats({ state }: { state: GameState }) {
  const st = state.stats;
  const memory = Object.entries(state.memory)
    .map(([k, v]) => `${k}=${v.w.toFixed(1)}×${v.count}`)
    .join('  ');
  const usedPools = Object.entries(state.dialogue.usedByPool)
    .map(([k, v]) => `${k}[${v.length}]`)
    .join(' ');
  const list = (arr: readonly string[]) => (arr.length ? arr.join(', ') : '—');

  return (
    <div
      style={{
        borderTop: '2px dashed #4a4156',
        padding: '6px 8px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        columnGap: 10,
        rowGap: 2,
        maxHeight: 260,
        overflowY: 'auto',
        color: '#c9c0d4',
        lineHeight: 1.5,
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

      <Section label="memory / remembrance" />
      <Row k="memory" v={memory || '—'} />
      <Row k="rememb." v={list(state.remembrances.map((r) => r.id))} />
      <Row k="recalled" v={list(state.remembrancesRecalled)} />

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
