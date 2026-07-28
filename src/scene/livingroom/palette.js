// 자동 생성(tools/export_palette.py) 후 **여기가 진실의 원천**이 된다. 직접 편집할 것.
// 슬롯 이름 → 색. 지오메트리는 슬롯 이름만 알고 색은 모른다(팔레트 교체로 48조합 표현).

import { PROP_SLOTS } from './props-room.js';

/** 시간·계절·날씨와 무관한 기본값.
 *
 *  주의: `...PROP_SLOTS` 가 **맨 앞**이라 아래 정의가 같은 이름을 쓰면 조용히 이긴다.
 *  실제로 담요를 --fb*(fabric) 로 잡았다가 바닥(floor board) --fb* 와 부딪혀,
 *  담요가 내내 바닥 색으로 그려졌다. 에러도 경고도 없어서 찾는 데 오래 걸렸다.
 *  → 아래 assertPropSlots() 가 겹치면 즉시 던진다. */
export const BASE = {
    ...PROP_SLOTS,
    "--page-bg": "#241627",
    // 낮 하늘 = 침실 day.png 실측 10단. 이전의 진한 azure(#1e5c9e)보다 부드러운
    // 하늘색 — 무테·두꺼운 색면 스타일 목표에 맞다. k0(천정)→k9(지평선).
    "--k0": "#5aa3ee",
    "--k1": "#6fbaf5",
    "--k2": "#7bc1f6",
    "--k3": "#87c9f8",
    "--k4": "#99d3f9",
    "--k5": "#a3d9fb",
    "--k6": "#afddfc",
    "--k7": "#bde4fc",
    "--k8": "#ccebfd",
    "--k9": "#d9f1fe",
    "--sun0": "#ffdf8f",
    "--sun1": "#fff6d8",
    "--h0": "#2e5a34",
    "--h1": "#3d7040",
    "--h2": "#58904f",
    "--h3": "#7fae63",
    "--t0": "#3f5c30",
    "--t1": "#567a3c",
    "--t2": "#6f8a44",
    "--t3": "#7a5238",
    "--t4": "#8a6242",
    "--moon": "#e9e6da",
    "--moon-cr": "#c8c3b2",
    "--star": "#e8ecff",
    "--rain": "#c9d4ea",
    "--snow-p": "#f4f6fb",
    "--cloud-0": "#c6cedb",
    "--cloud-1": "#9aa4b5",
    "--cloud-2": "#7e8899",
    "--fb0": "#4a3542",
    "--fb1": "#58424f",
    "--fb2": "#634b59",
    "--fbl": "#392933",
    "--fbh": "#775c71",
    "--fbk": "#2b1e27",
    "--o0": "#35333c",
    "--o1": "#4e4d54",
    "--o2": "#64655f",
    "--o3": "#797b6f",
    "--o4": "#8b8e7e",
    "--wl": "#fff0c8",
    "--wl-a": ".20",
    "--ml": "#a8bcf0",
    "--ml-a": ".16",
    "--fl": "#ffa04a",
    "--fl-a": ".10",
    "--cl": "#ffcf8a",
    "--cl-a": ".08",
    "--ll": "#ffd9a0",
    "--ll-a": ".10"
  };

export const TIME = {
  // 구름은 하늘 색을 따라가야 한다. BASE 에만 두면 노을·밤에도 회청색으로 남아
  // 배경과 따로 논다 — 실제로 그렇게 보였다.
  "sunset": {"--cloud-0": "#f2b489", "--cloud-1": "#cc7d86", "--cloud-2": "#9c5670",
             // 노을 하늘 = 침실 sunset.png 실측. 이전엔 지평선이 노랑주황(#fd9641)
             // 이었는데 레퍼런스는 더 **붉다**(자홍 천정 → 붉은주황 지평선). 해 후광의
             // 노랑은 halo-sun 이 따로 얹으므로 하늘은 붉게 둔다.
             "--k0": "#9d295b", "--k1": "#a83054", "--k2": "#b63150", "--k3": "#c1354e", "--k4": "#cb3b4a", "--k5": "#d24149", "--k6": "#da4845", "--k7": "#e35040", "--k8": "#ea583b", "--k9": "#ef6036", "--sun0": "#fca143", "--sun1": "#fdce8a", "--wl": "#ff9a4a", "--wl-a": ".30", "--fl-a": ".16", "--cl-a": ".12", "--ll-a": ".15", "--h0": "#45233f", "--h1": "#6d3760", "--h2": "#8e3f60", "--h3": "#a6496f", "--t0": "#33401f", "--t1": "#4a5726", "--t2": "#6b6b2c", "--t3": "#5c3a2c", "--t4": "#6e4632"},
  // 밤하늘 = 깊은 **파랑**. 침실 4시간대 세트의 night.png 실측색이 전부 B 지배
  // (천정 #040620 → 달빛 띠 #162e9f). k0(천정)→k9(지평선/달빛) 파랑 그라디언트.
  // (이전엔 workroom-moon 프록시로 보라를 넣었으나, 더 신중한 침실 세트가 기준.)
  "night": {"--cloud-0": "#2a3a7a", "--cloud-1": "#1e2a60", "--cloud-2": "#16204a",
            "--k0": "#06081e", "--k1": "#070a26", "--k2": "#080d31", "--k3": "#0a103c", "--k4": "#0c1547", "--k5": "#101c58", "--k6": "#14236a", "--k7": "#182a7d", "--k8": "#1c318f", "--k9": "#1e37a0", "--page-bg": "#0e1022", "--fl-a": ".30", "--cl-a": ".18", "--ll-a": ".28", "--h0": "#05081a", "--h1": "#0a1030", "--h2": "#101c46", "--h3": "#17275c", "--t0": "#1f2b1c", "--t1": "#2c3d26", "--t2": "#3a4e30", "--t3": "#3a2f33", "--t4": "#463a3c"},
};

export const SEASON = {
  "spring": {"--h0": "#55804a", "--h1": "#6f9c5e", "--h2": "#8fba7c", "--h3": "#c2dfa6", "--t0": "#a86a8c", "--t1": "#d095b5", "--t2": "#e8b8ce"},
  "autumn": {"--h0": "#7a4a2e", "--h1": "#9a6538", "--h2": "#c08850", "--h3": "#e0b070", "--t0": "#7a3a28", "--t1": "#b0622e", "--t2": "#d08a3a"},
  "winter": {"--h0": "#8f9ab0", "--h1": "#b5c0d0", "--h2": "#d8e0ec", "--h3": "#eef2f8"},
};

export const WEATHER = {
  // 게임 날씨 6종(clear/rain/downpour/snow/petals/leaves) + 씬 고유 흐림 2종 = 8종.
  // **아무것도 빼지 않는다** — 어느 걸 노출할지는 게임 UI 가 나중에 정한다.
  "downpour": { "--wl": "#7d8ba6", "--wl-a": ".04", "--ml-a": ".02" },
  // 꽃잎·낙엽 한 종류. 계절이 색을 정하므로 빛 틴트는 어느 계절에도 맞게 중립 웜
  "petals":   { "--wl": "#ffd8c2", "--wl-a": ".22", "--ml-a": ".14" },
  // 구름낀 흐림은 구름 사이로 해가 나므로 창빛이 살아 있다 / 안개낀 흐림은 해가 죽는다
  "cloud": {"--wl": "#d8e2f0", "--wl-a": ".16", "--ml-a": ".10"},
  "fog":   {"--wl": "#c8d2e0", "--wl-a": ".05", "--ml-a": ".03"},
  // 가벼운 비 — 폭우와 구분되도록 창빛을 덜 죽인다
  "rain": {"--wl": "#a8b8d0", "--wl-a": ".11", "--ml-a": ".07"},
  "snow": {"--wl": "#dde8f6", "--wl-a": ".16", "--ml-a": ".10"},
};

/** 축이 겹칠 때만 적용되는 예외 (CSS 특이도가 높아 단일 축 규칙을 이긴다) */
export const COMPOUND = [
  { when: {"time": "sunset", "season": "winter"}, vars: {"--h0": "#6b5570", "--h1": "#94788f", "--h2": "#bd9aad", "--h3": "#e0bcc6"} },
  { when: {"time": "night", "season": "winter"}, vars: {"--h0": "#2b3154", "--h1": "#3d4570", "--h2": "#565f92", "--h3": "#737dae"} },
  { when: {"time": "sunset", "season": "spring"}, vars: {"--t0": "#7a3f56", "--t1": "#a35a6f", "--t2": "#c97d88"} },
  { when: {"time": "sunset", "season": "autumn"}, vars: {"--t0": "#5c2a1c", "--t1": "#8a4520", "--t2": "#b06826"} },
  { when: {"time": "night", "season": "spring"}, vars: {"--t0": "#4a3350", "--t1": "#5f4468", "--t2": "#75587c"} },
  { when: {"time": "night", "season": "autumn"}, vars: {"--t0": "#3d2620", "--t1": "#54321e", "--t2": "#6b4426"} },
  { when: {"time": "day", "season": "winter"}, vars: {"--wl": "#eef4fc", "--wl-a": ".24"} },
];

/** BASE → 축별 → 컴파운드 예외 순으로 덮어써 최종 팔레트를 만든다 */
export function resolve(state, roomPalette = {}) {
  const p = { ...roomPalette, ...BASE };
  Object.assign(p, SEASON[state.season] || {});
  Object.assign(p, TIME[state.time] || {});
  Object.assign(p, WEATHER[state.weather] || {});
  for (const { when, vars } of COMPOUND)
    if (Object.entries(when).every(([k, v]) => state[k] === v)) Object.assign(p, vars);
  return p;
}

// PROP_SLOTS 가 BASE 뒤쪽 정의에 덮이면 소품 색이 조용히 무시된다 → 시작할 때 잡는다.
// (이름 충돌은 에러가 안 나므로 눈으로는 못 찾는다. 담요 --fb* 사고를 겪고 넣었다.)
for (const k of Object.keys(PROP_SLOTS)) {
  if (BASE[k] !== PROP_SLOTS[k]) {
    throw new Error(`팔레트 슬롯 이름 충돌: ${k} — PROP_SLOTS(${PROP_SLOTS[k]})가 `
      + `BASE 의 뒷정의(${BASE[k]})에 덮였다. 소품 슬롯 이름을 바꿀 것.`);
  }
}
