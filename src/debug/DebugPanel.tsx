import { useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch } from '../store/appStore';
import { gameData } from '../store/gameStore';
import { pickText } from '../game/text';
import { needsLevelOf } from '../game/stats';
import { affectionTier } from '../game/dialogue';
import { allowedIntimacy, attachQuadrant } from '../game/security';
import { startAbsence, presentState } from '../game/absence';
import { wipeSave } from '../persistence/persist';
import { BALANCE } from '../game/balance';
import { btnSmall } from '../components/ui';

/**
 * 개발용 디버그 패널 — DEV 전용. App이 import.meta.env.DEV + ?debug=1 게이트로 동적 로드하므로
 * 프로덕션 번들에는 이 파일이 포함되지 않는다.
 * 숨은 수치·기억/추억 열람, 타이머 빨리감기, 잠수/엔딩 강제, 마일스톤 프리뷰, 세이브 삭제.
 * 모든 라벨은 게임 텍스트가 아닌 기술 명칭이라 카탈로그를 거치지 않고 인라인으로 둔다.
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
          ≫ ff
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
      {panel === 'tools' && <DebugTools state={state} nowMs={nowMs} />}
      {panel === 'mem' && <DebugMemory state={state} />}
    </div>
  );
}

const DAY_MS = 86_400_000;

function DebugTools({ state, nowMs }: { state: GameState; nowMs: number }) {
  // 상태 패치 헬퍼 — 리듀서를 우회해 직접 쓴다 (DEV 전용이므로 허용)
  const patch = (fn: (s: GameState) => Partial<GameState>) =>
    appStore.setState((prev) => ({ state: { ...prev.state, ...fn(prev.state) } }));

  const apartReset = {
    visiting: false,
    visitSessionsLeft: 0,
    leavePending: false,
    holdCount: 0,
    held: false,
  };

  // 1차 말: 티어 7 + 자아실현 완성 + 토큰 게이트 충족 + 마일스톤 소진 →
  // 다음 휴식 대화부터 엔딩 전 대화가 흐른다 (hasEndingTokens 게이트 참고).
  // 다른 프리셋에서 돌아올 수 있도록 2·3차 필드를 함께 초기화한다
  const gateTokens = (
    memory: GameState['memory'],
    nowMs: number,
  ): GameState['memory'] => {
    const need = [
      ...gameData.actions.filter((a) => a.id !== 'nurse').map((a) => a.id),
      'choice',
      'personalWork',
      'buy-cushion',
    ];
    const next = { ...memory };
    for (const k of need) next[k] ??= { w: 1, count: 1, lastAt: nowMs };
    return next;
  };
  const jumpPreEnding = () =>
    patch((s) => ({
      era: 'raising',
      phase: 'actionSelect',
      memory: gateTokens(s.memory, nowMs),
      milestonesFired: gameData.events.milestones.map((m) => m.id),
      apart: { ...apartReset },
      planted: false,
      plantedAt: null,
      sproutGrowth: 0,
      witherLevel: 0,
      bloomSeen: false,
      letGoCount: 0,
      visitBlockedUntil: null,
      lastTreeFindDate: null,
      stats: {
        ...s.stats,
        affection: BALANCE.AFFECTION_TIERS[BALANCE.AFFECTION_TIERS.length - 1],
        selfActualization: BALANCE.SELF_ACT_COMPLETE,
        needs: { physiological: 90, safety: 90, belonging: 90, esteem: 90 },
      },
      relationTier: BALANCE.AFFECTION_TIERS.length,
      endingTalksSeen: 0,
      lastEndingTalkDate: null,
    }));

  // 2차 apart 개막: 작별 직후의 빈 방 (성장 0부터)
  const jumpApart = () =>
    patch(() => ({
      era: 'apart',
      phase: 'actionSelect',
      apart: { ...apartReset },
      planted: false,
      plantedAt: null,
      sproutGrowth: 0,
      witherLevel: 0,
      letGoCount: 0,
      bloomSeen: false,
      visitBlockedUntil: null,
      lastTreeFindDate: null,
    }));

  // 2차 동거: 의존도 중간에서 시작
  const jumpCohabit = () =>
    patch((s) => ({
      era: 'cohabit',
      phase: 'actionSelect',
      stats: { ...s.stats, dependence: 40 },
      planted: false,
      plantedAt: null,
      sproutGrowth: 0,
      witherLevel: 0,
    }));

  // apart 방문 강제 — 다음 세션들이 방문 세션이 된다
  const forceVisit = () =>
    patch((s) => ({
      era: 'apart',
      apart: { ...s.apart, visiting: true, visitSessionsLeft: 2, leavePending: false },
      planted: false,
      visitBlockedUntil: null,
    }));

  // 떠날 기색 — 휴식 화면에 붙잡기/보내주기 프롬프트를 띄운다 (사다리 확인용)
  const forceLeave = () =>
    patch((s) => ({
      era: 'apart',
      phase: 'rest',
      planted: false,
      rest: { ...s.rest, endsAt: 0 },
      apart: { ...s.apart, visiting: true, leavePending: true },
    }));

  // 심기 직전: 다음 무방문 세션 정산에서 성장 100을 넘어 심기 이벤트가 뜬다
  const sproutReady = () =>
    patch((s) => ({
      era: 'apart',
      phase: 'actionSelect',
      apart: { ...apartReset },
      planted: false,
      plantedAt: null,
      sproutGrowth: 99,
      witherLevel: 0,
      bloomSeen: true,
      letGoCount: Math.max(1, s.letGoCount),
      visitBlockedUntil: null,
    }));

  // 3차: 심은 지 N일째로 점프 — 다음 세션 종료 시 그날의 발견이 뜬다
  const treeAt = (days: number) =>
    patch((s) => ({
      era: 'apart',
      phase: 'actionSelect',
      apart: { ...apartReset },
      planted: true,
      plantedAt: nowMs - days * DAY_MS,
      sproutGrowth: 100,
      bloomSeen: true,
      letGoCount: Math.max(1, s.letGoCount),
      lastTreeFindDate: null,
      visitBlockedUntil: null,
    }));

  // 다음날: 하루 1회 게이트를 전부 다시 연다 — 티어 승급·엔딩 전 대화·
  // 나무 발견·날씨 리롤이 같은 날에도 한 번 더 진행된다.
  // 심은 나무가 있으면 수령도 하루 늘려 달력을 일관되게 민다.
  // (lastDecayDate는 건드리지 않는다 — 욕구 감쇠까지 당기면 스탯이 떨어져
  //  진행 확인이 아니라 회복 노동이 된다)
  const nextDay = () =>
    patch((s) => ({
      lastTierUpDate: null,
      lastEndingTalkDate: null,
      lastTreeFindDate: null,
      lastWeatherDate: null,
      plantedAt: s.plantedAt !== null ? s.plantedAt - DAY_MS : null,
    }));

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

  // 마일스톤 프리뷰: 휴식 대화 슬롯에 해당 마일스톤 텍스트를 띄운다 (텍스트 확인용).
  // endsAt=0으로 둬야 App의 휴식 만료 effect(endsAt>0 && now>=endsAt)에 즉시 튕기지 않는다.
  const previewMilestone = (textId: string) =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        phase: 'rest',
        restStep: 'talk',
        rest: {
          ...prev.state.rest,
          endsAt: 0,
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

  const addCare = () =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        care: { ...prev.state.care, points: prev.state.care.points + 5 },
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
          {state.presence.state === 'absent' ? 'absence off' : 'absence on'}
        </button>
        <button className="hv" style={btnSmall} onClick={forceEnding}>
          force ending
        </button>
        <button className="hv" style={btnSmall} onClick={addCare}>
          +5 care
        </button>
        <button className="hv" style={btnSmall} onClick={() => void wipe()}>
          wipe save
        </button>
      </div>
      <Section label="phase jump" />
      <div style={rowWrap}>
        <button className="hv" style={btnSmall} onClick={jumpPreEnding}>
          1차말
        </button>
        <button className="hv" style={btnSmall} onClick={jumpApart}>
          apart
        </button>
        <button className="hv" style={btnSmall} onClick={jumpCohabit}>
          cohabit
        </button>
        <button className="hv" style={btnSmall} onClick={forceVisit}>
          방문
        </button>
        <button className="hv" style={btnSmall} onClick={forceLeave}>
          떠날기색
        </button>
        <button className="hv" style={btnSmall} onClick={sproutReady}>
          심기직전
        </button>
        <button className="hv" style={btnSmall} onClick={nextDay}>
          다음날
        </button>
      </div>
      <Section label="tree (3차)" />
      <div style={rowWrap}>
        {[0, 7, 30, 100, 200, 365].map((d) => (
          <button key={d} className="hv" style={btnSmall} onClick={() => treeAt(d)}>
            d{d}
          </button>
        ))}
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
      <Row k="affection" v={`${st.affection.toFixed(1)} (tier ${affectionTier(st.affection)}/7)`} />
      <Row k="abandon." v={st.abandonment} />
      <Row k="intiThreat" v={st.intimacyThreat} />
      <Row
        k="→ security"
        v={`${st.security} (allow≤${allowedIntimacy(st.security)}, ${attachQuadrant(st.abandonment, st.intimacyThreat)})`}
      />
      <Row k="selfActual." v={st.selfActualization} />
      <Row k="dependence" v={st.dependence} />

      <Section label="care" />
      <Row k="points" v={state.care.points} />
      <Row k="carryMin" v={state.care.carryMinutes.toFixed(1)} />

      <Section label="presence / apart" />
      <Row
        k="presence"
        v={`${state.presence.state}${state.presence.sick ? ' sick!' : ''}${state.presence.returnPending ? ' return!' : ''}`}
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

      <Section label="supplies" />
      <Row
        k="stock"
        v={
          Object.entries(state.supplies)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${k}×${n}`)
            .join(' ') || '—'
        }
      />
      <Row
        k="session"
        v={
          state.session.supply
            ? `${state.session.supply.itemId}:${state.session.supply.variant}`
            : '—'
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
