import { useState } from 'react';
import type { GameState } from '../game/types';
import { appStore, dispatch } from '../store/appStore';
import { gameData } from '../store/gameStore';
import { pickText } from '../game/text';
import { needsLevelOf } from '../game/stats';
import { affectionTier } from '../game/dialogue';
import { allowedIntimacy, attachQuadrant, attachRate } from '../game/security';
import { startAbsence, presentState } from '../game/absence';
import { wipeSave } from '../persistence/persist';
import { BALANCE } from '../game/balance';
import { roomOfItem } from '../game/rooms';
import { btnSmall } from '../components/ui';
import {
  notify,
  notifyPermission,
  requestNotifyPermission,
} from '../notifications';

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
  const [ffMin, setFfMin] = useState(5);
  const toggle = (p: 'stats' | 'tools' | 'mem') =>
    setPanel((cur) => (cur === p ? 'none' : p));

  // 빨리감기 — 집중은 ffMin분 경과, 휴식은 ffMin분만큼 남은 시간 차감
  const fastForward = () => {
    const sec = Math.max(1, ffMin) * 60;
    if (state.phase === 'focus')
      dispatch({ type: 'TICK', dtSec: sec, nowMs: Date.now() });
    else if (state.phase === 'rest')
      appStore.setState((prev) => ({
        state: {
          ...prev.state,
          rest: {
            ...prev.state.rest,
            endsAt: Math.max(nowMs, prev.state.rest.endsAt - sec * 1000),
          },
        },
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
        <input
          type="number"
          min={1}
          value={ffMin}
          onChange={(e) => setFfMin(Number(e.target.value) || 1)}
          style={numInput}
          title="빨리감기 분"
        />
        <span>m</span>
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
      treeBondDays: 0,
      lastTreeBondDate: null,
      treeBondToday: 0,
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
      treeBondDays: 0,
      lastTreeBondDate: null,
      treeBondToday: 0,
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
      treeBondDays: 0,
      lastTreeBondDate: null,
      treeBondToday: 0,
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
      lastTreeBondDate: null,
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

  // 보장 위기 아크 강제 예약 (M17) — 다음 세션 경계에서 발동한다.
  // 티어 점프·구세이브 백필로 예약 조건을 지나쳐 아크를 못 보는 경우를 위해.
  const queueArc = (arc: 'retreat' | 'sick') =>
    patch((s) => ({
      era: 'raising',
      pendingCrises: s.pendingCrises.includes(arc)
        ? s.pendingCrises
        : [...s.pendingCrises, arc],
      crisisArcsFired: s.crisisArcsFired.filter((c) => c !== arc),
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

  const [careAmt, setCareAmt] = useState(5);
  const addCare = () =>
    appStore.setState((prev) => ({
      state: {
        ...prev.state,
        care: { ...prev.state.care, points: prev.state.care.points + careAmt },
      },
    }));

  const wipe = async () => {
    await wipeSave();
    location.reload();
  };

  // 씬 확인용 — 거실 캔버스 씬은 시간·계절·날씨·구매 여부마다 다르게 그려진다.
  // 실제로 그 조합을 보려면 하루를 기다리거나 소품을 하나씩 사야 해서, 여기서
  // 표시 축만 직접 갈아 끼운다. 게임 진행에 쓰는 값이 아니라 **눈으로 볼 용도**다.
  const setSettings = (p: Partial<GameState['settings']>) =>
    patch((s) => ({ settings: { ...s.settings, ...p } }));
  const setWetness = (wetness: GameState['session']['wetness']) =>
    patch((s) => ({ session: { ...s.session, wetness } }));
  // 거실 소품 일괄 배치/해제 — 게이팅이 맞는지 보려면 켠 방과 끈 방을 번갈아 봐야 한다.
  // 방은 게임과 **같은 규칙**으로 판정한다. shop.json 의 room 만 보면 벽난로·담요처럼
  // boosts 로 방이 정해지는 물건이 빠져 "다 놨는데 벽난로가 없다" 가 된다.
  // moss(돌 부착, 방 무관)는 돌 상태 오버레이 확인에 필요해서 같이 놓는다.
  const livingItems = gameData.shop
    .filter((i) => i.id === 'moss' || roomOfItem(i, gameData.rooms) === 'living')
    .map((i) => i.id);
  const setLivingItems = (placed: boolean) =>
    patch((s) => ({
      items: {
        ...s.items,
        ...Object.fromEntries(livingItems.map((id) => [id, { placed }])),
      },
    }));
  // 침실 소품도 같은 방식 — 침실 캔버스 게이팅(침대·책상·랩탑·스탠드·나이트드링크) 확인용
  const bedroomItems = gameData.shop
    .filter((i) => roomOfItem(i, gameData.rooms) === 'bedroom')
    .map((i) => i.id);
  const setBedroomItems = (placed: boolean) =>
    patch((s) => ({
      items: {
        ...s.items,
        ...Object.fromEntries(bedroomItems.map((id) => [id, { placed }])),
      },
    }));
  // 책장 2번째 칸은 일회용 책의 **누적 구매 수**를 따라간다 (supplies 로는 못 센다)
  const setReadbooks = (n: number) =>
    patch((s) => ({
      memory: { ...s.memory, 'buy-readbook': { w: n, count: n, lastAt: nowMs } },
    }));

  const placedCount = livingItems.filter((id) => state.items[id]?.placed).length;

  return (
    <div style={panelStyle}>
      <Section label="scene (표시 축만 — 진행과 무관)" />
      <div style={rowWrap}>
        <span style={dim}>room</span>
        {gameData.rooms.map((r) => (
          <button
            key={r.id}
            className="hv"
            style={state.settings.lastRoom === r.id ? btnOn : btnSmall}
            onClick={() => setSettings({ lastRoom: r.id })}
          >
            {r.id}
          </button>
        ))}
      </div>
      <div style={rowWrap}>
        <span style={dim}>time</span>
        {(['auto', 'day', 'twilight', 'night'] as const).map((v) => (
          <button
            key={v}
            className="hv"
            style={state.settings.timeOfDay === v ? btnOn : btnSmall}
            onClick={() => setSettings({ timeOfDay: v })}
          >
            {v}
          </button>
        ))}
      </div>
      <div style={rowWrap}>
        <span style={dim}>season</span>
        {(['auto', 'spring', 'summer', 'autumn', 'winter'] as const).map((v) => (
          <button
            key={v}
            className="hv"
            style={state.settings.season === v ? btnOn : btnSmall}
            onClick={() => setSettings({ season: v })}
          >
            {v}
          </button>
        ))}
      </div>
      <div style={rowWrap}>
        <span style={dim}>weather</span>
        {(['clear', 'rain', 'downpour', 'snow', 'petals', 'leaves'] as const).map(
          (v) => (
            <button
              key={v}
              className="hv"
              style={state.weather === v ? btnOn : btnSmall}
              onClick={() => patch(() => ({ weather: v }))}
            >
              {v}
            </button>
          ),
        )}
      </div>
      <div style={rowWrap}>
        <span style={dim}>돌 젖음</span>
        {([null, 'wet', 'snowy'] as const).map((v) => (
          <button
            key={String(v)}
            className="hv"
            style={state.session.wetness === v ? btnOn : btnSmall}
            onClick={() => setWetness(v)}
          >
            {v ?? 'none'}
          </button>
        ))}
      </div>
      <div style={rowWrap}>
        <span style={dim}>
          거실 소품 {placedCount}/{livingItems.length}
        </span>
        <button className="hv" style={btnSmall} onClick={() => setLivingItems(true)}>
          전부 배치
        </button>
        <button className="hv" style={btnSmall} onClick={() => setLivingItems(false)}>
          전부 해제
        </button>
        <span style={dim}>
          침실 소품 {bedroomItems.filter((id) => state.items[id]?.placed).length}/
          {bedroomItems.length}
        </span>
        <button className="hv" style={btnSmall} onClick={() => setBedroomItems(true)}>
          전부 배치
        </button>
        <button className="hv" style={btnSmall} onClick={() => setBedroomItems(false)}>
          전부 해제
        </button>
        <span style={dim}>일회용 책 누적</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <button
            key={n}
            className="hv"
            style={
              (state.memory['buy-readbook']?.count ?? 0) === n ? btnOn : btnSmall
            }
            onClick={() => setReadbooks(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {/* 알림 진단 — OS 차단(시스템 설정·집중 모드)은 웹에서 조회할 수 없어,
          실제로 띄워 보는 것만이 확인 방법이다. 안 뜨면 권한 위쪽(OS)이 막는 것. */}
      <Section label="notify" />
      <div style={rowWrap}>
        <span style={dim}>권한 {notifyPermission()}</span>
        <button
          className="hv"
          style={btnSmall}
          onClick={() => void requestNotifyPermission()}
        >
          권한 요청
        </button>
        <button
          className="hv"
          style={btnSmall}
          onClick={() => notify('테스트 알림 — 이게 보이면 알림 경로는 정상')}
        >
          테스트 알림
        </button>
      </div>
      <Section label="force" />
      <div style={rowWrap}>
        <button className="hv" style={btnSmall} onClick={toggleAbsence}>
          {state.presence.state === 'absent' ? 'absence off' : 'absence on'}
        </button>
        <button className="hv" style={btnSmall} onClick={forceEnding}>
          force ending
        </button>
        <button className="hv" style={btnSmall} onClick={addCare}>
          +care
        </button>
        <input
          type="number"
          min={1}
          value={careAmt}
          onChange={(e) => setCareAmt(Number(e.target.value) || 1)}
          style={numInput}
          title="추가할 정성"
        />
        <button className="hv" style={btnSmall} onClick={() => void wipe()}>
          wipe save
        </button>
      </div>
      <Section label="crisis arc (다음 세션 발동)" />
      <div style={rowWrap}>
        <button className="hv" style={btnSmall} onClick={() => queueArc('retreat')}>
          잠수(회피)
        </button>
        <button className="hv" style={btnSmall} onClick={() => queueArc('sick')}>
          병간호(집착)
        </button>
        <span style={{ color: '#8a7f96' }}>
          queued: {state.pendingCrises.join(',') || '—'}
        </span>
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
        {[0, 3, 7, 30, 90, 180].map((d) => (
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
      <Row k="affection" v={`${st.affection.toFixed(1)} (tier ${affectionTier(st.affection)}/7)`} />
      <Row k="abandon." v={st.abandonment} />
      <Row k="intiThreat" v={st.intimacyThreat} />
      <Row
        k="→ security"
        v={`${st.security} (allow≤${allowedIntimacy(st.security)}, ${attachQuadrant(st.abandonment, st.intimacyThreat)})`}
      />
      <Row k="selfActual." v={st.selfActualization} />
      <Row
        k="attach"
        v={`crises ${state.crisesWeathered} · rate ${attachRate(state.relationTier, state.crisesWeathered).toFixed(2)}${state.relationTier < BALANCE.ATTACH_ONSET_TIER ? ' (잠복)' : ''}`}
      />
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

const numInput = {
  width: 44,
  border: '1px solid #6b6178',
  background: 'transparent',
  color: '#c9c0d4',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '2px 4px',
};

const rowWrap = {
  gridColumn: '1 / -1',
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap' as const,
  marginBottom: 4,
};

/** 지금 고른 값 — 축이 여러 줄이라 어느 게 켜져 있는지 보이지 않으면 못 쓴다.
 *  border 는 축약형으로 통째로 덮는다 — borderColor 만 얹으면 React 가
 *  "축약형과 개별 속성을 섞지 말라" 고 경고한다. */
const btnOn = { ...btnSmall, border: '2px solid #c9c0d4', color: '#f2ead8' };

/** 축 이름 — 버튼과 같은 줄에 두되 눌리는 것처럼 보이면 안 된다 */
const dim = { color: '#8a7f96', alignSelf: 'center' as const, minWidth: 52 };

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
