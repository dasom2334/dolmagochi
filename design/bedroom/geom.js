// 침실 씬 — 절차/동적 요소만. 정적 아트(벽·바닥·창틀·가구)는 레퍼런스 추출본
// geom-art.js(tools/extract.py 산출)가 담당한다. 여기엔 게임 상태로 바뀌는 것만:
//  · 돌(거실 생성 돌 ball/rim) 3자리
//  · 책상 스탠드(추출 낮 레퍼런스엔 꺼져 있어 별도로 얹는 밤 작업 조명) + 발광

const R = (x, y, w, h, c, a) => (a == null ? [x, y, w, h, c] : [x, y, w, h, c, a]);

// ── 돌 — 거실에서 생성한 돌 그대로(ball/rim, 팔레트 슬롯 --o0..o4/--wl) ──
import { ball, rim, stoneRows, STONE_ASPECT } from '../livingroom/scene/generate.js';
const orbAt = (cx, baseY, w) => {
  const rows = stoneRows(cx, baseY, w, Math.round(w / STONE_ASPECT));
  return { base: ball(rows), rim: rim(rows) };
};
// 3자리 — 작업=의자 / 누워있기+침대=침대 / 침대없음=러그. 추출 가구에 맞춘 좌표.
export const ORB_SPOTS = {
  chair: () => orbAt(34, 41, 11),
  bed:   () => orbAt(93, 34, 12),
  rug:   () => orbAt(66, 62, 14),
};

// ── 책상 스탠드 — 밤 작업 조명. 낮 추출본엔 꺼져 있어 별도로 얹는다. ──
export function lampArt() {
  return [
    R(43, 28, 6, 1, '#8a6a3a'), R(42, 29, 7, 2, '#6e5230'), R(42, 31, 7, 1, '#4e3a22'),
    R(44, 31, 3, 1, '#c9a86a'), R(45, 32, 1, 4, '#4a4150'),
    R(43, 36, 5, 1, '#3a3242'), R(43, 37, 5, 1, '#241f2e'),
  ];
}
export function lampGlowArt() {
  return [
    R(44, 31, 3, 2, '#fff1c0'),
    R(42, 30, 7, 5, '#ffd98a', 0.5),
    R(39, 28, 13, 9, '#ffcf80', 0.24),
    R(36, 26, 19, 13, '#ffc266', 0.1),
  ];
}
