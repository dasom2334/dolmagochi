// 자동 생성(tools/export_palette.py) 후 **여기가 진실의 원천**이 된다. 직접 편집할 것.
// 슬롯 이름 → 색. 지오메트리는 슬롯 이름만 알고 색은 모른다(팔레트 교체로 48조합 표현).

import { PROP_SLOTS } from './props-room.js';

/** 시간·계절·날씨와 무관한 기본값 */
export const BASE = {
    ...PROP_SLOTS,
    "--page-bg": "#241627",
    "--k0": "#1e5c9e",
    "--k1": "#2a6cae",
    "--k2": "#367cbd",
    "--k3": "#458dcb",
    "--k4": "#559dd6",
    "--k5": "#69ade0",
    "--k6": "#7fbde9",
    "--k7": "#99cef1",
    "--k8": "#b8def7",
    "--k9": "#dcecfb",
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
  "sunset": {"--k0": "#3e223f", "--k1": "#7a3a63", "--k2": "#a1456f", "--k3": "#b84a68", "--k4": "#c95155", "--k5": "#d95950", "--k6": "#e46246", "--k7": "#f36a38", "--k8": "#fb8131", "--k9": "#fd9641", "--sun0": "#fca143", "--sun1": "#fdce8a", "--wl": "#ff9a4a", "--wl-a": ".30", "--fl-a": ".16", "--cl-a": ".12", "--ll-a": ".15", "--h0": "#45233f", "--h1": "#6d3760", "--h2": "#8e3f60", "--h3": "#a6496f", "--t0": "#33401f", "--t1": "#4a5726", "--t2": "#6b6b2c", "--t3": "#5c3a2c", "--t4": "#6e4632"},
  "night": {"--k0": "#05081a", "--k1": "#080c22", "--k2": "#0b1029", "--k3": "#0e1533", "--k4": "#121a3d", "--k5": "#172048", "--k6": "#1d2755", "--k7": "#243065", "--k8": "#2d3b78", "--k9": "#3a4a90", "--page-bg": "#150e1d", "--fl-a": ".30", "--cl-a": ".18", "--ll-a": ".28", "--h0": "#0b0f24", "--h1": "#121835", "--h2": "#1b2347", "--h3": "#26305c", "--t0": "#1f2b1c", "--t1": "#2c3d26", "--t2": "#3a4e30", "--t3": "#3a2f33", "--t4": "#463a3c"},
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
  "petals":   { "--wl": "#ffd9e4", "--wl-a": ".22", "--ml-a": ".14" },
  "leaves":   { "--wl": "#ffce9a", "--wl-a": ".22", "--ml-a": ".14" },
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
