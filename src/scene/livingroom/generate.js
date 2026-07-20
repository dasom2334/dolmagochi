// 절차 생성기 — gen.py 의 포팅. 결과가 Python과 **완전히 같아야** 한다.
// (tools/verify_port.mjs 가 _geom_ref.json 과 대조한다)
//
// 여기서 만드는 것: 창밖 배경(하늘·산) / 마룻바닥 / 러그 / 돌 2종 + 역광 / 나무 2시안
// 레퍼런스 측정으로 뽑은 방 구조는 room-data.js 가 갖고 있다.
//
// rect 형식: [x, y, w, h, slot] — slot 은 색이 아니라 팔레트 자리 이름('--h3' 등)

// 아트는 96×72 로 측정·작화됐다. 화면이 16:9 라 좌우로 16칸씩 넓혀 128×72(=16:9)로 만든다.
// **아트 좌표는 건드리지 않는다** — 아트 공간 x ∈ [-OX, AW+OX) 로 넓히고,
// 캔버스로 옮길 때만 +OX 한다. 창문·러그·돌은 그대로 두면 캔버스 중앙에 온다.
import { buildRoomProps } from './props-room.js';

const AW = 96, GY = 72;      // 원래 아트 폭
const OX = 16;               // 좌우로 넓힌 여백
const GX = AW + OX * 2;      // 캔버스 폭 128
const AX0 = -OX, AX1 = AW + OX;   // 아트 공간 x 범위

/** 결정적 의사난수 0..99 — 같은 좌표면 언제나 같은 값 (재생성 안정성)
 *  Python 정수는 무한 정밀도라 96*73856093 이 32bit를 넘는다.
 *  JS 비트연산은 32bit로 잘리므로 BigInt로 해야 같은 값이 나온다. */
function h2(x, y, salt = 0) {
  const v = (BigInt(x) * 73856093n) ^ (BigInt(y) * 19349663n) ^ (BigInt(salt) * 83492791n);
  return Number(((v % 100n) + 100n) % 100n);
}

/** Python round() 는 half-to-even(은행가 반올림). JS Math.round 는 half-up이라 다르다.
 *  round(0.5)=0, round(2.5)=2 — 능선·투시 좌표가 여기서 1px씩 어긋난다. */
function pyRound(v) {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
/** Python 의 f'{v:.2f}' 과 같은 결과.
 *  toFixed(2) 는 대부분 Python과 같지만, double로 **정확히** 표현되는 half(0.625 등)에서만
 *  갈린다 — JS는 half-up(0.63), Python은 half-even(0.62). 그 경우만 따로 처리한다.
 *  (v*100 후 판정하면 0.475→47.5 같은 오탐이 생겨 안 된다) */
function pyFixed2(v) {
  const exact = v.toFixed(20);                 // 정확한 십진 전개
  if (!/\.\d{2}50*$/.test(exact)) return parseFloat(v.toFixed(2));
  const f = Math.floor(v * 100);
  return (f % 2 === 0 ? f : f + 1) / 100;
}

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const bayer = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;

/** 셀 격자 해시 = 큰 덩어리 변화. per-pixel 해시(=얼룩)와 달리 지형 기복으로 읽힌다 */
const vnoise = (x, y, salt, cw = 8, ch = 3) =>
  h2(Math.floor(x / cw), Math.floor(y / ch), salt);

// ─────────────────────────── 창밖 배경 ───────────────────────────
// 하늘은 알베도가 아니라 광원이라 디라이팅/양자화 대상이 아니다(README §3.7).
// 레퍼런스 수직 단면 실측을 10단 그라디언트로: k0(천정) → k9(지평선).
const SKY_N = 10;

/** 제어점 사이 선형보간 — 보간이 만드는 계단이 그대로 도트 실루엣이 된다 */
function ramp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x0 <= x && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

// 겹산 3중 실루엣 (뒤→앞). 봉우리·골이 뚜렷한 삼각 능선
const RIDGE_FAR = [[-16,26],[0,27],[6,24],[14,28],[22,25],[33,23],[40,27],[46,26],[52,24],
                   [58,26],[64,25],[70,28],[78,24],[86,27],[96,25],[112,28]];
const RIDGE_MID = [[-16,30],[0,31],[10,29],[18,31],[28,28],[36,31],[44,30],[50,29],[57,31],
                   [64,29],[72,31],[82,29],[96,31],[112,29]];
const RIDGE_NEAR = [[-16,34],[0,33],[14,32],[26,34],[38,33],[50,34],[62,32],[74,34],[86,33],[96,34],[112,33]];

function synth(y, x) {
  const rf = pyRound(ramp(RIDGE_FAR, x));
  const rm = pyRound(ramp(RIDGE_MID, x));
  const rn = pyRound(ramp(RIDGE_NEAR, x));

  // 각 산맥은 단색 실루엣 + 자기 능선 1px 밝은 림 = 도트 산 표현의 정석.
  // 경계에 디더를 섞으면 얼룩(노이즈)으로 읽히므로 섞지 않는다.
  if (y >= rn) {
    if (y === rn) return '--h1';
    if (y > 36) return '--h0';                       // 벽 뒤(항상 가려짐) — 평평하게
    return vnoise(x, y, 80, 9, 4) < 26 ? '--h1' : '--h0';
  }
  if (y >= rm) {
    if (y === rm) return '--h2';
    if (y === rn - 1 && h2(x, 0, 70) < 34) return '--h0';   // 능선 위 침엽수림
    if (y === rn - 2 && h2(x, 0, 71) < 13) return '--h0';
    return vnoise(x, y, 81, 8, 3) < 22 ? '--h2' : '--h1';
  }
  if (y >= rf) {
    if (y <= rf + 1) return '--h3';
    if (y === rm - 1 && h2(x, 0, 72) < 30) return '--h1';
    if (y === rm - 2 && h2(x, 0, 73) < 11) return '--h1';
    return vnoise(x, y, 82, 10, 4) < 24 ? '--h3' : '--h2';
  }

  // 하늘: solid 행 밴드 (스톱이 촘촘해 디더 없이도 계단이 안 보인다)
  // 후광은 여기 굽지 않는다 — halo-sun / halo-moon 그룹이 따로 얹는다
  let s = Math.max(0, Math.min(SKY_N - 1, pyRound((y - 4.0) / 2.1)));
  // 얇은 층운: 지평선과 평행한 가로 띠
  for (const [cy, cx0, cx1] of [[8,28,50],[11,56,84],[14,14,42],[17,60,92]]) {
    if (y === cy && cx0 - 4 <= x && x <= cx1 + 4) {
      const edge = Math.min(x - (cx0 - 4), cx1 + 4 - x) / 5;
      if (h2(x, y, 61) / 100 < Math.min(1, edge)) s = Math.min(SKY_N - 1, s + 1);
    }
  }
  return `--k${s}`;
}

// ─────────────────────────── 마룻바닥 ───────────────────────────
// 소실점은 러그 사다리꼴에서 역산 — 러그와 바닥이 같은 평면이라 투시가 자동으로 맞는다.
const FLOOR_VPX = 50.1, FLOOR_VPY = 22.4, FLOOR_REF_Y = 71.0, PLANK_W_REF = 30;
const perspS = (y) => (y - FLOOR_VPY) / (FLOOR_REF_Y - FLOOR_VPY);
const perspX = (xRef, y) => FLOOR_VPX + (xRef - FLOOR_VPX) * perspS(y);

const FLOOR_BANDS = (() => {
  const b = []; let yy = 72.0;
  while (yy > 49.5) { b.push(pyRound(yy)); yy = FLOOR_VPY + (yy - FLOOR_VPY) * 0.895; }
  b.push(49);
  const u = [...new Set(b)].sort((p, q) => p - q);
  return u.slice(0, -1).map((v, i) => [v, u[i + 1] - 1]);
})();

function floorCells() {
  const cell = new Map();
  const put = (y, x, v) => cell.set(y * 1000 + (x - AX0), v);   // 음수 x 대응
  FLOOR_BANDS.forEach(([y0, y1], bi) => {
    const off = h2(bi, 1, 31) % PLANK_W_REF;
    const xrefs = [];
    for (let k = -4; k < 8; k++) xrefs.push(off + k * PLANK_W_REF);
    for (let y = y0; y <= y1; y++) {
      const s = perspS(y);
      for (let k = 0; k < xrefs.length - 1; k++) {
        const x0 = Math.max(AX0, pyRound(perspX(xrefs[k], y)));
        const x1 = Math.min(AX1, pyRound(perspX(xrefs[k + 1], y)));
        if (x1 <= x0) continue;
        const r = h2(k, bi, 32) % 12;
        const tone = r < 3 ? '--fb0' : r < 6 ? '--fb2' : '--fb1';
        for (let xx = x0; xx < x1; xx++) put(y, xx, tone);
        // 결: 길이 방향 대시. 길이·간격이 축척을 따라 뒤로 갈수록 촘촘해진다
        let gx = x0;
        while (gx < x1) {
          if (h2(gx, y, 34) < 26) {
            const ln = Math.min(Math.max(1, pyRound((2 + (h2(gx, y, 35) % 3)) * s)), x1 - gx);
            const sh = h2(gx, y, 36) < 62 ? '--fbl' : '--fbh';
            for (let xx = gx; xx < gx + ln; xx++) put(y, xx, sh);
          }
          gx += Math.max(2, pyRound((3 + (h2(gx, y, 33) % 6)) * s));
        }
        if (h2(k, y, 37) < 4 && x1 - x0 > 7) {          // 옹이
          const kx = x0 + 3 + (h2(k, y, 38) % (x1 - x0 - 6));
          const kw = Math.max(1, pyRound(2 * s));
          for (let xx = kx; xx < Math.min(x1, kx + kw); xx++) put(y, xx, '--fbk');
        }
      }
      // 판자 위/아래 모따기 (가로선은 화면과 평행하므로 수평 유지)
      if (y === y0 && bi > 0) for (let xx = AX0; xx < AX1; xx++) put(y, xx, '--fbh');
      if (y === y1) for (let xx = AX0; xx < AX1; xx++) put(y, xx, '--fbk');
      // 맞댐 이음매 1px — 행마다 x가 이동해 결과적으로 소실점으로 기우는 선이 된다
      for (const xr of xrefs) {
        const jx = pyRound(perspX(xr, y));
        if (jx > AX0 && jx < AX1) put(y, jx, '--fbk');
      }
    }
  });
  return cell;
}

// ─────────────────── 벽에 붙은 상자에 깊이 주기 ───────────────────
// 벽난로·책장은 측정 아트가 **완전한 직사각형**이라 두께 0 인 판자로 보였다.
// 게다가 밑변이 바닥선(y49) 바로 위 — 즉 측정 위치는 **벽면**이지 앞면이 아니다.
// 그래서 옆면을 뒤로 붙이면 밑동이 뜬다. 반대로 **앞면을 앞으로 끌어내** 바닥에
// 세우고, 벽면과의 사이를 옆면·윗면으로 잇는다.
//
// 앞으로 끌어내는 것 = 소실점 기준 확대. 수평선(y=22.4) 아래는 내려가고 위는
// 올라가며, 소실점에서 멀어지는 쪽으로 벌어진다 — 1점 투시 그대로다.
const BOX_FW = 1.15;
const fwdX = (x, s = BOX_FW) => FLOOR_VPX + (x - FLOOR_VPX) * s;
const fwdY = (y, s = BOX_FW) => FLOOR_VPY + (y - FLOOR_VPY) * s;

// ─────────────── 벽난로·책장 형태 보정 ───────────────
// 측정 추출이 **조명과 평면 색은 가져왔지만 구조는 못 가져왔다.** 둘 다 모서리의
// 1px 하이라이트가 없어서, 이 크기에서는 널·턱·보가 전부 "그려 넣은 줄"로 읽힌다.
// 측정 아트 뒤에 덧그려 구조를 세운다(순서상 나중이라 위에 덮인다).

/** 벽돌 — 레퍼런스는 줄눈만 그은 게 아니라 **벽돌 한 장 한 장에 명암**이 있다.
 *  1px 줄눈만 그으면 격자무늬로 보이고 돌덩이로는 안 읽힌다.
 *  블록 4×3, 켜마다 반 장씩 엇갈리고(막힌줄눈), 각 장의 윗면은 밝고 아래·오른쪽은 줄눈. */
const BW = 4, BH = 3;
function brick(x0, x1, y0, y1, body = '--s6', hi = '--s10', mortar = '--s2', alt = '--s9') {
  const cells = [];
  for (let y = y0; y <= y1; y++) {
    const row = Math.floor((y - y0) / BH), inRow = (y - y0) % BH;
    const off = (row % 2) ? 2 : 0;
    for (let x = x0; x <= x1; x++) {
      const k = x - x0 + off, bx = Math.floor(k / BW), inCol = k % BW;
      let slot = inRow === BH - 1 ? mortar
               : inCol === BW - 1 ? mortar
               : inRow === 0 ? hi : body;
      // 장마다 톤을 조금씩 흔들어야 찍어낸 타일로 안 보인다
      if (slot === body && h2(bx, row, 44) < 26) slot = alt;
      cells.push([y, x, slot]);
    }
  }
  return emitRows(cells);
}

function fireplaceDetail() {
  const d = [];
  // 맨틀 — 레퍼런스는 한 겹이 아니라 **계단식**이다. 위가 가장 넓고 아래로 좁아진다.
  d.push([-2, 31, 26, 1, '--st3']);          // 상판 윗면(가장 밝다)
  d.push([-1, 32, 24, 1, '--st2']);          // 한 단 좁은 앞면
  d.push([0, 33, 22, 1, '--st0']);           // 턱 밑 그림자 — 돌출을 증명하는 건 이것
  // 벽돌 — 좌우 기둥 + 상인방 위 벽까지. 레퍼런스는 아궁이 둘레가 전부 벽돌이다
  // 돌·나무를 같은 계열로 묶는다 — 레퍼런스도 벽난로와 책장 톤이 가깝다
  const B = ['--st1', '--st2', '--st0', '--st1'];
  d.push(...brick(1, 20, 34, 35, ...B));
  d.push(...brick(1, 5, 36, 47, ...B));
  d.push(...brick(17, 20, 36, 47, ...B));
  // 상인방 — 아궁이 위를 가로지르는 보(벽돌이 아니라 통돌)
  d.push([2, 36, 18, 1, '--st2']);
  d.push([2, 37, 18, 1, '--st1']);
  // 아궁이 — 레퍼런스는 사각이 아니라 **아치**다. 위 두 줄을 좁혀 둥글린다.
  // 안쪽은 새까매야 불꽃이 산다(측정본은 잔광이 구워져 있어 채워진 판이었다).
  for (let y = 38; y <= 47; y++) {
    const inset = y === 38 ? 2 : y === 39 ? 1 : 0;
    d.push([6 + inset, y, 11 - inset * 2, 1, '--s1']);
  }
  d.push([7, 46, 8, 1, '--st1']);            // 장작
  d.push([9, 45, 4, 1, '--st0']);
  // 화덕 — 바닥으로 튀어나온 돌판. 없으면 벽에 그려 놓은 그림처럼 보인다.
  d.push([-3, 48, 28, 1, '--st2']);
  d.push([-3, 49, 28, 1, '--st1']);
  return d;
}

/** 책장 칸 안쪽 — 레퍼런스의 제1 단서는 **안쪽이 틀보다 확연히 어둡다**는 것.
 *  측정본은 둘이 거의 같은 톤이라 통짜 판으로 보였다.
 *  단, 안에 이미 그려진 밝은 것(책·화분)은 남겨야 하므로 어두운 배경 톤만 덮는다. */
const SHELF_BG = new Set(['--s3', '--s5', '--s6', '--s8']);
const SHELF_BAYS = [[18, 24], [27, 35], [38, 45]];

function shelfDetail(measured) {
  const d = [];
  const cell = new Map();
  for (const [x, y, w, h, s] of measured)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cell.set((y + j) + ',' + (x + i), s);
  // 칸 안쪽 배경만 어둡게
  for (const [y0, y1] of SHELF_BAYS)
    for (let y = y0; y <= y1; y++) {
      let run = null;
      for (let x = 79; x <= 95; x++) {
        const dark = SHELF_BG.has(cell.get(y + ',' + x));
        if (dark) { if (!run) run = [x, x]; else run[1] = x; }
        else if (run) { d.push([run[0], y, run[1] - run[0] + 1, 1, '--s1']); run = null; }
      }
      if (run) d.push([run[0], y, run[1] - run[0] + 1, 1, '--s1']);
    }
  // 틀은 **따뜻한 나무**로. 레퍼런스에서 책장이 책장으로 읽히는 결정적 이유는
  // 틀(밝은 나무)과 안쪽(어두움)의 대비다. 측정본은 틀까지 보라색이라 벽에 묻었다.
  d.push([77, 16, 20, 1, '--wd2']);          // 상판 윗면(빛 받는 면)
  d.push([77, 17, 20, 1, '--wd1']);
  // 좌우 옆기둥 — 왼쪽은 창을 마주 보므로 밝고, 오른쪽은 그늘
  for (let y = 18; y <= 46; y++) {
    d.push([78, y, 2, 1, '--wd1']);
    d.push([78, y, 1, 1, '--wd2']);
    d.push([94, y, 2, 1, '--wd0']);
  }
  // 선반 널 — 앞면 밝게 + 밑면 어둡게 = 두께
  for (const y of [25, 36, 46]) {
    d.push([78, y, 18, 1, '--wd2']);
    d.push([78, y + 1, 18, 1, '--wd0']);
  }
  d.push([77, 47, 20, 1, '--wd1']);          // 굽
  d.push([77, 48, 20, 1, '--wd0']);
  return d;
}

/** rect 목록을 앞면 위치로. 런 구조를 유지한 채 최근접 확대 */
function pullForward(rects, s = BOX_FW) {
  return rects.map(([x, y, w, h, slot, op]) => {
    const X0 = pyRound(fwdX(x, s)), X1 = pyRound(fwdX(x + w, s));
    const Y0 = pyRound(fwdY(y, s)), Y1 = pyRound(fwdY(y + h, s));
    const r = [X0, Y0, Math.max(1, X1 - X0), Math.max(1, Y1 - Y0), slot];
    if (op !== undefined) r.push(op);
    return r;
  });
}

/** 벽면 모서리와 앞면 모서리를 잇는 옆면(+수평선 아래면 윗면).
 *  sideDir: +1 = 소실점이 오른쪽(→ 오른쪽 옆면이 보인다), -1 = 왼쪽 */
function boxFaces(x0, x1, y0, y1, sideDir, sideSlot, topSlot) {
  const cells = [];
  const fx0 = fwdX(x0), fx1 = fwdX(x1 + 1), fy0 = fwdY(y0), fy1 = fwdY(y1 + 1);
  const xw = sideDir > 0 ? x1 + 1 : x0;          // 벽면 쪽 모서리
  const xf = sideDir > 0 ? fx1 : fx0;            // 앞면 쪽 모서리
  for (let X = Math.round(Math.min(xw, xf)); X < Math.round(Math.max(xw, xf)); X++) {
    const u = (X + 0.5 - xf) / (xw - xf);        // 0 = 앞면, 1 = 벽면
    const yT = fy0 + (y0 - fy0) * u, yB = fy1 + (y1 + 1 - fy1) * u;
    for (let Y = Math.round(yT); Y < Math.round(yB); Y++) cells.push([Y, X, sideSlot]);
  }
  // 윗면은 앞면 윗변이 벽면 윗변보다 **아래**일 때만 보인다 = 수평선 아래 물체.
  // (책장처럼 수평선 위로 솟은 것은 윗면이 안 보인다 — 눈높이보다 높으니까)
  if (topSlot && fy0 > y0) {
    for (let Y = Math.round(y0); Y < Math.round(fy0); Y++) {
      const u = (Y + 0.5 - fy0) / (y0 - fy0);
      const xa = fx0 + (x0 - fx0) * u, xb = fx1 + (x1 + 1 - fx1) * u;
      for (let X = Math.round(xa); X < Math.round(xb); X++) cells.push([Y, X, topSlot]);
    }
  }
  return emitRows(cells);
}

// ─────────────────────────── 러그 ───────────────────────────
// 레퍼런스 구조: 외곽 어두운 단 + 밝은 테두리 줄 + 무늬 필드
const RUG_Y0 = 52, RUG_Y1 = 66;
function rugSpan(y) {
  const t = (y - RUG_Y0) / (RUG_Y1 - RUG_Y0);
  return [pyRound(29 - 10 * t), pyRound(67 + 8 * t)];
}
function rugCells() {
  const out = [];
  for (let y = RUG_Y0; y <= RUG_Y1; y++) {
    const [x0, x1] = rugSpan(y);
    for (let x = x0; x <= x1; x++) {
      const din = Math.min(x - x0, x1 - x, y - RUG_Y0, RUG_Y1 - y);
      let tone;
      if (din === 0) tone = '--rg0';
      else if (din === 1) tone = '--rg1';
      else if (din === 2) tone = '--rg4';            // 밝은 테두리 줄
      else if (din === 3) tone = '--rg3';
      else {
        tone = '--rg2';
        const r = h2(x, y, 40);
        if (r < 7) tone = '--rg3';
        else if (r < 12) tone = '--rg1';
        if (din === 4 && h2(x, y, 41) < 45) tone = '--rg3';
      }
      out.push([y, x, tone]);
    }
  }
  return out;
}

// ─────────────────────────── 돌 ───────────────────────────
// 실루엣은 정규화 프로파일 하나를 두 크기로 래스터라이즈 → 창턱/러그 돌 모양이 통일된다.
const STONE_ASPECT = 1.40;
function stoneProfile(t) {          // 0=꼭대기 1=바닥 → 반폭 비율
  const c = 0.60, r = t <= c ? c : 0.55;
  return Math.sqrt(Math.max(0, 1 - ((t - c) / r) ** 2));
}
function stoneRows(cx, baseY, w, h) {
  const rows = [];
  for (let i = 0; i < h; i++) {
    const y = baseY - h + 1 + i, t = (i + 0.5) / h;
    const hw = (w / 2) * stoneProfile(t);
    const x0 = pyRound(cx - hw), x1 = pyRound(cx + hw) - 1;
    if (x1 >= x0) rows.push([y, x0, x1, t]);
  }
  return rows;
}
const LOWER = { '--o4':'--o3','--o3':'--o2','--o2':'--o1','--o1':'--o0','--o0':'--o0' };

/** 무방향광: 위=열린 하늘 AO로 밝고, 아래=접지 AO로 어둡다 */
function ball(rows) {
  const out = [];
  for (const [y, x0, x1, t] of rows) {
    const tone = t < 0.20 ? '--o4' : t < 0.42 ? '--o3' : t < 0.66 ? '--o2'
               : t < 0.86 ? '--o1' : '--o0';
    out.push([x0, y, x1 - x0 + 1, 1, tone]);
    const lo = LOWER[tone];
    if (t > 0.06 && t < 0.94) {          // 곡률 림
      out.push([x0, y, 1, 1, lo]);
      out.push([x1, y, 1, 1, lo]);
    }
    for (let xx = x0 + 1; xx < x1; xx++)  // 질감 스펙클
      if (h2(xx, y, 22) < 4) out.push([xx, y, 1, 1, lo]);
  }
  return out;
}

/** 역광 림라이트 — base에 굽지 않고 광원 레이어에 얹어 시간대 색을 따라가게 한다 */
function rim(rows) {
  const out = [];
  for (const [y, x0, x1, t] of rows) {
    if (t < 0.55) out.push([x0, y, x1 - x0 + 1, 1, '--wl', pyFixed2(0.85 - t)]);
    if (t < 0.80) out.push([x1, y, 1, 1, '--wl', pyFixed2(0.7 - t * 0.5)]);
  }
  return out;
}

const SILL_ROWS = stoneRows(58, 35, 10, pyRound(10 / STONE_ASPECT));
const RUG_ROWS  = stoneRows(47, 61, 14, pyRound(14 / STONE_ASPECT));

// ─────────────────────────── 나무 ───────────────────────────
// v1: 클럼프 침엽 / v2: 타원 로브 활엽. 둘 다 창에 가려진 부분까지 그린다.
const CLUMPS = [
  [[5,30,32],[6,29,33],[7,29,33]],
  [[8,26,40],[8,42,45],[9,24,46],[10,24,46],[11,27,46],[12,29,47],[13,30,45],[14,30,44]],
  [[15,35,44],[16,35,43],[17,38,43],[18,38,42]],
  [[15,29,32],[16,28,32],[17,28,31]],
  [[17,33,36],[18,32,36],[19,31,35],[20,31,33]],
];

function treeV1() {
  const trunk = [], leaves = [];
  for (let y = 8; y <= 40; y++) {
    let x0, x1;
    if (y >= 38) { x0 = 33; x1 = 37; } else if (y >= 34) { x0 = 34; x1 = 36; }
    else { x0 = 34; x1 = 35; }
    trunk.push([x0, y, x1 - x0, 1, '--t3']);
    trunk.push([x1, y, 1, 1, '--t4']);
  }
  for (const clump of CLUMPS) {
    const ys = [...new Set(clump.map((r) => r[0]))].sort((a, b) => a - b);
    for (const [y, x0, x1] of clump) {
      const w = x1 - x0 + 1;
      if (y === ys[0]) {
        // 상단 릿지: 통짜 밝은 슬래브를 피하고 끊긴 세그먼트만
        leaves.push([x0, y, w, 1, '--t1']);
        for (let xx = x0; xx <= x1; xx++)
          if (h2(Math.floor(xx / 3), y, 10) < 50) leaves.push([xx, y, 1, 1, '--t2']);
      } else if (y === ys[ys.length - 1]) {
        leaves.push([x0, y, w, 1, '--t0']);
      } else {
        leaves.push([x0, y, w, 1, '--t1']);
        const hl = 1 + (h2(x1, y, 8) % 2);
        leaves.push([Math.max(x0, x1 - hl + 1), y, Math.min(hl, w), 1, '--t2']);
        for (let xx = x0 + 1; xx < x1; xx++)
          if (h2(xx, y, 9) < 9) leaves.push([xx, y, 1, 1, '--t0']);
      }
    }
  }
  return { trunk, leaves };
}

// 로브 중심 y를 서로 어긋나게 — 같은 높이에 몰리면 음영이 가로 줄무늬가 된다
const LOBES = [[34.5,7.0,4.6,2.8],[29.0,9.5,4.2,2.9],[40.0,10.8,4.4,3.0],[34.0,12.0,5.8,3.2],
               [27.5,13.8,3.8,2.6],[42.0,14.6,3.9,2.7],[35.5,15.8,4.8,2.6],[31.0,16.4,3.6,2.2]];
const GAPS = [[31.5,10.5,1.5,1.1],[38.0,12.8,1.7,1.2],[33.0,14.2,1.4,1.0]];

function treeV2() {
  const trunkSpan = (y) =>
    y >= 39 ? [32,40] : y >= 36 ? [33,39] : y >= 30 ? [34,38] : y >= 22 ? [34,37] : [34,36];
  const trunk = [];
  for (let y = 14; y <= 40; y++) {
    const [x0, x1] = trunkSpan(y);
    trunk.push([x0, y, x1 - x0, 1, '--t3']);
    trunk.push([x1, y, 1, 1, '--t4']);
    if (h2(x0, y, 50) < 30 && x1 - x0 > 2)   // 나무껍질 세로 결
      trunk.push([x0 + 1 + (h2(y, 0, 51) % (x1 - x0 - 1)), y, 1, 1, '--t0']);
  }
  for (const [bx0, by0, bx1, by1] of [[35,17,30,13],[37,16,41,12],[36,14,33,10]]) {
    const steps = Math.max(Math.abs(bx1 - bx0), Math.abs(by1 - by0));
    for (let i = 0; i <= steps; i++)
      trunk.push([pyRound(bx0 + ((bx1 - bx0) * i) / steps),
                  pyRound(by0 + ((by1 - by0) * i) / steps), 1, 1, '--t3']);
  }

  const canopy = new Map();
  for (const [cx, cy, rx, ry] of LOBES) {
    for (let y = Math.floor(cy - ry) - 1; y <= Math.floor(cy + ry) + 1; y++) {
      for (let x = Math.floor(cx - rx) - 1; x <= Math.floor(cx + rx) + 1; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (d > 0.90 && h2(x, y, 54) < 45) continue;    // 실루엣 가장자리를 성기게
        const v = (y - (cy - ry)) / (2 * ry);
        const shade = v * 0.62 + d * 0.38;              // 세로 + 방사 → 둥근 잎 뭉치
        const key = y * 1000 + x;
        if (!canopy.has(key) || shade < canopy.get(key)[2]) canopy.set(key, [y, x, shade]);
      }
    }
  }
  for (const [gx, gy, grx, gry] of GAPS)                 // 하늘 틈 뚫기
    for (const [key, [y, x]] of [...canopy])
      if (((x - gx) / grx) ** 2 + ((y - gy) / gry) ** 2 <= 1) canopy.delete(key);

  const leaves = [];
  for (const [y, x, shade] of [...canopy.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    let tone = shade < 0.30 ? '--t2' : shade < 0.60 ? '--t1' : '--t0';
    const r = h2(x, y, 53);
    if (r < 8) tone = '--t0';                            // 잎새 틈(그늘)
    else if (r > 94 && shade < 0.45) tone = '--t2';       // 반짝이는 잎
    leaves.push([y, x, tone]);
  }
  return { trunk, leaves };
}

export const FLAME_N = 6;

// ─────────────────────────── 촛불 ───────────────────────────
// 가정용 초의 불은 **1×2 픽셀**이면 충분하다. 크게 그리면 횃불이 된다.
// 변화는 크기가 아니라 밝기·높이의 미세한 흔들림으로만 준다.
//   . = 빈칸  o = 바깥테  m = 중간  c = 심지불꽃(가장 밝음)
const CANDLE_ART = [
  ['m', 'c'],          // 0 기본
  ['m', 'c'],          // 1
  ['o', 'c'],          // 2 끝이 식는다
  ['m', 'c'],          // 3
  ['.', 'c'],          // 4 잠깐 줄어든다
  ['o', 'c'],          // 5
];
/** 심지 끝(wickX, wickY) 기준으로 프레임을 배치한다 — 맨 아랫줄이 심지에 닿는다 */
function candleFrames(wickX, wickY, tones) {
  return CANDLE_ART.map((art) => {
    const cells = [];
    art.forEach((row, i) => {
      const y = wickY - (art.length - 1) + i;
      // 격자 폭에 맞춰 심지 위에 **가운데 정렬**한다.
      // -1 로 고정하면 1칸짜리 격자에서 한 칸 왼쪽으로 어긋난다.
      const half = Math.floor(row.length / 2);
      [...row].forEach((ch, j) => {
        if (ch === '.') return;
        const tone = ch === 'o' ? tones[0] : ch === 'm' ? tones[1] : tones[2];
        cells.push([y, wickX - half + j, tone]);
      });
    });
    return emitRows(cells);
  });
}

// ─────────────────────────── 스탠드 빛 ───────────────────────────
// 원본은 전구를 갓 밑에 **또렷한 밝은 사각형**으로 찍어 놔서, 갓과 분리된
// 별개의 물건처럼 보였다. 빛은 갓 밑면 폭에서 시작해 아래로 좁아지며 흐려져야
// "갓에서 새어 나오는 빛"으로 읽힌다. 기둥(x74)은 덮지 않는다.
function lampGlow() {
  const out = [];
  const push = (y, x0, x1, a) => out.push([x0, y, x1 - x0 + 1, 1, '--ll', a]);
  // 밝은 곳은 갓 **밑면(y36) 자체**다. 그 아래에 또렷한 띠를 놓으면
  // 갓에 서랍이 하나 달린 것처럼 보인다 — 아래로는 흐리게 번지기만 한다.
  push(36, 71, 76, 0.88);                       // 갓이 열린 입구가 빛난다
  push(37, 72, 75, 0.42);
  for (const [y, x0, x1, a] of [[38, 73, 73, 0.20], [38, 75, 75, 0.20]])
    push(y, x0, x1, a);                         // 기둥 좌우로만 — 기둥을 지우지 않게
  return out;
}

// ─────────────────────── run-merge & 조립 ───────────────────────
/** [y,x,slot] 목록을 가로로 병합해 rect 로. 셀 맵 입력이라 겹침이 없다 */
function emitRows(cells) {
  const byRow = new Map();
  for (const [y, x, v] of cells) {
    if (!byRow.has(y)) byRow.set(y, []);
    byRow.get(y).push([x, v]);
  }
  const out = [];
  for (const y of [...byRow.keys()].sort((a, b) => a - b)) {
    const row = byRow.get(y).sort((a, b) => a[0] - b[0]);
    let i = 0;
    while (i < row.length) {
      const [x0, v] = row[i];
      let j = i;
      while (j + 1 < row.length && row[j + 1][0] === row[j][0] + 1 && row[j + 1][1] === v) j++;
      out.push([x0, y, row[j][0] - x0 + 1, 1, v]);
      i = j + 1;
    }
  }
  return out;
}

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);

// ─────────────────────────── 벽 평면 ───────────────────────────
// 측정된 g-wall 은 창·벽난로·책장 자리가 **실제로 뚫려 있다**. 소품을 끄면 그 뒤로
// 창밖 하늘이 비친다 — 벽이 한 장의 평면이 아니라 소품 모양대로 오려진 껍데기였던 것.
// 그래서 g-wall 뒤에 "진짜 벽 한 장"을 깐다. 남기는 구멍은 창 개구부 하나뿐이다.
const APERTURE = { x0: 27, x1: 66, y0: 4, y1: 33 };   // 실측: 여기만 하늘이 보여야 한다
const WALL_Y1 = 48;                                    // 49부터는 바닥

/** 벽 한 장 — 측정 텍스처(wallRects) + 그것으로 메운 나머지. 개구부는 창 하나뿐.
 *  메움은 **행마다 그 행에서 실제로 벽인 열들**에서 골라 온다
 *  (소스 열을 고정하면 창문과 겹쳐 하늘이 새어 나온다).
 *  메움과 원본이 같은 질감이라 둘을 나눠 둘 이유가 없어 한 그룹으로 합쳤다. */
function wallPlane(wallRects) {
  const byRow = new Map();                      // y -> Map(x -> slot)
  for (const [x, y, w, h, slot] of wallRects)
    for (let yy = y; yy < y + h; yy++) {
      if (!byRow.has(yy)) byRow.set(yy, new Map());
      const row = byRow.get(yy);
      for (let xx = x; xx < x + w; xx++) row.set(xx, slot);
    }
  // 벽 셀이 하나도 없는 행(개구부에 완전히 먹힌 행)은 위 행에서 물려받는다
  let carry = null;
  const out = [];
  for (const y of range(0, WALL_Y1 + 1)) {
    const row = byRow.get(y);
    const src = row && row.size ? [...row.keys()].sort((a, b) => a - b) : null;
    if (src) carry = { row, src };
    if (!carry) continue;
    for (const x of range(AX0, AX1)) {
      if (x >= APERTURE.x0 && x <= APERTURE.x1 && y >= APERTURE.y0 && y <= APERTURE.y1) continue;
      if (row && row.has(x)) { out.push([y, x, row.get(x)]); continue; }   // 원본 질감 우선
      const sx = carry.src[(((x % carry.src.length) + carry.src.length) % carry.src.length)];
      out.push([y, x, carry.row.get(sx)]);
    }
  }
  return emitRows(out);
}

// ─────────────────────────── 해·달 후광 ───────────────────────────
// 후광을 synth 안에 굽지 않는다 — 그러면 중심이 하나로 고정돼 해와 달 중 한쪽은 어긋난다.
// (실제로 (56.5,16)에 있어 달과는 맞고 해(58.5,17)와는 2px 어긋나 있었다.)
// 하늘 슬롯(--kN)을 그대로 쓰는 별도 그룹으로 떼어내 시간대별로 켠다.
function halo(cx, cy, reach, ysquash) {
  const cells = [];
  for (let y = 0; y < 36; y++)
    for (let x = AX0; x < AX1; x++) {
      const d = Math.hypot(x - cx, (y - cy) * ysquash);
      if (d >= reach) continue;
      // 방사형이라 밴드로 깔면 동심원 링이 보인다 → 해시 지터로 경계를 흐트러뜨린다
      const base = Math.max(0, Math.min(SKY_N - 1, pyRound((y - 4.0) / 2.1)));
      const lift = SKY_N - 0.4 - (d * 8.06) / reach + h2(x, y, 60) / 100 - 0.5;
      const s = Math.max(base, Math.max(0, Math.min(SKY_N - 1, pyRound(lift))));
      if (s > base) cells.push([y, x, `--k${s}`]);
    }
  return emitRows(cells);
}

// ─────────────────────────── 창밖 날씨 ───────────────────────────
// 파티클은 창 폭(x29~67)에만 그려져 있었다. 다른 씬(창이 더 큰 방·야외)에서 재사용하려면
// 아트 전폭이어야 한다. 세로 주기는 TILE_H(30)에 맞춘다 — 한 벌을 30px 위에 겹쳐
// 무한 낙하를 만들기 때문에, 패턴이 30으로 안 나누어떨어지면 이음매가 보인다.
const PT_H = 30;

/** 비 — **실측 원본 방식으로 되돌린 것**.
 *
 *  원본(v2 실측)은 1×3 짜리 짧은 낱방울 16개를 창 안에 성기게 흩뿌린 것이었다.
 *  나는 이걸 세 번에 걸쳐 "선"으로 바꾸려 했고(열 기둥 → 긴 대시 → 대각선)
 *  전부 원본보다 나빴다. 기록해 둘 것:
 *    - 긴 세로 기둥: 정지한 선으로 보인다
 *    - 대각선: 각도는 맞지만 **낙하 애니메이션이 수직**이라 움직임이 어긋난다.
 *      기울인 빗줄기는 그 기울기 방향으로 움직여야 하는데 여기 낙하는 dy 뿐이다.
 *    - 이 크기(창 38px)에서는 긴 줄 자체가 과하다. 짧은 낱방울이 맞다.
 *
 *  spacing=가로 간격, len=방울 길이, passes=겹쳐 뿌리는 횟수(밀도) */
function rainDrops(slot, spacing, len, passes, salt) {
  const cells = [];
  for (let pass = 0; pass < passes; pass++)
    for (let x0 = AX0; x0 < AX1; x0 += spacing) {
      const x = x0 + (h2(x0, pass, salt) % spacing);
      if (x < AX0 || x >= AX1) continue;
      const y0 = h2(x, pass, salt + 1) % PT_H;
      for (let k = 0; k < len; k++) cells.push([(y0 + k) % PT_H, x, slot]);
    }
  return emitRows(cells);
}

/** 낙하 파티클(눈) — 칸마다 독립. 눈은 점이라 붙어도 뭉치로 안 읽힌다 */
function fall(slot, dens, len, salt) {
  const cells = [];
  for (let y = 0; y < PT_H; y++)
    for (let x = AX0; x < AX1; x++) {
      if (h2(x, y, salt) >= dens) continue;
      for (let i = 0; i < len; i++) cells.push([(y + i) % PT_H, x, slot]);
    }
  return emitRows(cells);
}

/** 흩날림 파티클(꽃잎·낙엽) — 낙하보다 성기고 가로로 어긋난다 */
function drift(slot, dens, salt) {
  const cells = [];
  for (let y = 0; y < PT_H; y++)
    for (let x = AX0; x < AX1; x++)
      if (h2(x, y, salt) < dens) cells.push([y, x, slot]);
  return emitRows(cells);
}

// ─────────────────────────── 구름 ───────────────────────────
// 도트 뭉게구름의 정석: **밑면은 평평하고, 위는 원을 여러 개 얹어 울퉁불퉁**하다.
// (실제 적운이 응결고도에서 밑이 잘리기 때문. 밑까지 둥글면 솜뭉치나 연기로 보인다.)
// 톤은 3단 — 윗면 1px 하이라이트 / 몸통 / 밑면 그늘. 이게 있어야 부피로 읽힌다.
//
// [기준선 y, 밑면 x0, 밑면 x1, 로브들 [중심x, 반지름]]
const CLOUDS = [
  [12, -14, 6, [[-10, 4.2], [-4, 5.4], [2, 3.6]]],
  [8, 14, 34, [[19, 4.0], [25, 5.6], [31, 3.4]]],
  [17, 26, 44, [[31, 3.2], [37, 4.4], [42, 2.8]]],
  [10, 50, 74, [[56, 4.6], [63, 5.8], [70, 3.8]]],
  [19, 68, 84, [[73, 3.0], [79, 4.0]]],
  [13, 88, 110, [[93, 4.2], [100, 5.2], [106, 3.4]]],
  [8, 104, 122, [[109, 3.4], [116, 4.6]]],
  [20, 4, 18, [[9, 2.8], [15, 3.6]]],
];

function cloudBank() {
  const solid = new Set();                       // "구름 안" 셀 집합
  const key = (y, x) => y * 1000 + (x - AX0);
  for (const [baseY, bx0, bx1, lobes] of CLOUDS) {
    for (const [lx, lr] of lobes)
      for (let y = Math.floor(baseY - lr); y <= baseY; y++)
        for (let x = Math.floor(lx - lr); x <= Math.ceil(lx + lr); x++) {
          if (x < AX0 || x >= AX1 || x < bx0 || x > bx1) continue;
          const dx = (x - lx) / lr, dy = (y - baseY) / lr;
          if (dx * dx + dy * dy <= 1) solid.add(key(y, x));
        }
    // 로브 사이가 끊기지 않게 밑면 1~2줄을 평평하게 이어 준다
    for (let x = bx0; x <= bx1; x++) {
      if (x < AX0 || x >= AX1) continue;
      solid.add(key(baseY, x));
      if (x > bx0 && x < bx1) solid.add(key(baseY - 1, x));
    }
  }
  // 톤 배정: 위가 뚫려 있으면 하이라이트, 아래가 뚫려 있으면 밑면 그늘
  const cells = new Map();                       // 구름끼리 겹치면 중복 방출되므로 맵으로
  for (const [baseY, bx0, bx1] of CLOUDS) {
    for (let y = baseY - 8; y <= baseY; y++)
      for (let x = Math.max(AX0, bx0); x <= Math.min(AX1 - 1, bx1); x++) {
        if (!solid.has(key(y, x))) continue;
        const top = !solid.has(key(y - 1, x));
        const bot = !solid.has(key(y + 1, x));
        cells.set(key(y, x), [y, x, top ? '--cloud-0' : bot ? '--cloud-2' : '--cloud-1']);
      }
  }
  return emitRows([...cells.values()]);
}

// ─────────────────────── 펼쳐 놓은 책 ───────────────────────
// 러그 가운데 돌(x40~54, 밑변 y61) 바로 앞에 펼쳐 둔다 — 돌이 읽고 있는 것처럼.
// 책장 책 6권과 **같은 색을 쓴다**. 어느 권을 꺼내 왔는지가 곧 색이고,
// 꺼내 온 권의 책장 칸은 비어 있어야 한다(render.js visible).
//   p/P = 종이, d = 책등(어두운 쪽), C = 표지(밝은 쪽)
// 종이만 크게 그리면 어느 권인지 안 보인다(전부 흰 덩어리). 표지를 **테두리**로
// 둘러 좌우로 세워 보이게 해야 색이 읽힌다.
//   p=면 가장자리 P=지면 t=글줄 d=책등 C=표지 D=표지 그늘
// 17×8. 위로 갈수록 좁아져 바닥에 눕혀 펼친 원근이 된다.
// 세 판째. 앞의 둘이 틀린 건 디테일이 아니라 **크기와 자세**였다.
// 레퍼런스에서 돌은 책을 바닥에 눕혀 놓은 게 아니라 **몸 앞에 세워 들고** 있고,
// 책은 돌보다 한참 작다(돌 폭의 2/3). 19폭짜리 납작한 판은 책이 아니라
// 펼쳐 놓은 신문이었다 — 그래서 아무리 안쪽을 손봐도 안 나아졌던 것.
//   P=지면 p=종이 단(두께) t=글줄 d=책등 골 C=표지 D=표지 그늘
//
// 레퍼런스 재작화(폐기 후 새로 그림). 앞 판들이 놓친 것:
//   ① 지면 밑에 **두꺼운 표지 띠**가 받친다. 표지가 지면보다 **넓다** —
//      이게 없으면 종이만 바닥에 놓인 그림이라 책으로 안 읽힌다.
//   ② 그 사이에 종이 뭉치 **단면**(q) 한 줄 — 지면과 표지 사이의 두께.
//   ③ 지면 윗변이 책등에서 **파인다**. 일자로 자르면 판자다.
//   ④ 글줄은 끊긴 짧은 획을 행마다 길이를 바꿔서(5·6·5) — 같은 길이면 표가 된다.
//   P=지면 p=종이 가장자리 q=종이 뭉치 단면 t=글줄 d=책등 골 C=표지 D=표지 아랫단
// 18×10. 22폭은 러그 밖으로 나가고 어두운 방에서 혼자 커서 튀었다.
// 펼친 책 — 레퍼런스(design/reference/livingroom-ref3.png) 기준.
//
// 앞판 둘 다 실패했다. 첫 판은 좌우 대칭 직사각형에 검은 글줄을 그은 **하얀 판**,
// 둘째 판은 스프라이트만 따로 뽑아 보니 **가운데 2칸짜리 세로 기둥**과
// **바닥을 통째로 가로지르는 띠**여서 책이 아니라 나무 상자로 읽혔다.
// 레퍼런스를 다시 재서 고친 것:
//   ① **두 면의 높이가 다르다** — 왼쪽 면이 한 줄 먼저 시작하고, 오른쪽 면이
//      한 줄 늦게 끝난다. 같은 높이로 두면 슬라브 두 장이지 펼친 책이 아니다
//   ② 접힘은 **한 칸**(d) + 양옆 그늘 한 칸(t) = 3칸 골. 2칸짜리 기둥이 아니다.
//      그리고 **곧게 세우지 않는다** — col 9→8→7 로 기울여야 펼친 책이 눕혀진
//      각도가 생긴다. 수직이면 골이 아니라 기둥으로 읽힌다
//   ③ 명암을 **좁게** — 접힘 옆 한 칸만 그늘, 두 칸째만 중간, 나머지는 밝은 지면.
//      앞판은 아래 절반을 통째로 중간톤으로 깔아 지면이 갈색 덩어리가 됐다
//   ④ 표지는 각 면 **아래에만** 어긋나게 — 왼쪽은 r6, 오른쪽은 r7
//   ⑤ 글줄 없음 — 16px 폭에서 글줄은 글자가 아니라 줄무늬로만 읽힌다
// 지면은 --bp0(t)/--bp1(p)/--bp2(P), 접힘 d·표지 C 는 권별 색이라 문자를 남긴다. 16×8.
const OPENBOOK_ART = [
  '...PPPPptd......',
  '..PPPPPptdtpPP..',
  '.PPPPPPptdtpPPP.',
  'PPPPPPptdtpPPPPP',
  'PPPPPPptdtpPPPPP',
  'ppppppptdtpPPPPP',
  'CCCCCCCdtpppppp.',
  '.......CCCCCCCC.',
];

function openBook(n) {
  const map = { p: '--bp1', P: '--bp2', t: '--bp0', q: '--bp1',
                d: `--b${n}x0`, C: `--b${n}x1`, D: `--b${n}x0` };
  const out = [];
  OPENBOOK_ART.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      if (ch === '.') { i++; continue; }
      let k = i;
      while (k + 1 < row.length && row[k + 1] === ch) k++;
      // 러그 돌(캔버스 x56~69) **왼쪽 아래**에 눕힌다. 폭 16 → 캔버스 x40~55, y59~66.
      // 러그는 **원근 사다리꼴**이라 뒤로 갈수록 좁다(y59 는 x40~87, y66 은 x35~91).
      // x36 에 두면 뒤쪽 다섯 줄(y59~63)이 러그 왼쪽으로 최대 3칸 삐져나갔다 —
      // 러그를 벗어나면 깔개 위가 아니라 맨바닥에 던진 그림이 된다.
      // 제일 좁은 줄(y59, 왼끝 x40)에 맞춰야 전 줄이 안에 든다.
      // x 는 여기서 쓰는 값에 +16 이 붙어 캔버스 좌표가 된다 — 20 을 적으면 36 에 그려진다.
      // 레퍼런스는 책이 돌 바로 아래(돌밑변+8~15)인데, 내 방은 16:9 라 그 깊이가 없다
      // (캔버스가 72줄뿐). 그래서 위로 당기고 대신 **왼쪽으로** 비켰다 — 안 그러면 담요와 겹친다.
      // 러그 안에 온전히 들어가야 한다 — 밖으로 나가면 바닥에 떨어뜨린 그림이다.
      out.push([24 + i, 59 + j, k - i + 1, 1, map[ch]]);
      i = k + 1;
    }
  });
  return out;
}

// ─────────────────────── 여닫이 창 ───────────────────────
// 측정 창틀에는 세로 문설주(x46~47)와 중간 가로살(y21)이 **붙박이로 구워져** 있다.
// 창을 열려면 그게 사라져야 하므로 창틀에서 떼어내 따로 관리한다.
//   닫힘: 원래 자리 (win-sash)
//   열림: 두 짝이 양옆 문설주에 접힌 모습 (win-sash-open)
// 세로로 서서 옆으로 열리는 여닫이(casement)라 접히면 옆면만 좁게 보인다.
const SASH_MUL = [46, 47], MID_RAIL = 21;
const GLASS_L = [27, 45], GLASS_R = [48, 66], GLASS_Y = [4, 33];

/** 측정 창틀을 붙박이(뼈대)와 창짝으로 가른다 */
function splitWinframe(rects) {
  const frame = [], sash = [];
  for (const r of rects) {
    const [x, y, w, h] = r;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const cx = x + i, cy = y + j;
      const isMullion = cx >= SASH_MUL[0] && cx <= SASH_MUL[1]
                        && cy >= GLASS_Y[0] && cy <= GLASS_Y[1];
      const isRail = cy === MID_RAIL
                     && ((cx >= GLASS_L[0] && cx <= GLASS_L[1])
                      || (cx >= GLASS_R[0] && cx <= GLASS_R[1]));
      (isMullion || isRail ? sash : frame).push([cx, cy, 1, 1, r[4]]);
    }
  }
  return { frame, sash };
}

/** 열린 창짝 — 양옆 문설주 안쪽에 접혀 옆면만 보인다 */
function sashOpen(slot) {
  const out = [];
  for (const x0 of [GLASS_L[0], GLASS_R[1] - 2]) {
    for (let y = GLASS_Y[0]; y <= GLASS_Y[1]; y++) {
      out.push([x0, y, 3, 1, slot]);
      out.push([x0 === GLASS_L[0] ? x0 + 2 : x0, y, 1, 1, '--wd2']);  // 실내 쪽 모서리가 밝다
    }
    out.push([x0, MID_RAIL, 3, 1, '--wd2']);
  }
  return out;
}

// ─────────────────────── 창턱 선반 ───────────────────────
// 측정 창틀은 창턱이 x24~70 이라 창(x25~70) 기준으로 왼쪽만 1칸 튀어나온 짝짝이였다.
// 레퍼런스처럼 **양옆으로 똑같이** 내민 나무 선반으로 다시 놓는다.
// (레퍼런스의 다리 달린 벤치는 "창 아래엔 가구를 두지 않는다"에 걸리므로 선반만)
const WIN_L = 25, WIN_R = 70, SILL_OUT = 4;
function sillShelf() {
  const x0 = WIN_L - SILL_OUT, x1 = WIN_R + SILL_OUT, w = x1 - x0 + 1;
  return [
    [x0, 35, w, 1, '--wd2'],                 // 상판 — 빛 받는 면
    [x0, 36, w, 1, '--wd1'],
    [x0, 37, w, 1, '--wd1'],
    [x0 + 1, 38, w - 2, 1, '--wd0'],         // 밑면 그림자 = 두께
  ];
}

// ─────────────────────── 창턱에 쌓인 눈 ───────────────────────
// 실측 프롭은 창 위 처마(y2)에도 눈을 얹어 뒀는데, 방 안에서 보는 시점이라
// 바깥 처마 위 눈은 보일 리가 없다 — 벽에 흰 막대가 떠 있는 것처럼 보였다.
// 안에서 보이는 수평 턱은 가운데 문설주(y21)와 창턱(y34) 둘뿐이라 거기만 얹는다.
const WIN_APER = [27, 66], MULLION = [46, 47];
function snowCap() {
  const cells = [];
  for (const ledge of [21, 34]) {
    for (let x = WIN_APER[0]; x <= WIN_APER[1]; x++) {
      if (x >= MULLION[0] && x <= MULLION[1]) continue;       // 세로 문설주엔 안 쌓인다
      const d = h2(x, ledge, 140) % 100;
      if (d < 12) continue;                                    // 군데군데 비어 자연스럽게
      cells.push([ledge - 1, x, '--snow-p']);
      if (d > 72) cells.push([ledge - 2, x, '--snow-p']);      // 두툼하게 쌓인 자리
    }
  }
  return emitRows(cells);
}

// ─────────────────────────── 불꽃 ───────────────────────────
// 이전에는 정지 실루엣 3장을 scaleY 로 눌렀다 폈다 한 게 전부였다 — 모양이 안 변하니
// 불이 아니라 "숨쉬는 삼각형"으로 보였다. 프레임마다 실루엣 자체를 다시 만든다.
const TAU = Math.PI * 2;

/** 불꽃 프레임 n장. 반환: rects[][] — 렌더러가 t로 골라 그린다 */
function flameFrames(cx, baseY, w, h, salt, n, tones, sparks = 2) {
  const frames = [];
  for (let f = 0; f < n; f++) {
    const cells = [];
    const ph = (f / n) * TAU;
    for (let i = 0; i < h; i++) {
      const y = baseY - i, t = i / (h - 1);
      // 위로 갈수록 좁아지고, 혀가 옆으로 휜다. 휨은 높이에 비례해 커진다.
      // 진폭을 키우면 불이 춤을 춰서 산만하다 — 끝만 살짝 흔들리는 정도로 억제한다.
      const sway = (Math.sin(ph + t * 2.6) * 0.7 + Math.sin(ph * 2 + t * 4.1) * 0.3)
                   * Math.pow(t, 1.8) * w * 0.26;
      const wob = (h2(f, i, salt) / 100 - 0.5) * 0.25;
      const hw = (w / 2) * Math.pow(1 - t, 0.55)
                 * (1 + (h2(f, i, salt + 1) / 100 - 0.5) * 0.14) + wob;
      if (hw <= 0) continue;
      const c = cx + sway;
      const x0 = pyRound(c - hw), x1 = pyRound(c + hw) - 1;
      for (let x = x0; x <= x1; x++) {
        // 심지 쪽(아래·중앙)이 가장 뜨겁다 → 코어, 바깥·위로 갈수록 식는다
        const edge = Math.min(x - x0, x1 - x) / Math.max(1, hw);
        const heat = (1 - t) * 0.68 + edge * 0.32;
        const k = heat > 0.72 ? 2 : heat > 0.38 ? 1 : 0;
        cells.push([y, x, tones[k]]);
      }
    }
    // 불티: 도트 불의 불티는 **하나의 점이 살아가는 궤적**이다.
    // 프레임마다 무관한 위치에 찍으면 그냥 튀는 노이즈다. 규칙은 셋:
    //  ① 불꽃 끝에서 태어나 ② 프레임마다 위로 오르며 옆으로 흘러가고
    //  ③ 오르는 동안 식는다 (코어색 → 중간색 → 바깥색 → 소멸)
    const LIFE = 4;
    for (let s = 0; s < sparks; s++) {
      const born = (h2(s, 0, salt + 5) % n);              // 이 불티가 생기는 프레임
      const age = ((f - born) % n + n) % n;
      if (age >= LIFE) continue;
      const drift = (h2(s, 0, salt + 7) % 3) - 1;         // 이 불티가 흘러갈 방향
      const sy = baseY - h - age;                         // 불꽃 끝에서 한 칸씩 위로
      const sx = pyRound(cx + (h2(s, 0, salt + 3) / 100 - 0.5) * w * 0.4)
                 + pyRound(drift * age * 0.7);
      cells.push([sy, sx, [tones[2], tones[2], tones[1], tones[0]][age]]);
    }
    frames.push(emitRows(cells));
  }
  return frames;
}

/** 벽난로·책장의 실측 앞면 bbox (측정 아트 = 벽면 위치)
 *
 *  dir = 보이는 옆면. 소실점(x50.1)이 있는 **쪽** 면이 보인다:
 *    벽난로(중심 x10.5)는 소실점이 오른쪽 → 오른쪽 옆면
 *    책장  (중심 x86.5)는 소실점이 왼쪽   → 왼쪽 옆면
 *  방 한가운데서 볼 때 오른쪽 가구의 왼쪽 옆구리가 보이는 것과 같다.
 *
 *  **옆면은 앞면보다 밝아야 한다.** 두 옆면 다 창문(x27~66)을 마주 보기 때문이다.
 *  어둡게 칠하면 빛을 등진 면처럼 읽혀서 가구가 반대로 돌아앉은 것처럼 보인다.
 *  윗면(맨틀)은 위를 향하니 가장 밝다. */
export const BOXES = {
  'g-fireplace': { x0: 0, x1: 21, y0: 31, y1: 48, dir: +1, side: '--s9', top: '--s12' },
  // 책장 옆면도 나무 — 틀과 같은 재질이어야 한 덩어리로 읽힌다
  'g-shelf':     { x0: 78, x1: 95, y0: 16, y1: 48, dir: -1, side: '--wd1', top: null },
};
/** 상자에 얹혀 함께 앞으로 나와야 하는 것들 */
const ON_FIREPLACE = [];   // 향초 제거됨
const ON_SHELF = ['bk-1', 'bk-2', 'bk-3', 'bk-4', 'bk-5', 'bk-6',
                  // 2번째 칸 책 — 원래 g-shelf 에 묶여 있던 것을 떼어냈다
                  'bk2-1', 'bk2-2', 'bk2-3', 'bk2-4'];

/** 절차 그룹 전체를 만든다. 반환: { groupId: rects[] } (캔버스 좌표) */
export function generateGroups(measured = {}) {
  const wallRects = measured['g-wall'] || [];
  const scenery = [];
  for (let y = 0; y < GY; y++)
    for (let x = AX0; x < AX1; x++) scenery.push([y, x, synth(y, x)]);

  const floor = [];
  for (const [key, v] of floorCells())
    floor.push([Math.floor(key / 1000), (key % 1000) + AX0, v]);
  // 벽 접합부 AO — 맞닿는 곳의 어두움(허용 범위). 슬롯이 아니라 고정색이라 뒤에 덧그린다
  const floorAO = [[0, 49, 96, 1, '#120c14', 0.38],
                   [0, 50, 96, 1, '#120c14', 0.22],
                   [0, 51, 96, 1, '#120c14', 0.1]];

  const v1 = treeV1(), v2 = treeV2();
  const out = {
    'g-wall': wallPlane(wallRects),        // 측정 질감 + 메움 = 벽 한 장
    'base-scenery': emitRows(scenery),
    // 후광: 해는 작고 단단하게, 달은 크고 부드럽게 (달이 큰 게 예쁘다는 판단)
    'halo-sun': halo(58.5, 17.0, 13.0, 1.55),
    'halo-moon': halo(56.5, 16.5, 17.0, 1.25),
    // 날씨 — 아트 전폭. 창이 잘라주므로 넓혀도 방 안엔 안 보인다
    clouds: cloudBank(),
    // 비 = **실측 원본 밀도 그대로**. 원본은 창 폭 37에 1×3 방울 16개였으므로
    // 전폭(128) 환산 ≈ 55방울 → 간격 7 × 3패스. 이게 제일 나았던 판이다.
    rain: rainDrops('--rain', 7, 3, 3, 100),
    // 폭우 = 그 2.4배. 방울을 길게(4) 하고 더 촘촘히 뿌린다 — 모양은 같다.
    downpour: rainDrops('--rain', 5, 4, 5, 102),
    snow: fall('--snow-p', 5, 1, 104),
    // 꽃잎·낙엽은 **한 종류**다. 계절이 색을 정한다(--t2 = 나뭇잎 색 슬롯) —
    // 봄이면 분홍 꽃잎, 가을이면 마른 잎. 둘을 따로 두면 토글이 갈리는 데다
    // 봄에 '낙엽'을 켜면 꽃잎과 낙엽이 겹쳐 내리는 그림이 나왔다.
    'pt-petals': drift('--t2', 3, 106),
    'fx-snowcap': snowCap(),
    'sill-shelf': sillShelf(),
    'win-sash-open': sashOpen('--wd1'),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`p-openbook-${n}`, openBook(n)])),
    'g-floor': [...emitRows(floor), ...floorAO],
    rug: emitRows(rugCells()),
    orb: ball(SILL_ROWS),
    'orb-rug': ball(RUG_ROWS),
    'rim-orb': rim(SILL_ROWS),
    'rim-orb-rug': rim(RUG_ROWS),
    // 겨울엔 잎만 감추고 줄기는 남긴다 → 따로 내보낸다
    // v1 잎은 겹쳐 그리는 게 의도(본체 위에 명부·스펙클) → run-merge 하지 않는다
    'tree-v1-trunk': v1.trunk,
    'tree-v1-leaves': v1.leaves,
    'tree-v2-trunk': v2.trunk,
    'tree-v2-leaves': emitRows(v2.leaves),
  };
  // 불꽃 프레임 — 그룹 하나당 한 장씩 내보내고 렌더러가 t로 골라 그린다
  // 불꽃·촛불도 벽난로와 함께 앞으로 나온다 — 실측 위치(불 x8~17/y40~47,
  // 심지 (5,28))를 그대로 fwd 로 옮겨 계산한다. 크기도 같은 배율로 커진다.
  flameFrames(fwdX(12), pyRound(fwdY(47)), 8 * BOX_FW, pyRound(8 * BOX_FW),
              120, FLAME_N, ['--f0', '--f1', '--f3'])
    .forEach((rs, i) => { out[`fire-f${i}`] = rs; });
  candleFrames(pyRound(fwdX(5)), pyRound(fwdY(28)) - 1, ['--f0', '--cd2', '--sun1'])
    .forEach((rs, i) => { out[`cflame-f${i}`] = rs; });
  out['lamp-glow'] = lampGlow();
  Object.assign(out, buildRoomProps());          // 상점 소품·대사 사물
  // 개어 둔 담요는 책장 아래 칸에 얹혀 있다 → 책장과 **같은 배율**로 끌어내야
  // 선반 안에 들어가 있는 것으로 보인다. 안 하면 선반 뒤에 붙은 천이 된다.
  if (out['p-blanket']) out['p-blanket'] = pullForward(out['p-blanket']);

  // 벽난로·책장을 앞으로 끌어내 깊이를 준다. 얹힌 것들도 같은 변환으로 따라간다.
  const DETAIL = { 'g-fireplace': fireplaceDetail, 'g-shelf': shelfDetail };
  for (const [id, b] of Object.entries(BOXES)) {
    if (!measured[id]) continue;
    // 구조 보정은 측정 아트 **뒤에** 붙여야 위에 덮인다
    out[id] = [...boxFaces(b.x0, b.x1, b.y0, b.y1, b.dir, b.side, b.top),
               ...pullForward([...measured[id], ...DETAIL[id](measured[id])])];
  }
  for (const id of [...ON_FIREPLACE, ...ON_SHELF])
    if (measured[id]) out[id] = pullForward(measured[id]);

  // 창틀에서 창짝(문설주·중간살)을 떼어낸다 — 열림 상태에서 사라져야 하므로
  if (measured['g-winframe']) {
    const { frame, sash } = splitWinframe(measured['g-winframe']);
    out['g-winframe'] = emitRows(frame.map(([x, y, , , s]) => [y, x, s]));
    out['win-sash'] = emitRows(sash.map(([x, y, , , s]) => [y, x, s]));
  }
  // 아트 좌표 → 캔버스 좌표 (여기서 한 번만 옮긴다)
  for (const rects of Object.values(out)) for (const r of rects) r[0] += OX;
  return out;
}

export { GX, GY, OX, AW, h2, emitRows };
