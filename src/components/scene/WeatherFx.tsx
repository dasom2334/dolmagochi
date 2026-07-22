/**
 * 날씨 오버레이 (M12) — 도트 감성의 비/눈 입자. 씬 요소이므로 테마 미적용(B23),
 * 추후 도트 에셋 교체를 위해 개별 컴포넌트로 분리. image-rendering 유지.
 * 입자 배치는 인덱스 기반 유사난수 — 리렌더에도 흔들리지 않는다.
 */
export function WeatherFx({
  kind,
}: {
  kind: 'rain' | 'downpour' | 'snow' | 'petals' | 'grass' | 'leaves';
}) {
  const drifting =
    kind === 'snow' || kind === 'petals' || kind === 'grass' || kind === 'leaves';
  const count = kind === 'downpour' ? 26 : kind === 'rain' ? 14 : 18;
  const drops = Array.from({ length: count }, (_, i) => {
    const left = ((i * 37) % 100) + ((i * 13) % 7) / 10;
    const delay = ((i * 53) % 20) / 10;
    const dur = drifting
      ? 4 + ((i * 29) % 30) / 10
      : kind === 'downpour'
        ? 0.55 + ((i * 17) % 10) / 40
        : 0.9 + ((i * 23) % 12) / 30;
    return { left, delay, dur, key: i };
  });
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {drops.map((d) =>
        drifting ? (
          <div
            key={d.key}
            style={{
              position: 'absolute',
              left: `${d.left}%`,
              top: -4,
              width: kind === 'leaves' ? 4 : 3,
              height: kind === 'leaves' ? 2 : 3,
              background:
                kind === 'petals'
                  ? 'rgba(240,182,200,0.85)' // 꽃잎 — 봄
                  : kind === 'grass'
                    ? 'rgba(150,196,120,0.85)' // 풀잎 — 여름
                    : kind === 'leaves'
                      ? 'rgba(200,134,63,0.85)' // 낙엽 — 가을
                      : 'rgba(232,238,244,0.85)', // 눈 — 겨울
              animation: `snowFall ${d.dur}s linear ${d.delay}s infinite`,
            }}
          />
        ) : (
          <div
            key={d.key}
            style={{
              position: 'absolute',
              left: `${d.left}%`,
              top: -12,
              width: kind === 'downpour' ? 2 : 1,
              height: kind === 'downpour' ? 11 : 8,
              background: 'rgba(168,190,222,0.55)',
              animation: `rainFall ${d.dur}s linear ${d.delay}s infinite`,
            }}
          />
        ),
      )}
    </div>
  );
}

/** 시간대 틴트 (M12) — 씬 위에 얇게 얹는 밤/황혼 빛. 한낮은 없음 */
export function TimeTint({ tod }: { tod: 'day' | 'twilight' | 'night' }) {
  if (tod === 'day') return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          tod === 'night' ? 'rgba(16,20,52,0.34)' : 'rgba(255,138,58,0.12)',
      }}
    />
  );
}
