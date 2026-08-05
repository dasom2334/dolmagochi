// 심은 나무 — 3차 성장 6단계 (기획서 §155·§180, src/game/tree.ts treeStage 0~5)
//   0 개화 묘목 / 1 열매 / 2 각성기 / 3 무성 / 4 울창 / 5 성목
//
// 자리는 기존 창밖 나무(treeV1)와 **같은 자리**(줄기 x35, 땅 y40)다 — 기획서 §180
// "집 바로 옆(= 묻은 자리)", 그리고 "거실 창을 가리는 면적이 성장 진행도".
// 그래서 5(성목)는 새로 그리지 않는다: **지금의 그 창밖 나무(treeV1)가 다 자란
// 모습이다.** 여기는 0~4 만 만든다.
//
// 잎은 --t 슬롯이라 계절 팔레트를 그대로 탄다(봄=꽃분홍, 가을=단풍). 겨울엔
// 렌더가 leaves 를 숨기고 줄기만 남긴다 — v1 과 같은 규칙.
// 심은 나무에 시듦 축은 없다 — 시듦은 심기 **전** 돌 위 새싹의 것이고(§179),
// 심은 뒤는 계절 변형이 그 자리를 맡는다(§180 "계절 변형이 달력제의 시각 증거").
//
// (generate.js 의 h2 를 안 쓰는 이유: generate 가 이 파일을 임포트하므로 순환이 된다.
//  같은 모양의 지역 해시를 둔다.)
const hh = (x, y, s) => {
  let n = x * 374761393 + y * 668265263 + s * 974634629;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) % 100;
};

const GROUND = 40, CX = 35;
// [줄기 꼭대기 y, 줄기 폭, 수관 로브들 [cx, cy, rx, ry], 장식]
// 로브 중심 y 는 서로 어긋난다 — 같은 높이에 몰리면 음영이 가로 줄무늬가 된다(v2 교훈).
// 창 개구부는 y4~34 — 땅(y40)은 벽 뒤라 **키 6 이하는 통째로 안 보인다**.
// 어린 단계도 수관이 y34 위로 올라오게 잡는다. "창을 가리는 면적이 성장 진행도"
// (§180)는 수관이 창 위쪽을 얼마나 먹느냐로 만든다.
const STAGES = [
  { top: 27, w: 1, lobes: [[35, 27, 3, 2.2]], deco: 'bloom' },
  { top: 25, w: 1, lobes: [[35, 24.5, 4, 2.6]], deco: 'fruit' },
  { top: 22, w: 2, lobes: [[35, 21.5, 5, 3], [32, 24, 3.4, 2.2]], deco: 'awaken' },
  { top: 18, w: 2, lobes: [[35, 17.5, 6, 3.6], [31, 20.5, 4, 2.6], [39.5, 20, 4, 2.4]] },
  { top: 11, w: 3, lobes: [[35, 10.5, 7, 4.2], [29.5, 14.5, 5, 3], [41, 13.5, 5, 3], [35, 16.5, 6, 3.2]] },
];

/** 0~4 단계의 {trunk, leaves}. 5 는 호출부가 treeV1 을 쓴다. */
export function stagedTree(s) {
  const st = STAGES[s];
  if (!st) return null;
  const trunk = [], leaves = [];
  for (let y = st.top; y <= GROUND; y++) {
    const w = y > GROUND - 3 ? st.w + 1 : st.w;            // 밑동이 살짝 벌어진다
    const x0 = CX - (w >> 1);
    trunk.push([x0, y, w, 1, '--t3']);
    if (w > 1) trunk.push([x0 + w - 1, y, 1, 1, '--t4']);
  }
  // 수관 — 로브 합집합. 지터로 등고선을 흔든다(매끈한 타원 = 스티커)
  const cell = new Map();
  for (const [cx, cy, rx, ry] of st.lobes)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (hh(x, y, 7) / 100 - 0.5) * 0.14;
        if (d <= 1) cell.set(y * 1000 + x, 1);
      }
  for (const [k] of cell) {
    const y = Math.floor(k / 1000), x = k % 1000;
    let slot = '--t1';
    if (!cell.has((y - 1) * 1000 + x)) slot = '--t2';       // 위가 트인 잎 = 하늘빛
    else if (!cell.has((y + 1) * 1000 + x)) slot = '--t0';  // 아래 가장자리 = 그늘
    else if (hh(x, y, 9) < 8) slot = '--t0';                // 속 그늘 스펙클
    leaves.push([x, y, 1, 1, slot]);
  }
  // 장식 — 단계 서사. 계절 슬롯을 안 타는 고정색(꽃·열매는 계절과 무관하게 그 색이다)
  if (st.deco === 'bloom')
    for (const [k] of cell) {
      const y = Math.floor(k / 1000), x = k % 1000;
      if (hh(x, y, 21) < 20) leaves.push([x, y, 1, 1, '#e8b8ce']);
    }
  if (st.deco === 'fruit' || st.deco === 'awaken') {
    let n = 0;
    const max = st.deco === 'fruit' ? 2 : 3;
    for (const [k] of cell) {
      const y = Math.floor(k / 1000), x = k % 1000;
      if (n < max && hh(x, y, 22) < 7 && cell.has((y + 1) * 1000 + x)) {
        leaves.push([x, y, 1, 1, '#c9473f']); n++;
      }
    }
  }
  if (st.deco === 'awaken')                                 // 씨앗의 각성 — 밝은 한 점
    leaves.push([CX + 1, Math.round(st.lobes[0][1]), 1, 1, '#ffd76a']);
  return { trunk, leaves };
}

export const STAGE_IDS = [0, 1, 2, 3, 4, 5];
