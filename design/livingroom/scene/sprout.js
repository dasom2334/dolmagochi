// 돌 위 새싹 — **세 방이 공유한다**(거실·침실·주방). 같은 돌 위에 같은 싹이 난다.
import { stoneRows, STONE_ASPECT, emitRows } from './generate.js';

// ── 돌 위 새싹 ──────────────────────────────────────────────────────────
// 기획서 §179 가 기준이다: 성장 단계 **새싹 → 뿌리 내림 → 뒤덮임 → 보이지 않음**,
// 시듦은 "잎의 **처짐·탈색**", 그리고 **뿌리 진행은 불가역**.
// 코드(`src/game/sprout.ts` SproutStage)와 맞물린다:
//   budding(티어6 전조) / thriving(빈자리) / rooting1(뿌리 내림) / rooting2(뒤덮임)
//   / 숫자(동거 시듦 단계) — planted 이후엔 null(묘목이 땅으로 갔다 = 보이지 않음)
//
// [왜 단계×시듦을 다 안 그리는가]
// 시듦은 **단계와 직교하는 축**(`witherLevel` 0~3)이지 별개 그림이 아니다. 20장을
// 손으로 그리면 고칠 때 20장을 고쳐야 한다 → 잎마다 **떨어지는 순서**('1'이 먼저,
// '3'이 끝까지)를 글자로 새기고, 시듦이 오르면 바깥 잎부터 지우고 색을 탈색시킨다.
// 뿌리 단계엔 시듦이 안 붙는다 — 게임도 `witherLevel = 0` 으로 리셋한다
// (stateMachine.ts: `if (!next.planted && sproutGrowth >= ROOTING_AT) witherLevel = 0`).
// **위도 같이 자란다.** 1차엔 뿌리 단계에서 잎 그림을 thriving 으로 돌려 써서
// 뿌리만 굵어지고 싹은 그대로였다 — 그건 "자라는 중"이 아니라 "돌이 썩는 중"이다.
// 기획서 §179 는 묘목이 자라 나무가 되는 이야기다 → 단계마다 판을 키운다.
// [수관이 다이아몬드로 보였던 이유] rooting 판을 위->가운데로 넓어졌다 좁아지는
// **대칭 마름모**로 짰다. 나무 수관은 대칭이 아니다 — 왼쪽 어깨가 낮고 오른쪽이
// 뻗는 식으로 **울퉁불퉁한 비대칭 덩어리**여야 하고, 줄기가 수관보다 길어야
// 나무로 읽힌다(수관:줄기 비율이 1:1 을 넘으면 막대사탕이 된다).
const SPROUT_ART = {
  budding:  ['......', '......', '......', '..21..', '..s...', '..s...'],
  thriving: ['..11..', '.1221.', '123321', '.2332.', '..ss..', '..s...'],
  rooting1: ['..112...', '.122211.', '12232221', '.223221.',
    '...ss...', '...s....', '...s....'],
  rooting2: ['..112.....', '.1222111..', '1223222211', '.223332221',
    '..233322..', '...2332...', '....ss....', '....s.....', '...ss.....', '....s.....'],
};
// 시듦 0~3 — 잎 [그늘, 밝음]. 초록 → 누렇게 → 갈색 (탈색)
const LEAF = [['#4a7a3a', '#6fa851'], ['#5a7a3a', '#7a9a4a'],
  ['#6b6a34', '#8a8548'], ['#6b5a2e', '#7d6b38']];
const STEM = ['#7a6a3a', '#7a6a3a', '#6f6034', '#5e5029'];

// ── 뿌리 ────────────────────────────────────────────────────────────────
// [1차가 못생겼던 이유] 정수리에서 **직선 1픽셀**을 아래로 내리 그었다. 그래서
//  (a) 돌의 곡면을 무시하고 실루엣 밖으로 삐져나오고, (b) 굵기가 한결같아
//  뿌리가 아니라 **빗금**으로 읽혔고, (c) 세로선만이라 얽힌 느낌이 없었다.
// → 돌 몸통 줄(`stoneRows` 의 [y, x0, x1, t])을 받아 **그 줄의 폭 안에서** 자리를
//   잡는다. 자동으로 곡면을 타고 휘고 밖으로 안 나간다. 굵기는 위가 굵고 아래로
//   가늘어지며(뿌리는 뻗을수록 가늘다), 가로 이음뿌리를 넣어 그물로 만든다.
const ROOT_C = ['#8a7150', '#6b573a', '#4a3b26', '#33291a'];
function roots(rows, level) {
  const o = [];
  if (!level) return o;
  const reach = level === 1 ? 0.62 : 1.0;
  for (const [y, x0, x1, t] of rows) {
    if (t > reach) continue;
    const w = x1 - x0 + 1;
    const sh = t < 0.25 ? 0 : t < 0.55 ? 1 : t < 0.8 ? 2 : 3;   // 돌과 같은 AO 를 따른다
    if (level === 2) {
      // [2차가 바구니로 보였던 이유] 세로 가닥 + 두 줄마다 가로 이음 = **규칙적인
      // 격자**다. 격자 사이로 돌이 네모나게 비쳐 엮은 바구니가 됐다.
      // → 순서를 뒤집는다: **먼저 덮고, 그다음 골을 판다.** 뒤덮임은 덮인 게 먼저다.
      o.push([x0, y, w, 1, ROOT_C[sh]]);
      if (y % 5 === 0) o.push([x0, y, w, 1, ROOT_C[Math.max(0, sh - 1)]]);  // 가로로 뻗은 굵은 뿌리
      for (let k = 0; k < 3; k++) {                            // 뿌리 사이 골 — 줄마다 흔든다
        const f = 0.2 + k * 0.3 + Math.sin(t * 7 + k * 2.3) * 0.1;
        o.push([Math.round(x0 + (w - 1) * f), y, 1, 1, ROOT_C[3]]);
      }
    } else {
      for (let k = 0; k < 3; k++) {                            // 굵은 가닥 셋이 타고 내려온다
        const f = 0.18 + k * 0.31 + Math.sin(t * 6 + k * 1.9) * 0.06;
        const x = Math.round(x0 + (w - 1) * f);
        o.push([x, y, Math.min(w, t < 0.35 ? 3 : 2), 1, ROOT_C[(k + sh) % 4]]);
      }
    }
  }
  return o;
}

/**
 * 돌 하나 위의 새싹. **방을 모른다** — 돌의 (중심, 밑변, 폭)만 받는다.
 * 그래서 거실·침실·주방이 같은 함수를 쓰고, 돌 자리를 옮기면 싹도 따라온다.
 * stage: budding|thriving|rooting1|rooting2 (그 외/없음 = 빈 배열), wither: 0~3
 */
export function sproutArt(cx, baseY, w, stage, wither = 0) {
  if (!stage || stage === 'none') return [];
  const g = SPROUT_ART[stage];
  if (!g) return [];
  const rows = stoneRows(cx, baseY, w, Math.round(w / STONE_ASPECT));
  const top = rows[0][0];                                  // 돌 윗변
  const rooting = stage === 'rooting1' ? 1 : stage === 'rooting2' ? 2 : 0;
  // 시듦은 뿌리내림(rooting1)까지 탄다 — 아직 잎이 마를 수 있는 나무다.
  // **뒤덮임(rooting2)만 면역** — 더는 반응하지 않는 상태라 시듦도 없다.
  const wl = rooting === 2 ? 0 : Math.max(0, Math.min(3, Math.round(wither)));
  const [LD, LB] = LEAF[wl];
  // 판 크기는 단계마다 다르다(자라니까). 밑동 한 줄이 돌 윗변에 닿게 앉힌다.
  const x0 = cx - (g[0].length >> 1), y0 = top - (g.length - 1);
  const cells = [];
  g.forEach((row, r) => [...row].forEach((c, i) => {
    if (c === 's') cells.push([y0 + r, x0 + i, STEM[wl]]);
    else if (c >= '1' && c <= '3' && +c > wl)              // 시듦보다 늦게 지는 잎만 남는다
      cells.push([y0 + r, x0 + i, c === '3' ? LD : LB]);
  }));
  // 뿌리를 **잎보다 먼저** 깔면 안 된다 — 잎은 돌 위, 뿌리는 돌 위로 지나간다.
  return [...roots(rooting ? rows : [], rooting), ...emitRows(cells)];
}

