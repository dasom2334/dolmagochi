// 상점 소품 · 대사에 등장하는 사물 — 아트 좌표(96×72) 기준 수작화.
//
// 이 크기(대개 10px 안팎)에서는 절차 생성이 오히려 부정확하다. 문자 격자로 찍고
// 문자→팔레트 슬롯 맵을 따로 둔다. 슬롯이라 시간·계절·날씨 오버레이를 그대로 받는다.
//
//   . = 빈칸. 그 외 문자는 각 소품의 map 이 정의한다.
//
// 배치 제약 (기획서):
//   - 창 아래(x27~66, y35~48)에는 가구를 두지 않는다
//   - 방당 대형 가구 2개까지 — 어느 걸 동시에 놓을지는 게임이 정한다
//
// 좌표는 [x, y] = 격자 왼쪽 위 모서리.

/** 공통 슬롯 — 재질별로 묶어 두면 소품이 늘어도 팔레트가 안 불어난다 */
export const PROP_SLOTS = {
  // 돌 방석 — 창턱 나무·불빛과 같이 놓이므로 웜톤(테라코타)
  '--cu0': '#6b3826', '--cu1': '#9a5533', '--cu2': '#c47c4a',   // 방석(웜)
  // 가구 나무 — 채도를 올리면 보라 계열 방에서 혼자 튄다. 레퍼런스처럼 **눌린 갈색**으로.
  '--wd0': '#33262a', '--wd1': '#4d3b36', '--wd2': '#6a5347',   // 나무(책장·창턱선반)
  // 벽난로 돌 — 나무와 같은 계열이되 조금 더 회색으로(레퍼런스도 둘이 가깝다)
  '--st0': '#2b2228', '--st1': '#463a3d', '--st2': '#61504c', '--st3': '#7a6357',
  '--mt0': '#3f444c', '--mt1': '#666d78', '--mt2': '#949ca8',   // 금속
  '--cer0': '#7d838b', '--cer1': '#b9c0c8', '--cer2': '#e2e7ec', // 도자기
  '--lqt': '#7a4622', '--lqw': '#4a6f8e',                        // 액체(차 / 물)
  '--fb0': '#4f4059', '--fb1': '#6f5c79', '--fb2': '#8f7c98',   // 천(담요)
  '--bd0': '#3d3028', '--bd1': '#7b6450', '--bd2': '#c3ab8b',   // 새
  '--sd0': '#25563d', '--sd1': '#3f8a5c', '--sd2': '#6fb98a',   // 탄산캔
  '--gl0': '#9fb6c6', '--gl1': '#cfe0ea',                        // 유리
};

/** [x, y, 격자, 문자→슬롯] */
export const ROOM_PROPS = {
  // 돌 방석 — 창턱 선반의 돌 자리. 창턱 돌은 x53~62(중심 57.5), 밑변 y35.
  // 돌 폭(10)보다 훨씬 넓게(18) 깔아야 양옆으로 삐져나와 '깔개'로 읽힌다 —
  // 좁으면 돌 밑에 낀 주황 선으로만 보인다.
  'p-cushion': [49, 33, [
    '..oooooooooooooo..',
    '.ommmmhhhhhhmmmmo.',
    'oommmmmmmmmmmmmmoo',
  ], { o: '--cu0', m: '--cu1', h: '--cu2' }],



  // 헌책 — 바닥에 쌓아 둔 책더미
  'p-bookstack': [30, 63, [
    '.aaaaaaa.',
    'aaaaaaaaa',
    '.bbbbbbb.',
    'bbbbbbbbb',
    '.ccccccc.',
  ], { a: '--b2x0', b: '--b4x0', c: '--b6x0' }],

  // 담요 — 돌이 없는 날 개어 둔 자리 (대사: dlg.absent.care)
  'p-blanket': [56, 64, [
    '.ffffffffff.',
    'fggggggggggf',
    'fggFFFFggggf',
    '.ffffffffff.',
  ], { f: '--fb0', g: '--fb1', F: '--fb2' }],

  // ── 바닥 ──────────────────────────────────────────────────
  // 흔들의자 — 대형. 이 크기에서는 살대를 성기게 그리면 사다리로 보인다 →
  // 등받이를 통짜 실루엣으로 두고 **틈으로** 살대를 표현한다.
  'p-rockingchair': [74, 50, [
    '..WWWWWWW..',
    '..WdddddW..',
    '..WdWWWdW..',
    '..Wd...dW..',
    '..WdWWWdW..',
    '..Wd...dW..',
    '..WdWWWdW..',
    '..Wd...dW..',
    '..WdWWWdW..',
    '..WWWWWWW..',
    '.WWWWWWWWW.',
    '.WsssssssW.',
    '.WsssssssW.',
    '.WWWWWWWWW.',
    '..d.....d..',
    '..d.....d..',
    '..d.....d..',
    '..d.....d..',
    '..d.....d..',
    '.RRRRRRRRR.',
    'R.........R',
  ], { W: '--wd2', d: '--wd0', s: '--cu1', R: '--wd1' }],






  // 찻잔 — 돌 방석 왼쪽, 창턱 선반 위(밑변 y35). 받침·손잡이·림까지 세밀화.
  // 오른쪽에 두면 스탠드(art x70~77)와 겹친다.
  'p-cup': [40, 31, [
    '.tttttt.',
    'cDDDDDch',
    'cbbbbbcH',
    '.cbbbc..',
    'ssssssss',
  ], { t: '--cer2', c: '--cer1', b: '--cer0', D: '--st0', h: '--cer1', H: '--cer0', s: '--cer0' }],

  // 내용물 — '따뜻한 차'를 채운 상태에만
  'p-cup-tea': [41, 32, [
    'LLLLL',
    '.LLL.',
  ], { L: '--lqt' }],

  // 김 — 채운 상태에만. 오르며 옅어진다
  'p-cup-steam': [41, 27, [
    '..w..',
    '.w.w.',
    'w...w',
    '.w.w.',
  ], { w: '--cer2' }],

  // 물컵 (대사: restAct.water / act.nurse)
  'p-waterglass': [14, 28, [
    'gg',
    'gg',
    'ww',
    'GG',
  ], { g: '--gl1', w: '--lqw', G: '--gl0' }],

  // 풍경(風磬) — 창 오른쪽 벽. 창을 열면 **대롱만** 흔들려야 하므로 따로 뗀다
  'p-windchime': [69, 3, [
    '..W..',
    '.WWW.',
    'WWWWW',
  ], { W: '--mt0' }],

  'p-windchime-tubes': [69, 6, [
    '..t..',
    '..t..',
    '.m.m.',
    '.m.m.',
    '.m.m.',
    '.m.m.',
    '..p..',
    '..p..',
  ], { t: '--wd0', m: '--mt2', p: '--wd1' }],

  // 창턱에 앉은 새 (대사: fore.bird)
  'p-bird': [40, 31, [
    '.BB..',
    'BBBBk',
    'bBBB.',
    '.ll..',
  ], { B: '--bd1', b: '--bd2', k: '--bd0', l: '--bd0' }],
};

/** 문자 격자 → rect. 가로 런 병합까지 여기서 한다 */
export function buildRoomProps() {
  const out = {};
  for (const [id, [ox, oy, art, map]] of Object.entries(ROOM_PROPS)) {
    const rects = [];
    art.forEach((row, j) => {
      let i = 0;
      while (i < row.length) {
        const ch = row[i];
        if (ch === '.') { i++; continue; }
        let k = i;
        while (k + 1 < row.length && row[k + 1] === ch) k++;
        const slot = map[ch];
        if (slot) rects.push([ox + i, oy + j, k - i + 1, 1, slot]);
        i = k + 1;
      }
    });
    out[id] = rects;
  }
  return out;
}
