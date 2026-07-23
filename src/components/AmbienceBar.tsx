import { useState } from "react";
import type { CSSProperties } from "react";

import type { GameState, Season, TimeOfDay, WeatherKind } from "../game/types";
import { weathersOfSeason } from "../game/stateMachine";
import { resolveSeason, resolveTimeOfDay } from "../game/timeOfDay";
import { ALL_LAYERS, deriveLayers, type LayerId } from "../audio/layers";
import { dispatch, now, t } from "../store/appStore";
import { SYS, UI } from "../game/text";

/**
 * 분위기 바 (M22) — 씬 바로 아래 상시 노출되는 한 줄. 시간대·계절·날씨·소리를
 * 순환 버튼이 아니라 팝오버에서 직접 고른다(4~13개짜리 축에 순환은 맞지 않는다).
 * 집중 중에도 유지 — 화이트노이즈를 만지려고 설정 모달을 열지 않게 하는 것이 목적.
 * 팝오버는 오버레이가 아니라 인라인이라, 고르는 즉시 씬이 바뀌는 걸 보면서 고른다.
 */

type Panel = "time" | "season" | "weather" | "sound";

const chipStyle = (open: boolean, dim: boolean): CSSProperties => ({
  border: `2px solid ${open ? "var(--text)" : "var(--hint-dim)"}`,
  background: open ? "var(--panel-3)" : "transparent",
  color: dim ? "var(--hint-dim)" : "var(--ink-soft)",
  fontFamily: "inherit",
  fontSize: 11,
  padding: "4px 8px",
  cursor: dim ? "default" : "pointer",
  whiteSpace: "nowrap",
  // 기호와 글자를 세로 중앙으로 — 기호마다 자형 높이가 달라(∿는 특히 낮고
  // 납작하다) 베이스라인 정렬로는 줄이 안 맞는다.
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  lineHeight: 1,
});

/**
 * 소리 칩 아이콘 — 도트로 직접 그린 파형.
 *
 * 글자(♪·∿)로는 안 됐다. ♪는 '음악'으로 읽히는데 실제 내용은 빗소리·발소리이고,
 * ∿는 뜻은 맞지만 Galmuri11의 자형이 낮고 납작해(19px에서 잉크 7.8px) 옆 한글보다
 * 흐리게 보였다. 폰트 자형은 CSS로 못 고치므로 1px 격자에 직접 그린다 —
 * 씬 요소와 같은 도트 원칙이고, 굵기·크기를 정확히 통제할 수 있다.
 *
 * currentColor라 잠김(흐림)·열림 상태의 칩 색을 그대로 따라간다.
 */
// 12px에 두 주기 — 한 주기만 그리면 완만한 곡선이라 물결이 아니라 갈고리로
// 읽힌다. 진폭은 좁게(0~4) 두고 주기를 촘촘히 해야 파형으로 보인다.
const WAVE_Y = [2, 0, 0, 2, 4, 4, 2, 0, 0, 2, 4, 4];

function WaveIcon() {
  return (
    <svg
      width={12}
      height={6}
      viewBox="0 0 12 6"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      {WAVE_Y.map((y, x) => (
        <rect key={x} x={x} y={y} width={1} height={2} fill="currentColor" />
      ))}
    </svg>
  );
}

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
        border: `2px solid ${selected ? "var(--text)" : "var(--line)"}`,
        background: selected ? "var(--panel-3)" : "transparent",
        color: selected ? "var(--text-hi)" : "var(--ink-soft)",
        fontFamily: "inherit",
        fontSize: 12,
        padding: "6px 4px",
        cursor: "pointer",
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
      <p style={{ margin: 0, fontSize: 11, color: "var(--hint)" }}>
        * {t(titleId)}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
        }}
      >
        {children}
      </div>
    </>
  );
}

const TIME_MODES = ["auto", "day", "twilight", "night"] as const;
const SEASON_MODES = ["auto", "spring", "summer", "autumn", "winter"] as const;

/** 소리 믹서 — 지금 상황에서 울리는 레이어만 밝게, 나머지는 흐리게 */
function SoundMixer({ state }: { state: GameState }) {
  const nowMs = now();
  const active = new Set<LayerId>(
    deriveLayers({
      phase: state.phase === "focus" ? "focus" : "room",
      actionId: state.phase === "focus" ? state.selectedAction : null,
      ownedItems: Object.keys(state.items),
      weather: state.weather,
      umbrella: state.session.umbrella,
      season: resolveSeason(state.settings, nowMs),
      timeOfDay: resolveTimeOfDay(state.settings, nowMs),
    }),
  );
  const on = state.settings.noiseOn;
  const custom = state.settings.noiseMode === "custom";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <button
        className="hv"
        style={{
          border: "2px solid var(--text)",
          background: on ? "var(--panel-3)" : "transparent",
          color: "var(--text-hi)",
          fontFamily: "inherit",
          fontSize: 12,
          padding: "6px 8px",
          cursor: "pointer",
        }}
        onClick={() => dispatch({ type: "SET_NOISE", on: !on })}
      >
        {t(UI.labels.noiseSetting)} —{" "}
        {t(on ? SYS.settings.on : SYS.settings.off)}
      </button>
      {on && (
        <>
          {/* 모드 전환 (M22 → M26) — 한 줄 문장 + [바꾸기]였을 땐 컨트롤로 보이지도,
              모드가 둘이라는 것도 알 수 없었다. 상점 탭과 같은 세그먼트로 바꿔
              둘 다 늘 보이게 하고, 아래 설명 줄이 '지금 격자가 무슨 뜻인지'를 말한다. */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["auto", "custom"] as const).map((m) => {
              const sel = custom === (m === "custom");
              return (
                <button
                  key={m}
                  className="hv"
                  style={{
                    flex: 1,
                    border: `2px solid ${sel ? "var(--text)" : "var(--line)"}`,
                    background: sel ? "var(--text)" : "transparent",
                    color: sel ? "var(--panel)" : "var(--ink-soft)",
                    fontFamily: "inherit",
                    fontSize: 11,
                    padding: "3px 6px",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    dispatch({ type: "SET_NOISE_MODE", mode: m, nowMs: now() })
                  }
                >
                  {t(
                    m === "custom"
                      ? UI.ambience.modeCustomShort
                      : UI.ambience.modeAutoShort,
                  )}
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--hint)",
              marginTop: -2,
            }}
          >
            {t(custom ? UI.ambience.modeCustom : UI.ambience.modeAuto)}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 5,
            }}
          >
            {ALL_LAYERS.map((layer) => {
              // 커스텀은 '켜 둔 것' 목록이라 의미가 반대다
              const muted = custom
                ? !state.settings.noiseCustom.includes(layer)
                : state.settings.noiseMuted.includes(layer);
              // 커스텀은 상황을 보지 않는다 — 켜 두면 겨울에도 매미가 운다
              const audible = custom ? !muted : active.has(layer);
              return (
                <button
                  key={layer}
                  className="hv"
                  style={{
                    border: `2px solid ${muted ? "var(--line)" : "var(--hint-dim)"}`,
                    background: "transparent",
                    // 지금 안 울리는 레이어는 흐리게 — 겨울에 '여름 매미'가
                    // 켜져 보이는 혼란을 없앤다 (설정은 유지된다)
                    color: muted
                      ? "var(--line)"
                      : audible
                        ? "var(--text-hi)"
                        : "var(--hint-dim)",
                    fontFamily: "inherit",
                    fontSize: 11,
                    padding: "5px 4px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    dispatch({ type: "SET_NOISE_LAYER", layer, muted: !muted })
                  }
                >
                  {/* ✕ 꺼둠 / ● 지금 울림 / ○ 켜뒀지만 이 상황엔 없음(자동만) */}
                  {muted ? "✕" : audible ? "●" : "○"} {t(UI.noiseLayers[layer])}
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
  // 날씨·계절은 집중 중 잠금 — 우산 판정이 세션 시작에 확정되는데, 계절 변경도
  // 무효 날씨를 재추첨하며 날씨를 갈아끼운다 (리듀서도 두 이벤트에 같은 게이트).
  const outsideLocked =
    state.phase !== "rest" && state.phase !== "actionSelect";
  const custom = state.settings.noiseMode === "custom";
  const noiseCount = !state.settings.noiseOn
    ? 0
    : custom
      ? state.settings.noiseCustom.length
      : deriveLayers({
          phase: state.phase === "focus" ? "focus" : "room",
          actionId: state.phase === "focus" ? state.selectedAction : null,
          ownedItems: Object.keys(state.items),
          weather: state.weather,
          umbrella: state.session.umbrella,
          season,
          timeOfDay: time,
        }).filter((l) => !state.settings.noiseMuted.includes(l)).length;

  const toggle = (p: Panel) => setOpen(open === p ? null : p);
  // 잠긴 축의 패널은 열린 채로 두지 않는다: actionSelect에서 날씨를 펼쳐 두고
  // 집중을 시작하면, 칩만 흐려지고 선택지는 멀쩡해 보이는 채로 눌러도 아무 일이
  // 없었다 (리듀서가 조용히 거절). 렌더 단계에서 접는다 — 상태를 건드리지 않아
  // 세션이 끝나면 그대로 다시 펼쳐진다.
  const panel =
    outsideLocked && (open === "weather" || open === "season") ? null : open;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          className="hv"
          style={chipStyle(open === "time", false)}
          onClick={() => toggle("time")}
        >
          ☀ {t(UI.weatherUi.timeModes[time])}
        </button>
        <button
          className={outsideLocked ? undefined : "hv"}
          disabled={outsideLocked}
          style={chipStyle(panel === "season", outsideLocked)}
          onClick={() => toggle("season")}
        >
          ❄ {t(UI.weatherUi.seasonModes[season])}
        </button>
        <button
          className={outsideLocked ? undefined : "hv"}
          disabled={outsideLocked}
          style={chipStyle(panel === "weather", outsideLocked)}
          onClick={() => toggle("weather")}
        >
          ☂ {t(UI.weatherUi.kinds[state.weather])}
        </button>
        <button
          className="hv"
          style={chipStyle(open === "sound", false)}
          onClick={() => toggle("sound")}
        >
          <WaveIcon />
          {state.settings.noiseOn ? noiseCount : t(SYS.settings.off)}
        </button>
      </div>

      {panel && (
        <div
          style={{
            border: "2px solid var(--hint-dim)",
            background: "var(--panel)",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {panel === "time" && (
            <OptionGrid titleId={UI.weatherUi.timeSetting}>
              {TIME_MODES.map((m) => (
                <Option
                  key={m}
                  label={t(UI.weatherUi.timeModes[m])}
                  selected={state.settings.timeOfDay === m}
                  onPick={() =>
                    dispatch({ type: "SET_TIME_OF_DAY", mode: m, nowMs: now() })
                  }
                />
              ))}
            </OptionGrid>
          )}
          {panel === "season" && (
            <OptionGrid titleId={UI.weatherUi.seasonSetting}>
              {SEASON_MODES.map((m) => (
                <Option
                  key={m}
                  label={t(UI.weatherUi.seasonModes[m])}
                  selected={state.settings.season === m}
                  onPick={() =>
                    dispatch({ type: "SET_SEASON", mode: m, nowMs: now() })
                  }
                />
              ))}
            </OptionGrid>
          )}
          {panel === "weather" && (
            <OptionGrid titleId={UI.weatherUi.now}>
              {weathersOfSeason(season).map((w: WeatherKind) => (
                <Option
                  key={w}
                  label={t(UI.weatherUi.kinds[w])}
                  selected={state.weather === w}
                  onPick={() =>
                    dispatch({ type: "SET_WEATHER", weather: w, nowMs: now() })
                  }
                />
              ))}
            </OptionGrid>
          )}
          {panel === "sound" && <SoundMixer state={state} />}
        </div>
      )}
    </div>
  );
}
