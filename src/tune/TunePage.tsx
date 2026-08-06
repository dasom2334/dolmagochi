import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  LAYERS,
  MODEL_FIELDS,
  cloneModels,
  type Field,
  type Model,
  type Track,
} from '../audio/params';
import * as rig from './rig';

/**
 * 소리 튜닝 페이지 (개발 전용).
 *
 * 지금까지 소리 하나 고치려면 synths.ts를 고치고 → 새로고침 → 게임을 그 상황까지
 * 진행해야 했다(여름 밤에 산책 나가서 비 오게 하기). 여기서는 슬라이더를 움직이면
 * 즉시 들린다. 게임과 **같은 테이블·같은 엔진**을 쓰므로 두 벌로 갈라지지 않는다.
 *
 * 핵심은 두 가지다:
 *  - 동시 재생: 레이어 하나씩은 다 괜찮은데 겹치면 매미가 빗소리를 뚫고 나온다.
 *    레이어 간 상대 음량은 같이 듣지 않으면 맞출 방법이 없다.
 *  - 코드 복사: 귀로 찾은 숫자를 손으로 옮겨 적으면 반드시 하나 틀린다.
 */

type Bag = Record<string, number | string | boolean>;
const bag = (m: Model): Bag => m as unknown as Bag;

const TRACKS: readonly Track[] = ['칩튠', '노이즈', '녹음'];

const TRACK_NOTE: Record<Track, string> = {
  칩튠: '피치·리듬이 있어 녹음 루프가 금방 들키는 것들 — 합성이 이긴다',
  노이즈: '광대역이거나 상황에 연속 반응해야 하는 것들',
  녹음: '녹음으로 교체 예정. 여기 있는 합성본은 다운로드 전 fallback',
};

const SOAK_SEC = 25 * 60;

/**
 * 녹음 후보 (sound-candidates/, gitignore) — CC0, 출처는 폴더의 LICENSES.md.
 * 루프 둘을 동시에 켜면(예: 비 27초+45초) 서로소 길이 겹치기의 반복 은폐를
 * 그대로 들어볼 수 있다. 게인 기본값은 합성 기준선(roomBase ≈ −38dB) 근처로 낮게.
 */
interface SampleDef {
  id: string;
  name: string;
  urls: readonly string[];
  loop: boolean;
  gain: number;
  everyMinMs?: number;
  everyMaxMs?: number;
}

const SAMPLES: readonly SampleDef[] = [
  { id: 'recRain1', name: '비 1 (27초 루프)', urls: ['/sound-candidates/rain/1.ogg'], loop: true, gain: 0.12 },
  { id: 'recRain2', name: '비 2 (26초 루프)', urls: ['/sound-candidates/rain/2.ogg'], loop: true, gain: 0.12 },
  { id: 'recRain3', name: '비 3 (45초 루프)', urls: ['/sound-candidates/rain/3.ogg'], loop: true, gain: 0.12 },
  { id: 'recRain4', name: '비 4 (37.5초 루프)', urls: ['/sound-candidates/rain/4.ogg'], loop: true, gain: 0.12 },
  { id: 'recFire', name: '벽난로 (29초 루프)', urls: ['/sound-candidates/fire.wav'], loop: true, gain: 0.1 },
  {
    id: 'recBookflip',
    name: '책장 넘김 (13종 라운드로빈, 9~22초)',
    urls: Array.from({ length: 13 }, (_, i) => `/sound-candidates/bookflip/BookFlip${i + 1}.wav`),
    loop: false,
    gain: 0.15,
    everyMinMs: 9000,
    everyMaxMs: 22000,
  },
];

/** 녹음 후보 한 줄 — 토글 + 게인. 게인 변경은 재시작 없이 즉시 반영 */
function SampleRow({ s, stopTick }: { s: SampleDef; stopTick: number }) {
  const [on, setOn] = useState(false);
  const [gain, setGain] = useState(s.gain);
  useEffect(() => () => rig.stopSample(s.id), [s.id]);
  // 전부 정지 — 재생은 rig.stopAllSamples()가 이미 껐고, 여기선 UI만 동기화
  useEffect(() => {
    if (stopTick > 0) setOn(false);
  }, [stopTick]);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        style={{ ...btn(on), width: 26, flex: 'none' }}
        onClick={() => {
          if (on) rig.stopSample(s.id);
          else
            rig.playSample(s.id, s.urls, {
              loop: s.loop,
              gain,
              everyMinMs: s.everyMinMs,
              everyMaxMs: s.everyMaxMs,
            });
          setOn(!on);
        }}
      >
        {on ? '■' : '▶'}
      </button>
      <span
        style={{
          flex: 1,
          fontSize: 11,
          color: on ? 'var(--text-hi)' : 'var(--ink-soft)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {s.name}
      </span>
      <input
        type="range"
        min={0}
        max={0.6}
        step={0.005}
        value={gain}
        onChange={(e) => {
          const v = Number(e.target.value);
          setGain(v);
          rig.setSampleGain(s.id, v);
        }}
        style={{ width: 90, flex: 'none', accentColor: 'var(--accent)' }}
        title={`게인 ${gain.toFixed(3)}`}
      />
    </div>
  );
}

// ── 작은 조각들 ──────────────────────────────────────────────────

const panel: CSSProperties = {
  border: '2px solid var(--line)',
  background: 'var(--panel)',
  padding: '10px 12px',
};

const btn = (on: boolean): CSSProperties => ({
  border: `2px solid ${on ? 'var(--text)' : 'var(--hint-dim)'}`,
  background: on ? 'var(--panel-3)' : 'transparent',
  color: on ? 'var(--text-hi)' : 'var(--ink-soft)',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '4px 8px',
  cursor: 'pointer',
});

function NumField({
  f,
  value,
  onChange,
}: {
  f: Extract<Field, { kind: 'num' }>;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        color: 'var(--ink-soft)',
      }}
    >
      <span style={{ width: 148, flex: 'none' }}>{f.label}</span>
      <input
        type="range"
        min={f.min}
        max={f.max}
        step={f.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 80, accentColor: 'var(--accent)' }}
      />
      <input
        type="number"
        min={f.min}
        max={f.max}
        step={f.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 74,
          flex: 'none',
          fontFamily: 'inherit',
          fontSize: 11,
          background: 'var(--panel-3)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          padding: '2px 4px',
        }}
      />
      <span style={{ width: 26, flex: 'none', color: 'var(--hint)' }}>
        {f.unit ?? ''}
      </span>
    </label>
  );
}

/**
 * 출력 레벨 미터 — 레이어끼리 상대 음량을 맞추는 데 쓴다.
 * 페이지 전체가 60fps로 다시 그려지지 않게 상태를 여기에 가둔다.
 */
function Meter() {
  const [db, setDb] = useState(-90);
  useEffect(() => {
    const i = setInterval(() => setDb(rig.level()), 66);
    return () => clearInterval(i);
  }, []);
  const pct = Math.max(0, Math.min(1, (db + 60) / 60));
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--ink-soft)',
      }}
    >
      레벨
      <span
        data-testid="meter"
        data-db={db.toFixed(1)}
        style={{
          width: 90,
          height: 8,
          border: '1px solid var(--line)',
          background: 'var(--panel-3)',
          display: 'inline-block',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct * 100}%`,
            background: db > -3 ? 'var(--warn)' : 'var(--ok)',
          }}
        />
      </span>
      <span style={{ width: 52, color: 'var(--hint)' }}>
        {db <= -89 ? '무음' : `${db.toFixed(1)}dB`}
      </span>
    </span>
  );
}

function ModelPanel({
  model,
  index,
  onField,
}: {
  model: Model;
  index: number;
  onField: (key: string, v: number | string | boolean) => void;
}) {
  const fields = MODEL_FIELDS[model.kind];
  const b = bag(model);
  return (
    <div style={{ ...panel, background: 'var(--panel-2)' }}>
      <p
        style={{
          margin: '0 0 8px',
          fontSize: 11,
          color: 'var(--accent)',
        }}
      >
        * 모델 {index + 1} — {model.kind}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fields.map((f) => {
          if (f.kind === 'num')
            return (
              <NumField
                key={f.key}
                f={f}
                value={Number(b[f.key])}
                onChange={(v) => onField(f.key, v)}
              />
            );
          if (f.kind === 'bool')
            return (
              <label
                key={f.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--ink-soft)',
                }}
              >
                <span style={{ width: 148, flex: 'none' }}>{f.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(b[f.key])}
                  onChange={(e) => onField(f.key, e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
              </label>
            );
          return (
            <label
              key={f.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                color: 'var(--ink-soft)',
              }}
            >
              <span style={{ width: 148, flex: 'none' }}>{f.label}</span>
              <select
                value={String(b[f.key])}
                onChange={(e) => onField(f.key, e.target.value)}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 11,
                  background: 'var(--panel-3)',
                  color: 'var(--text)',
                  border: '1px solid var(--line)',
                  padding: '2px 4px',
                }}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── 코드 직렬화 ──────────────────────────────────────────────────

function objLit(o: Bag): string {
  const parts = Object.entries(o).map(
    ([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : String(v)}`,
  );
  return `{ ${parts.join(', ')} }`;
}

function modelsLit(models: readonly Model[]): string {
  const body = models.map((m) => `      ${objLit(bag(m))},`).join('\n');
  return `    models: [\n${body}\n    ],`;
}

// ── 페이지 ───────────────────────────────────────────────────────

export function TunePage() {
  const [params, setParams] = useState<Record<string, Model[]>>(() =>
    Object.fromEntries(LAYERS.map((l) => [l.id, cloneModels(l.models)])),
  );
  const [selected, setSelected] = useState<string>(LAYERS[0].id);
  const [playing, setPlaying] = useState<readonly string[]>([]);
  const [masterVol, setMasterVol] = useState(0.8);
  const [fogHz, setFogHz] = useState(20000);
  const [quantVol, setQuantVol] = useState(false);
  const [scaleRoot, setScaleRoot] = useState(261.63);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stopTick, setStopTick] = useState(0);

  // 재생 중인 레이어의 "현재 설정 서명" — 바뀐 것만 재시작한다
  const sigRef = useRef(new Map<string, string>());

  const def = LAYERS.find((l) => l.id === selected)!;
  const models = params[selected];

  // 슬라이더를 끌 때마다 재시작하면 딸깍거리므로 150ms 묶어서 반영
  useEffect(() => {
    const t = setTimeout(() => {
      const opts = { quantVol, scaleRoot };
      for (const id of Array.from(sigRef.current.keys())) {
        if (!playing.includes(id)) {
          rig.stop(id);
          sigRef.current.delete(id);
        }
      }
      for (const id of playing) {
        const sig = JSON.stringify([params[id], opts]);
        if (sigRef.current.get(id) === sig) continue;
        rig.play(id, params[id], opts);
        sigRef.current.set(id, sig);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [playing, params, quantVol, scaleRoot]);

  useEffect(() => rig.setMasterGain(masterVol), [masterVol]);
  useEffect(() => rig.setFogCutoff(fogHz), [fogHz]);
  useEffect(() => () => rig.stopAll(), []);

  // 장시간 재생 시계 — 30초 들어서 좋은 소리와 25분 들어도 괜찮은 소리는 다르다
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (playing.length === 0) setStartedAt(null);
    else setStartedAt((prev) => prev ?? Date.now());
  }, [playing]);
  useEffect(() => {
    const i = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const elapsed =
    startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000);

  const toggle = (id: string) =>
    setPlaying((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const solo = (id: string) => {
    setSelected(id);
    setPlaying([id]);
  };
  const setField = (
    modelIdx: number,
    key: string,
    value: number | string | boolean,
  ) =>
    setParams((p) => ({
      ...p,
      [selected]: p[selected].map((m, i) =>
        i === modelIdx ? ({ ...bag(m), [key]: value } as unknown as Model) : m,
      ),
    }));
  const reset = () =>
    setParams((p) => ({ ...p, [selected]: cloneModels(def.models) }));

  const code = useMemo(() => modelsLit(models), [models]);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setShowCode(true),
    );
  };

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: 16,
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 16, color: 'var(--text-hi)' }}>
          소리 튜닝
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--hint)' }}>
          * 개발 전용. 값은 src/audio/params.ts의 LAYERS에 있고, 여기서 찾은
          숫자를 [코드 복사]로 그대로 옮긴다.
        </p>
      </header>

      {/* 전역 */}
      <div style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <label style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          마스터{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVol}
            onChange={(e) => setMasterVol(Number(e.target.value))}
            style={{ accentColor: 'var(--accent)', verticalAlign: 'middle' }}
          />
        </label>
        <label style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          안개(전역 lowpass) {fogHz >= 20000 ? '없음' : `${fogHz}Hz`}{' '}
          <input
            type="range"
            min={300}
            max={20000}
            step={100}
            value={fogHz}
            onChange={(e) => setFogHz(Number(e.target.value))}
            style={{ accentColor: 'var(--accent)', verticalAlign: 'middle' }}
          />
        </label>
        <label style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          <input
            type="checkbox"
            checked={quantVol}
            onChange={(e) => setQuantVol(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />{' '}
          칩튠 4비트 볼륨 양자화
        </label>
        <label style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          음계 으뜸음{' '}
          <input
            type="number"
            min={100}
            max={900}
            step={0.01}
            value={scaleRoot}
            onChange={(e) => setScaleRoot(Number(e.target.value))}
            style={{
              width: 80,
              fontFamily: 'inherit',
              fontSize: 11,
              background: 'var(--panel-3)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
            }}
          />
          Hz
        </label>
        <Meter />
        <span
          style={{
            fontSize: 11,
            color: elapsed >= SOAK_SEC ? 'var(--ok)' : 'var(--hint)',
          }}
        >
          듣는 중 {mmss(elapsed)} / 소크 {mmss(SOAK_SEC)}
        </span>
        <button
          style={btn(false)}
          onClick={() => {
            rig.stopAll();
            rig.stopAllSamples();
            sigRef.current.clear();
            setPlaying([]);
            setStopTick((n) => n + 1);
          }}
        >
          전부 정지
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 320px) 1fr',
          gap: 12,
          alignItems: 'start',
        }}
      >
        {/* 레이어 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TRACKS.map((track) => {
            const list = LAYERS.filter((l) => l.track === track);
            return (
              <div key={track} style={panel}>
                <p
                  style={{
                    margin: '0 0 2px',
                    fontSize: 12,
                    color: 'var(--text-hi)',
                  }}
                >
                  {track} ({list.length})
                </p>
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 10,
                    color: 'var(--hint)',
                    lineHeight: 1.4,
                  }}
                >
                  {TRACK_NOTE[track]}
                </p>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                >
                  {list.map((l) => {
                    const on = playing.includes(l.id);
                    const cur = selected === l.id;
                    return (
                      <div
                        key={l.id}
                        style={{ display: 'flex', gap: 3, alignItems: 'center' }}
                      >
                        <button
                          style={{ ...btn(on), width: 26, flex: 'none' }}
                          onClick={() => toggle(l.id)}
                          title="겹쳐 듣기"
                        >
                          {on ? '■' : '▶'}
                        </button>
                        <button
                          style={{
                            ...btn(cur),
                            flex: 1,
                            textAlign: 'left',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() => setSelected(l.id)}
                        >
                          {l.name}
                          <span
                            style={{ color: 'var(--hint)', marginLeft: 6 }}
                          >
                            {l.status}
                          </span>
                        </button>
                        <button
                          style={{ ...btn(false), flex: 'none' }}
                          onClick={() => solo(l.id)}
                          title="이것만 듣기"
                        >
                          솔로
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 녹음 후보 */}
          <div style={panel}>
            <p
              style={{
                margin: '0 0 2px',
                fontSize: 12,
                color: 'var(--text-hi)',
              }}
            >
              녹음 후보 ({SAMPLES.length})
            </p>
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 10,
                color: 'var(--hint)',
                lineHeight: 1.4,
              }}
            >
              sound-candidates/ · CC0 · 슬라이더는 게인. 비 27초+45초를 같이
              켜면 서로소 겹치기를 들어볼 수 있다
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SAMPLES.map((s) => (
                <SampleRow key={s.id} s={s} stopTick={stopTick} />
              ))}
            </div>
          </div>
        </div>

        {/* 파라미터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={panel}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: 'var(--text-hi)',
                  }}
                >
                  {def.name}{' '}
                  <span style={{ fontSize: 11, color: 'var(--hint)' }}>
                    {def.id} · {def.track} · {def.status}
                  </span>
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 11,
                    color: 'var(--ink-soft)',
                  }}
                >
                  울리는 때: {def.trigger}
                </p>
                {def.note && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 11,
                      color: 'var(--hint)',
                      lineHeight: 1.5,
                    }}
                  >
                    * {def.note}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'start' }}>
                <button
                  style={btn(playing.includes(def.id))}
                  onClick={() => toggle(def.id)}
                >
                  {playing.includes(def.id) ? '정지' : '재생'}
                </button>
                <button style={btn(false)} onClick={reset}>
                  원래 값
                </button>
                <button style={btn(copied)} onClick={copy}>
                  {copied ? '복사됨' : '코드 복사'}
                </button>
                <button
                  style={btn(showCode)}
                  onClick={() => setShowCode((s) => !s)}
                >
                  코드 보기
                </button>
              </div>
            </div>
          </div>

          {showCode && (
            <textarea
              readOnly
              value={code}
              spellCheck={false}
              style={{
                ...panel,
                height: 180,
                fontFamily: 'inherit',
                fontSize: 11,
                color: 'var(--text)',
                background: 'var(--panel-3)',
                resize: 'vertical',
              }}
            />
          )}

          {models.map((m, i) => (
            <ModelPanel
              key={`${selected}:${i}`}
              model={m}
              index={i}
              onField={(k, v) => setField(i, k, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
