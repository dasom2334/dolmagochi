// 절차 생성기 — gen.py 의 포팅. 결과가 Python과 **완전히 같아야** 한다.
// (tools/verify_port.mjs 가 _geom_ref.json 과 대조한다)
//
// 여기서 만드는 것: 창밖 배경(하늘·산) / 마룻바닥 / 러그 / 돌 2종 + 역광 / 나무 2시안
// 레퍼런스 측정으로 뽑은 방 구조는 room-data.js 가 갖고 있다.
//
// rect 형식: [x, y, w, h, slot] — slot 은 색이 아니라 팔레트 자리 이름('--h3' 등)

const GX = 96, GY = 72;

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
const RIDGE_FAR = [[0,27],[6,24],[14,28],[22,25],[33,23],[40,27],[46,26],[52,24],
                   [58,26],[64,25],[70,28],[78,24],[86,27],[96,25]];
const RIDGE_MID = [[0,31],[10,29],[18,31],[28,28],[36,31],[44,30],[50,29],[57,31],
                   [64,29],[72,31],[82,29],[96,31]];
const RIDGE_NEAR = [[0,33],[14,32],[26,34],[38,33],[50,34],[62,32],[74,34],[86,33],[96,34]];

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
  let s = Math.max(0, Math.min(SKY_N - 1, pyRound((y - 4.0) / 2.1)));
  // 태양 후광은 방사형이라 밴드면 동심원 링이 보인다 → 여기만 해시 지터
  const d = Math.hypot(x - 56.5, (y - 16) * 1.55);
  if (d < 13.0) {
    const halo = SKY_N - 0.4 - d * 0.62 + h2(x, y, 60) / 100 - 0.5;
    s = Math.max(s, Math.max(0, Math.min(SKY_N - 1, pyRound(halo))));
  }
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
  const put = (y, x, v) => cell.set(y * GX + x, v);
  FLOOR_BANDS.forEach(([y0, y1], bi) => {
    const off = h2(bi, 1, 31) % PLANK_W_REF;
    const xrefs = [];
    for (let k = -4; k < 8; k++) xrefs.push(off + k * PLANK_W_REF);
    for (let y = y0; y <= y1; y++) {
      const s = perspS(y);
      for (let k = 0; k < xrefs.length - 1; k++) {
        const x0 = Math.max(0, pyRound(perspX(xrefs[k], y)));
        const x1 = Math.min(96, pyRound(perspX(xrefs[k + 1], y)));
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
      if (y === y0 && bi > 0) for (let xx = 0; xx < 96; xx++) put(y, xx, '--fbh');
      if (y === y1) for (let xx = 0; xx < 96; xx++) put(y, xx, '--fbk');
      // 맞댐 이음매 1px — 행마다 x가 이동해 결과적으로 소실점으로 기우는 선이 된다
      for (const xr of xrefs) {
        const jx = pyRound(perspX(xr, y));
        if (jx > 0 && jx < 96) put(y, jx, '--fbk');
      }
    }
  });
  return cell;
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

/** 절차 그룹 전체를 만든다. 반환: { groupId: rects[] } */
export function generateGroups() {
  const scenery = [];
  for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) scenery.push([y, x, synth(y, x)]);

  const floor = [];
  for (const [key, v] of floorCells()) floor.push([Math.floor(key / GX), key % GX, v]);
  // 벽 접합부 AO — 맞닿는 곳의 어두움(허용 범위). 슬롯이 아니라 고정색이라 뒤에 덧그린다
  const floorAO = [[0, 49, 96, 1, '#120c14', 0.38],
                   [0, 50, 96, 1, '#120c14', 0.22],
                   [0, 51, 96, 1, '#120c14', 0.1]];

  const v1 = treeV1(), v2 = treeV2();
  return {
    'base-scenery': emitRows(scenery),
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
}

export { GX, GY, h2, emitRows };
