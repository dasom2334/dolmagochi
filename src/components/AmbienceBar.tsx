import { useState } from 'react';
import type { CSSProperties } from 'react';

import type { GameState, Season, TimeOfDay, WeatherKind } from '../game/types';
import { weathersOfSeason } from '../game/stateMachine';
import { resolveSeason, resolveTimeOfDay } from '../game/timeOfDay';
import { ALL_LAYERS, deriveLayers, type LayerId } from '../audio/layers';
import { dispatch, now, t } from '../store/appStore';
import { SYS, UI } from '../game/text';

/**
 * 분위기 바 (M22) — 씬 바로 아래 상시 노출되는 한 줄. 시간대·계절·날씨·소리를
 * 순환 버튼이 아니라 팝오버에서 직접 고른다(4~13개짜리 축에 순환은 맞지 않는다).
 * 집중 중에도 유지 — 화이트노이즈를 만지려고 설정 모달을 열지 않게 하는 것이 목적.
 * 팝오버는 오버레이가 아니라 인라인이라, 고르는 즉시 씬이 바뀌는 걸 보면서 고른다.
 */

type Panel = 'time' | 'season' | 'weather' | 'sound';

const chipStyle = (open: boolean, dim: boolean): CSSProperties => ({
  border: `2px solid ${open ? 'var(--text)' : 'var(--hint-dim)'}`,
  background: open ? 'var(--panel-3)' : 'transparent',
  color: dim ? 'var(--hint-dim)' : 'var(--ink-soft)',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '4px 8px',
  cursor: dim ? 'default' : 'pointer',
  whiteSpace: 'nowrap',
});

/** 팝오버 안의 선택지 한 칸 — 현재 값이면 테두리로 표시 */
function Option({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      className="hv"
      style={{
        border: `2px solid ${selected ? 'var(--text)' : 'var(--line)'}`,
        background: selected ? 'var(--panel-3)' : 'transparent',
        color: selected ? 'var(--text-hi)' : 'var(--ink-soft)',
        fontFamily: 'inherit',
        fontSize: 12,
        padding: '6px 4px',
        cursor: 'pointer',
      }}
      onClick={onPick}
    >
      {label}
    </button>
  );
}

/** 팝오버 제목 + 선택지 격자 — 칩의 기호(☀❄☂)만으로는 무엇의 축인지 모호하다 */
function OptionGrid({
  titleId,
  children,
}: {
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--hint)' }}>
        * {t(titleId)}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
        }}
      >
        {children}
      </div>
    </>
  );
}

const TIME_MODES = ['auto', 'day', 'twilight', 'night'] as const;
const SEASON_MODES = ['auto', 'spring', 'summer', 'autumn', 'winter'] as const;

/** 소리 믹서 — 지금 상황에서 울리는 레이어만 밝게, 나머지는 흐리게 */
function SoundMixer({ state }: { state: GameState }) {
  const nowMs = now();
  const active = new Set<LayerId>(
    deriveLayers({
      phase: state.phase === 'focus' ? 'focus' : 'room',
      actionId: state.phase === 'focus' ? state.selectedAction : null,
      ownedItems: Object.keys(state.items),
      weather: state.weather,
      umbrella: state.session.umbrella,
      season: resolveSeason(state.settings, nowMs),
      timeOfDay: resolveTimeOfDay(state.settings, nowMs),
    }),
  );
  const on = state.settings.noiseOn;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <button
        className="hv"
        style={{
          border: '2px solid var(--text)',
          background: on ? 'var(--panel-3)' : 'transparent',
          color: 'var(--text-hi)',
          fontFamily: 'inherit',
          fontSize: 12,
          padding: '6px 8px',
          cursor: 'pointer',
        }}
        onClick={() => dispatch({ type: 'SET_NOISE', on: !on })}
      >
        {t(UI.labels.noiseSetting)} — {t(on ? SYS.settings.on : SYS.settings.off)}
      </button>
      {on && (
        <>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--hint)' }}>
            {t(UI.ambience.mixerHint)}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 5,
            }}
          >
            {ALL_LAYERS.map((layer) => {
              const muted = state.settings.noiseMuted.includes(layer);
              const audible = active.has(layer);
              return (
                <button
                  key={layer}
                  className="hv"
                  style={{
                    border: `2px solid ${muted ? 'var(--line)' : 'var(--hint-dim)'}`,
                    background: 'transparent',
                    // 지금 안 울리는 레이어는 흐리게 — 겨울에 '여름 매미'가
                    // 켜져 보이는 혼란을 없앤다 (설정은 유지된다)
                    color: muted
                      ? 'var(--line)'
                      : audible
                        ? 'var(--text-hi)'
                        : 'var(--hint-dim)',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    padding: '5px 4px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    dispatch({ type: 'SET_NOISE_LAYER', layer, muted: !muted })
                  }
                >
                  {/* ✕ 꺼둠 / ● 지금 울림 / ○ 켜뒀지만 이 상황엔 없음 */}
                  {muted ? '✕' : audible ? '●' : '○'} {t(UI.noiseLayers[layer])}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function AmbienceBar({ state }: { state: GameState }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const nowMs = now();
  const season: Season = resolveSeason(state.settings, nowMs);
  const time: TimeOfDay = resolveTimeOfDay(state.settings, nowMs);
  // 날씨만 집중 중 잠금 — 우산 판정이 세션 시작에 확정되므로 (리듀서도 동일 게이트)
  const weatherLocked = state.phase !== 'rest' && state.phase !== 'actionSelect';
  const noiseCount = state.settings.noiseOn
    ? deriveLayers({
        phase: state.phase === 'focus' ? 'focus' : 'room',
        actionId: state.phase === 'focus' ? state.selectedAction : null,
        ownedItems: Object.keys(state.items),
        weather: state.weather,
        umbrella: state.session.umbrella,
        season,
        timeOfDay: time,
      }).filter((l) => !state.settings.noiseMuted.includes(l)).length
    : 0;

  const toggle = (p: Panel) => setOpen(open === p ? null : p);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          className="hv"
          style={chipStyle(open === 'time', false)}
          onClick={() => toggle('time')}
        >
          ☀ {t(UI.weatherUi.timeModes[time])}
        </button>
        <button
          className="hv"
          style={chipStyle(open === 'season', false)}
          onClick={() => toggle('season')}
        >
          ❄ {t(UI.weatherUi.seasonModes[season])}
        </button>
        <button
          className={weatherLocked ? undefined : 'hv'}
          disabled={weatherLocked}
          style={chipStyle(open === 'weather', weatherLocked)}
          onClick={() => toggle('weather')}
        >
          ☂ {t(UI.weatherUi.kinds[state.weather])}
        </button>
        <button
          className="hv"
          style={chipStyle(open === 'sound', false)}
          onClick={() => toggle('sound')}
        >
          ♪{' '}
          {state.settings.noiseOn ? noiseCount : t(SYS.settings.off)}
        </button>
      </div>

      {open && (
        <div
          style={{
            border: '2px solid var(--hint-dim)',
            background: 'var(--panel)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {open === 'time' && (
            <OptionGrid titleId={UI.weatherUi.timeSetting}>
              {TIME_MODES.map((m) => (
                <Option
                  key={m}
                  label={t(UI.weatherUi.timeModes[m])}
                  selected={state.settings.timeOfDay === m}
                  onPick={() => dispatch({ type: 'SET_TIME_OF_DAY', mode: m })}
                />
              ))}
            </OptionGrid>
          )}
          {open === 'season' && (
            <OptionGrid titleId={UI.weatherUi.seasonSetting}>
              {SEASON_MODES.map((m) => (
                <Option
                  key={m}
                  label={t(UI.weatherUi.seasonModes[m])}
                  selected={state.settings.season === m}
                  onPick={() =>
                    dispatch({ type: 'SET_SEASON', mode: m, nowMs: now() })
                  }
                />
              ))}
            </OptionGrid>
          )}
          {open === 'weather' && (
            <OptionGrid titleId={UI.weatherUi.now}>
              {weathersOfSeason(season).map((w: WeatherKind) => (
                <Option
                  key={w}
                  label={t(UI.weatherUi.kinds[w])}
                  selected={state.weather === w}
                  onPick={() =>
                    dispatch({ type: 'SET_WEATHER', weather: w, nowMs: now() })
                  }
                />
              ))}
            </OptionGrid>
          )}
          {open === 'sound' && <SoundMixer state={state} />}
        </div>
      )}
    </div>
  );
}
