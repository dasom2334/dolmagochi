import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { deriveLayers } from '../audio/layers';
import {
  LAYERS,
  MODEL_FIELDS,
  cloneModels,
  findLayer,
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
 * 게임 미러 — 지금 돌마고치가 실제로 내는 소리를 그대로 재현한다.
 * 손으로 짠 조합이 아니라 게임의 deriveLayers 자체를 부르므로, 게임과
 * 어긋날 수가 없다. 축은 게임과 동일: 휴식/행동 × 시간대 × 계절 × 날씨
 * × 우산 × 보유 아이템.
 */
const MIRROR_ACTIONS: readonly { id: string | null; name: string }[] = [
  { id: null, name: '휴식' },
  { id: 'lie', name: '누워있기' },
  { id: 'nurse', name: '병간호' },
  { id: 'read', name: '책읽기' },
  { id: 'sun', name: '햇빛쬐기' },
  { id: 'walk', name: '산책' },
  { id: 'free', name: '자유행동' },
  { id: 'cook', name: '요리' },
  { id: 'chore', name: '집안일' },
];
const MIRROR_TIMES = [
  ['day', '한낮'],
  ['twilight', '해질녘'],
  ['night', '밤'],
] as const;
const MIRROR_SEASONS = [
  ['spring', '봄'],
  ['summer', '여름'],
  ['autumn', '가을'],
  ['winter', '겨울'],
] as const;
// 소리 모델이 실제로 구분하는 날씨만 — 나머지 종류는 소리에서 clear와 같다
const MIRROR_WEATHERS = [
  ['clear', '맑음'],
  ['rain', '비'],
  ['downpour', '장대비'],
  ['snow', '눈'],
] as const;
const MIRROR_ITEMS = [
  ['fireplace', '벽난로'],
  ['blanket', '담요'],
  ['desk', '책상'],
] as const;

/** 녹음 우선 — 파생된 합성 레이어를 확보된 녹음 후보로 대치 */
const REC_SUB: Record<string, readonly string[]> = {
  rainSoft: ['recRain1', 'recRain3'], // 서로소 겹치기 (27+45초)
  rainHard: ['recRain2', 'recRain4'],
  fireplace: ['recFire'],
  pageTurn: ['recBookflip'],
};

interface MirrorState {
  action: string | null;
  time: 'day' | 'twilight' | 'night';
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weather: 'clear' | 'rain' | 'downpour' | 'snow';
  umbrella: boolean;
  owned: readonly string[];
  recFirst: boolean;
}

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

/** 녹음 후보 한 줄 — 토글 + 게인. 재생 상태는 부모가 소유(게임 미러가 제어) */
function SampleRow({
  s,
  on,
  onToggle,
}: {
  s: SampleDef;
  on: boolean;
  onToggle: () => void;
}) {
  const [gain, setGain] = useState(s.gain);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        style={{ ...btn(on), width: 26, flex: 'none' }}
        onClick={onToggle}
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
  muted,
  onField,
  onMute,
  onSolo,
}: {
  model: Model;
  index: number;
  muted: boolean;
  onField: (key: string, v: number | string | boolean) => void;
  onMute: () => void;
  onSolo: () => void;
}) {
  const fields = MODEL_FIELDS[model.kind];
  const b = bag(model);
  return (
    <div
      style={{
        ...panel,
        background: 'var(--panel-2)',
        opacity: muted ? 0.45 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '0 0 8px',
        }}
      >
        <p style={{ margin: 0, fontSize: 11, color: 'var(--accent)' }}>
          * 모델 {index + 1} — {model.kind}
          {muted && <span style={{ color: 'var(--hint)' }}> (꺼짐)</span>}
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btn(false)} onClick={onSolo} title="이 모델만 듣기">
            이것만
          </button>
          <button style={btn(muted)} onClick={onMute}>
            {muted ? '켜기' : '끄기'}
          </button>
        </div>
      </div>
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
  const [samplePlaying, setSamplePlaying] = useState<readonly string[]>([]);
  // 모델별 끄기 — 키는 `${layerId}:${modelIndex}`. 여러 모델이 합쳐진 레이어에서
  // 한 모델만 골라 듣기 위한 것 (재생에도 반영된다)
  const [mutedModels, setMutedModels] = useState<Record<string, boolean>>({});
  const [mirror, setMirror] = useState<MirrorState>({
    action: null,
    time: 'day',
    season: 'summer',
    weather: 'clear',
    umbrella: false,
    owned: ['fireplace', 'blanket', 'desk'],
    recFirst: true,
  });

  // 녹음 후보 재생 diff — 목록에 맞춰 시작/정지
  const sampleStarted = useRef(new Set<string>());
  useEffect(() => {
    for (const id of Array.from(sampleStarted.current)) {
      if (!samplePlaying.includes(id)) {
        rig.stopSample(id);
        sampleStarted.current.delete(id);
      }
    }
    for (const id of samplePlaying) {
      if (sampleStarted.current.has(id)) continue;
      const s = SAMPLES.find((x) => x.id === id);
      if (!s) continue;
      rig.playSample(id, s.urls, {
        loop: s.loop,
        gain: s.gain,
        everyMinMs: s.everyMinMs,
        everyMaxMs: s.everyMaxMs,
      });
      sampleStarted.current.add(id);
    }
  }, [samplePlaying]);

  /**
   * 게임 미러 적용 — deriveLayers 결과로 재생 목록을 교체 (녹음 우선 대치 포함).
   * ref 경유 — 렌더 클로저의 mirror를 쓰면 연타 시 이전 클릭을 되돌린다.
   */
  const mirrorRef = useRef(mirror);
  const applyMirror = (patch: Partial<MirrorState>) => {
    const m = { ...mirrorRef.current, ...patch };
    mirrorRef.current = m;
    setMirror(m);
    const ids: string[] = deriveLayers({
      phase: m.action ? 'focus' : 'room',
      actionId: m.action,
      ownedItems: m.owned,
      weather: m.weather,
      umbrella: m.umbrella,
      season: m.season,
      timeOfDay: m.time,
    });
    const recs: string[] = [];
    const synth = m.recFirst
      ? ids.filter((id) => {
          const sub = REC_SUB[id];
          if (sub) {
            recs.push(...sub);
            return false;
          }
          return true;
        })
      : ids;
    setPlaying(synth);
    setSamplePlaying(recs);
  };

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
        const audible = params[id].filter((_, i) => !mutedModels[`${id}:${i}`]);
        const sig = JSON.stringify([audible, opts]);
        if (sigRef.current.get(id) === sig) continue;
        rig.play(id, audible, opts);
        sigRef.current.set(id, sig);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [playing, params, quantVol, scaleRoot, mutedModels]);

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
            setPlaying([]);
            setSamplePlaying([]);
          }}
        >
          전부 정지
        </button>
      </div>

      {/* 게임 미러 — deriveLayers를 그대로 불러 지금 게임과 동일한 소리를 낸다 */}
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--hint)' }}>
          * 게임 미러 — 아래 상황을 고르면 게임의 deriveLayers가 정한 조합이
          그대로 재생된다. 녹음 우선이면 확보된 에셋(비·벽난로·책장)이 합성을
          대신한다.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--hint)', width: 40, flex: 'none' }}>상황</span>
          {MIRROR_ACTIONS.map((a) => (
            <button
              key={a.name}
              style={btn(mirror.action === a.id)}
              onClick={() => applyMirror({ action: a.id })}
            >
              {a.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--hint)', width: 40, flex: 'none' }}>시간</span>
          {MIRROR_TIMES.map(([id, name]) => (
            <button key={id} style={btn(mirror.time === id)} onClick={() => applyMirror({ time: id })}>
              {name}
            </button>
          ))}
          <span style={{ fontSize: 11, color: 'var(--hint)', width: 40, flex: 'none', marginLeft: 8 }}>계절</span>
          {MIRROR_SEASONS.map(([id, name]) => (
            <button key={id} style={btn(mirror.season === id)} onClick={() => applyMirror({ season: id })}>
              {name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--hint)', width: 40, flex: 'none' }}>날씨</span>
          {MIRROR_WEATHERS.map(([id, name]) => (
            <button key={id} style={btn(mirror.weather === id)} onClick={() => applyMirror({ weather: id })}>
              {name}
            </button>
          ))}
          <button
            style={btn(mirror.umbrella)}
            onClick={() => applyMirror({ umbrella: !mirror.umbrella })}
            title="비 오는 산책에서만 소리가 달라진다"
          >
            우산
          </button>
          <span style={{ fontSize: 11, color: 'var(--hint)', width: 40, flex: 'none', marginLeft: 8 }}>보유</span>
          {MIRROR_ITEMS.map(([id, name]) => (
            <button
              key={id}
              style={btn(mirror.owned.includes(id))}
              onClick={() =>
                applyMirror({
                  owned: mirror.owned.includes(id)
                    ? mirror.owned.filter((x) => x !== id)
                    : [...mirror.owned, id],
                })
              }
            >
              {name}
            </button>
          ))}
          <button
            style={{ ...btn(mirror.recFirst), marginLeft: 8 }}
            onClick={() => applyMirror({ recFirst: !mirror.recFirst })}
          >
            녹음 우선
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-soft)' }}>
          ▶{' '}
          {playing.length + samplePlaying.length === 0
            ? '(재생 없음 — 상황 버튼을 누르면 시작)'
            : [
                ...playing.map((id) => findLayer(id)?.name ?? id),
                ...samplePlaying.map(
                  (id) => `🎙 ${SAMPLES.find((s) => s.id === id)?.name ?? id}`,
                ),
              ].join(' · ')}
        </p>
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
                <SampleRow
                  key={s.id}
                  s={s}
                  on={samplePlaying.includes(s.id)}
                  onToggle={() =>
                    setSamplePlaying((p) =>
                      p.includes(s.id)
                        ? p.filter((x) => x !== s.id)
                        : [...p, s.id],
                    )
                  }
                />
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
              muted={Boolean(mutedModels[`${selected}:${i}`])}
              onField={(k, v) => setField(i, k, v)}
              onMute={() =>
                setMutedModels((mm) => ({
                  ...mm,
                  [`${selected}:${i}`]: !mm[`${selected}:${i}`],
                }))
              }
              onSolo={() =>
                setMutedModels((mm) => {
                  const next = { ...mm };
                  models.forEach((_, j) => {
                    next[`${selected}:${j}`] = j !== i;
                  });
                  return next;
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
